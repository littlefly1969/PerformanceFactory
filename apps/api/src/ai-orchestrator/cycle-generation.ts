import { BadRequestException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildAiCycleContext, levelFromSnapshot } from './cycle-context';
import {
  assertPreviousCycleCompleted,
  buildApprovals,
  buildPlanItems,
  buildQuestions,
  loadAreaGenerationConfig,
  loadSportSpecializationPromptInstruction,
} from './cycle-guidance';
import {
  loadAreaCycleHistory,
  loadAreaOlderCyclesSummary,
} from './cycle-history';
import { AreaRecord } from './orchestrator-model';
import { loadScaleConfig } from './performance-scoring';
import {
  AiProposalProviderService,
  CycleProposalInput,
} from './proposal-provider.service';

export async function runProposalBatch(
  prisma: PrismaService,
  aiProposalProvider: AiProposalProviderService,
  userIds: string[],
  actorId: string,
  areaId?: string,
  runAllAreas = true,
) {
  if (!actorId) {
    throw new BadRequestException('ID attore mancante');
  }
  if (!userIds?.length) {
    throw new BadRequestException('ID utenti mancanti');
  }

  if (areaId && runAllAreas) {
    throw new BadRequestException(
      'Scegli una sola area oppure esegui tutte le aree',
    );
  }

  const selectedAreas = areaId ? await loadArea(prisma, areaId) : null;

  const results: Array<{
    userId: string;
    areaId: string;
    planReleaseId: string;
    questionSetId: string;
  }> = [];
  for (const userId of userIds) {
    const areas =
      selectedAreas ??
      (runAllAreas ? await loadAreasForUser(prisma, userId) : []);
    if (areas.length === 0) {
      throw new BadRequestException('Nessuna area configurata per l utente');
    }
    for (const area of areas) {
      const result = await runCycleForArea(
        aiProposalProvider,
        prisma,
        userId,
        area,
        actorId,
      );
      results.push({ userId, areaId: area.id, ...result });
    }
  }
  return results;
}

export async function loadAreas(prisma: PrismaService) {
  return prisma.area.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export async function loadArea(prisma: PrismaService, areaId: string) {
  if (!areaId) {
    throw new BadRequestException('ID area mancante');
  }
  const area = await prisma.area.findUnique({
    where: { id: areaId },
    select: { id: true, name: true },
  });
  if (!area) {
    throw new BadRequestException('Area non valida');
  }
  return [area];
}

export async function loadAreasForUser(prisma: PrismaService, userId: string) {
  const selection = await prisma.userSportSelection.findUnique({
    where: { userId },
    select: { specializationId: true },
  });
  if (!selection) {
    return loadAreas(prisma);
  }
  const prompts = await prisma.sportSpecializationAreaPrompt.findMany({
    where: {
      specializationId: selection.specializationId,
      isActive: true,
      isEnabledDriver: true,
    },
    select: { area: { select: { id: true, name: true } } },
    orderBy: { area: { name: 'asc' } },
  });
  return prompts.length
    ? prompts.map((prompt) => prompt.area)
    : loadAreas(prisma);
}

export async function runCycleForArea(
  aiProposalProvider: AiProposalProviderService,
  prisma: PrismaService,
  userId: string,
  area: AreaRecord,
  actorId: string,
  reason = 'Ciclo AI generato',
) {
  if (!userId) {
    throw new BadRequestException('ID utente mancante');
  }
  if (!actorId) {
    throw new BadRequestException('ID attore mancante');
  }

  const proposalInput = await prepareCycleProposalInput(
    prisma,
    aiProposalProvider,
    userId,
    area,
    reason,
  );
  const proposal =
    await aiProposalProvider.generateCycleProposal(proposalInput);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user || user.role !== UserRole.USER || !user.isActive) {
      throw new BadRequestException('Utente non valido');
    }

    const existingPending = await tx.improvementPlanRelease.findFirst({
      where: { userId, areaId: area.id, status: 'PENDING_APPROVAL' },
      select: { id: true },
    });
    if (existingPending) {
      throw new BadRequestException(
        'Esiste gia un ciclo in attesa per questa area',
      );
    }

    await assertPreviousCycleCompleted(tx, userId, area.id);

    const previousSnapshot = await tx.performanceProfileSnapshot.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const lastPlan = await tx.improvementPlanRelease.findFirst({
      where: { userId, areaId: area.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (lastPlan?.version ?? 0) + 1;

    const plan = await tx.improvementPlanRelease.create({
      data: {
        userId,
        areaId: area.id,
        version: nextVersion,
        status: 'PENDING_APPROVAL',
        generatedBy: 'AI',
        sourceSnapshotId: previousSnapshot?.id ?? null,
        cycleStatus: 'WAITING_APPROVALS',
        proposedByAdminId: actorId,
        items: { create: buildPlanItems(area, proposal) },
      },
      select: { id: true, version: true },
    });

    const questionSet = await tx.questionSet.create({
      data: {
        userId,
        planReleaseId: plan.id,
        areaId: area.id,
        type: 'AI_CYCLE',
        status: 'PENDING_APPROVAL',
        questions: { create: buildQuestions(area, proposal) },
        approvals: {
          create: await buildApprovals(tx, userId, area),
        },
      },
      select: { id: true },
    });

    await tx.aiContextSummary.create({
      data: {
        userId,
        summaryText: proposal.summaryText,
        summaryJson: {
          planReleaseId: plan.id,
          questionSetId: questionSet.id,
          areaId: area.id,
          provider: proposal.provider,
          model: proposal.model,
          promptVersion: proposal.promptVersion,
          planVersion: plan.version,
          humanReviewRequired: true,
        },
        cycleStatus: 'WAITING_APPROVALS',
        planReleaseId: plan.id,
      },
    });

    await tx.aiProposalAudit.create({
      data: {
        userId,
        planReleaseId: plan.id,
        questionSetId: questionSet.id,
        provider: proposal.provider,
        model: proposal.model,
        promptVersion: proposal.promptVersion,
        promptHash: proposal.promptHash,
        status: proposal.audit.status,
        inputJson: proposal.audit.inputJson as Prisma.InputJsonObject,
        outputJson: proposal.audit.outputJson as Prisma.InputJsonObject,
        latencyMs: proposal.audit.latencyMs,
        correlationId: proposal.audit.correlationId,
        inputTokens: proposal.audit.inputTokens ?? null,
        outputTokens: proposal.audit.outputTokens ?? null,
        totalTokens: proposal.audit.totalTokens ?? null,
      },
    });

    await tx.cycleAuditLog.create({
      data: {
        userId,
        planReleaseId: plan.id,
        action: 'PROPOSAL_RUN',
        actorId,
      },
    });

    return {
      planReleaseId: plan.id,
      questionSetId: questionSet.id,
    };
  });
}

export async function previewCycleProposalInput(
  aiProposalProvider: AiProposalProviderService,
  prisma: PrismaService,
  userId: string,
  areaId: string,
  reason = 'Ciclo AI generato',
) {
  const [area] = await loadArea(prisma, areaId);
  const input = await prepareCycleProposalInput(
    prisma,
    aiProposalProvider,
    userId,
    area,
    reason,
  );
  return aiProposalProvider.buildCycleProposalPreview(input);
}

export async function prepareCycleProposalInput(
  prisma: PrismaService,
  aiProposalProvider: AiProposalProviderService,
  userId: string,
  area: AreaRecord,
  reason: string,
): Promise<CycleProposalInput> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  });

  if (!user || user.role !== UserRole.USER || !user.isActive) {
    throw new BadRequestException('Utente non valido');
  }

  const existingPending = await prisma.improvementPlanRelease.findFirst({
    where: { userId, areaId: area.id, status: 'PENDING_APPROVAL' },
    select: { id: true },
  });
  if (existingPending) {
    throw new BadRequestException(
      'Esiste gia un ciclo in attesa per questa area',
    );
  }

  await assertPreviousCycleCompleted(prisma, userId, area.id);

  if (AiProposalProviderService.requiresUserConsent()) {
    const consent = await prisma.consent.findFirst({
      where: {
        userId,
        type: { in: ['AI', 'AI_ASSISTANT'] },
        withdrawnAt: null,
      },
      select: { id: true },
    });
    if (!consent) {
      throw new BadRequestException(
        'Il consenso AI e obbligatorio per le proposte AI esterne',
      );
    }
  }

  const [
    previousSnapshot,
    lastPlan,
    scale,
    history,
    olderCyclesSummary,
    onboardingAssessment,
    currentState,
    areaGenerationConfig,
    userAreaPromptInstruction,
    sportSpecializationPromptInstruction,
  ] = await Promise.all([
    prisma.performanceProfileSnapshot.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        rankingGlobal: true,
        reason: true,
        createdAt: true,
        areas: {
          select: {
            areaId: true,
            realR: true,
            potentialP: true,
            area: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.improvementPlanRelease.findFirst({
      where: { userId, areaId: area.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    }),
    loadScaleConfig(prisma),
    loadAreaCycleHistory(prisma, userId, area.id),
    loadAreaOlderCyclesSummary(
      prisma,
      aiProposalProvider,
      userId,
      area.id,
      area.name,
    ),
    prisma.userOnboardingAssessment.findUnique({
      where: { userId },
      select: { answersJson: true, profileJson: true },
    }),
    prisma.currentState.findUnique({
      where: { userId_areaId: { userId, areaId: area.id } },
      select: { level: true, score: true },
    }),
    loadAreaGenerationConfig(prisma, area.id),
    prisma.userAreaPromptInstruction.findUnique({
      where: { userId_areaId: { userId, areaId: area.id } },
      select: {
        promptText: true,
        promptVersion: true,
        updatedAt: true,
        goal: { select: { goalText: true } },
      },
    }),
    loadSportSpecializationPromptInstruction(prisma, userId, area.id),
  ]);

  const nextVersion = (lastPlan?.version ?? 0) + 1;
  const areaLevel =
    currentState?.level ?? levelFromSnapshot(previousSnapshot, area.id);
  const context = buildAiCycleContext({
    userId,
    area,
    nextVersion,
    reason,
    scale,
    previousSnapshot,
    history,
    olderCyclesSummary,
    onboardingAssessment,
    areaLevel,
    areaGenerationConfig,
    userAreaPromptInstruction,
    sportSpecializationPromptInstruction,
    trainingPromptInstruction: null,
  });

  return {
    userId,
    area,
    nextVersion,
    reason,
    scale,
    previousSnapshot,
    context,
  };
}
