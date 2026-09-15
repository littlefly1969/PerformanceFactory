import { BadRequestException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildAiCycleContext } from './cycle-context';
import { loadAreasForUser } from './cycle-generation';
import {
  buildTrainingPlanItems,
  buildTrainingQuestions,
  loadTrainingCoachContext,
  loadTrainingPromptInstruction,
} from './cycle-guidance';
import {
  loadTrainingCycleHistory,
  loadTrainingOlderCyclesSummary,
} from './cycle-history';
import { DEFAULT_TRAINING_ANSWER_OPTIONS } from './orchestrator-model';
import { loadScaleConfig } from './performance-scoring';
import {
  AiProposalProviderService,
  CycleProposalInput,
} from './proposal-provider.service';

export async function runTrainingPlanBatch(
  aiProposalProvider: AiProposalProviderService,
  prisma: PrismaService,
  userIds: string[],
  actorId: string,
) {
  if (!actorId) {
    throw new BadRequestException('ID attore mancante');
  }
  if (!userIds?.length) {
    throw new BadRequestException('ID utenti mancanti');
  }

  const results: Array<{ userId: string; trainingPlanReleaseId: string }> = [];
  for (const userId of userIds) {
    const result = await runTrainingPlan(
      aiProposalProvider,
      prisma,
      userId,
      actorId,
    );
    results.push({
      userId,
      trainingPlanReleaseId: result.trainingPlanReleaseId,
    });
  }
  return results;
}

export async function previewTrainingProposalInput(
  aiProposalProvider: AiProposalProviderService,
  prisma: PrismaService,
  userId: string,
) {
  const input = await prepareTrainingProposalInput(
    prisma,
    aiProposalProvider,
    userId,
    'Allenamento AI generato',
  );
  return aiProposalProvider.buildCycleProposalPreview(input);
}

export async function runTrainingPlan(
  aiProposalProvider: AiProposalProviderService,
  prisma: PrismaService,
  userId: string,
  actorId: string,
  reason = 'Allenamento AI generato',
) {
  const proposalInput = await prepareTrainingProposalInput(
    prisma,
    aiProposalProvider,
    userId,
    reason,
  );
  const proposal =
    await aiProposalProvider.generateCycleProposal(proposalInput);

  return prisma.$transaction(async (tx) => {
    const trainingContext = await loadTrainingCoachContext(tx, userId);
    const existingPending = await tx.trainingPlanRelease.findFirst({
      where: { userId, status: 'PENDING_APPROVAL' },
      select: { id: true },
    });
    if (existingPending) {
      throw new BadRequestException(
        'Esiste gia un allenamento in attesa di approvazione',
      );
    }

    const previousSnapshot = await tx.performanceProfileSnapshot.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const lastPlan = await tx.trainingPlanRelease.findFirst({
      where: { userId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (lastPlan?.version ?? 0) + 1;

    const trainingPlan = await tx.trainingPlanRelease.create({
      data: {
        userId,
        specializationId: trainingContext.specializationId,
        version: nextVersion,
        status: 'PENDING_APPROVAL',
        cycleStatus: 'WAITING_APPROVALS',
        generatedBy: 'AI',
        summaryText: proposal.summaryText,
        outputJson: proposal.audit.outputJson as Prisma.InputJsonObject,
        provider: proposal.provider,
        model: proposal.model,
        promptVersion: proposal.promptVersion,
        promptHash: proposal.promptHash,
        sourceSnapshotId: previousSnapshot?.id ?? null,
        proposedByAdminId: actorId,
        items: { create: buildTrainingPlanItems(proposal) },
      },
      select: { id: true, version: true },
    });

    const questionSet = await tx.trainingQuestionSet.create({
      data: {
        userId,
        trainingPlanReleaseId: trainingPlan.id,
        specializationId: trainingContext.specializationId,
        type: 'AI_TRAINING',
        status: 'PENDING_APPROVAL',
        questions: { create: buildTrainingQuestions(proposal) },
        approvals: {
          create: {
            coachId: trainingContext.coachId,
            status: 'PENDING',
          },
        },
      },
      select: { id: true },
    });

    await tx.aiContextSummary.create({
      data: {
        userId,
        summaryText: proposal.summaryText,
        summaryJson: {
          trainingPlanReleaseId: trainingPlan.id,
          trainingQuestionSetId: questionSet.id,
          specializationId: trainingContext.specializationId,
          coachId: trainingContext.coachId,
          provider: proposal.provider,
          model: proposal.model,
          promptVersion: proposal.promptVersion,
          planVersion: trainingPlan.version,
          humanReviewRequired: true,
        },
        cycleStatus: 'WAITING_APPROVALS',
      },
    });

    await tx.aiProposalAudit.create({
      data: {
        userId,
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

    return {
      trainingPlanReleaseId: trainingPlan.id,
      trainingQuestionSetId: questionSet.id,
    };
  });
}

export async function prepareTrainingProposalInput(
  prisma: PrismaService,
  aiProposalProvider: AiProposalProviderService,
  userId: string,
  reason: string,
): Promise<CycleProposalInput> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!user || user.role !== UserRole.USER || !user.isActive) {
    throw new BadRequestException('Utente non valido');
  }

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

  const trainingPromptInstruction = await loadTrainingPromptInstruction(
    prisma,
    userId,
  );
  if (!trainingPromptInstruction) {
    throw new BadRequestException(
      'Prompt allenamento non configurato per la sport-specializzazione utente',
    );
  }

  const [
    previousSnapshot,
    lastPlan,
    scale,
    history,
    olderCyclesSummary,
    onboardingAssessment,
    enabledAreas,
    goal,
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
    prisma.trainingPlanRelease.findFirst({
      where: { userId },
      orderBy: { version: 'desc' },
      select: { version: true },
    }),
    loadScaleConfig(prisma),
    loadTrainingCycleHistory(prisma, userId),
    loadTrainingOlderCyclesSummary(
      prisma,
      aiProposalProvider,
      userId,
      trainingPromptInstruction.id,
      `${trainingPromptInstruction.sport.label} - ${trainingPromptInstruction.label}`,
    ),
    prisma.userOnboardingAssessment.findUnique({
      where: { userId },
      select: { answersJson: true, profileJson: true },
    }),
    loadAreasForUser(prisma, userId),
    prisma.userPerformanceGoal.findUnique({
      where: { userId },
      select: { goalText: true },
    }),
  ]);

  const enabledAreaIds = new Set(enabledAreas.map((area) => area.id));
  const filteredSnapshot = previousSnapshot
    ? {
        ...previousSnapshot,
        areas: previousSnapshot.areas.filter((area) =>
          enabledAreaIds.has(area.areaId),
        ),
      }
    : null;

  const area = { id: 'training', name: 'Allenamento specifico' };
  const nextVersion = (lastPlan?.version ?? 0) + 1;
  const context = buildAiCycleContext({
    userId,
    area,
    nextVersion,
    reason,
    scale,
    previousSnapshot: filteredSnapshot,
    history,
    olderCyclesSummary,
    onboardingAssessment,
    areaLevel: 'TRAINING',
    areaGenerationConfig: {
      initialContext:
        'Sei un assistente senior di sport performance. Genera un allenamento autonomo e specifico per sport-specializzazione usando solo il contesto atleta fornito. Non generare un ciclo di area specialistica.',
      responseFormatPrompt:
        'La risposta deve contenere un allenamento reale, operativo e direttamente eseguibile, con struttura, intensita, volume, recuperi, criteri di successo, progressione e domande di monitoraggio se richieste.',
      questionnaireLayoutJson: {
        questionnaire: {
          questions: 3,
          answerOptions: DEFAULT_TRAINING_ANSWER_OPTIONS,
        },
      },
      version: trainingPromptInstruction.trainingPromptVersion,
      activePromptVersionId:
        trainingPromptInstruction.activeTrainingPromptVersionId,
    },
    userAreaPromptInstruction: goal
      ? {
          promptText: `Obiettivo atleta: ${goal.goalText}`,
          promptVersion: 'training-goal-context-v1',
          updatedAt: new Date(),
          goal,
        }
      : null,
    sportSpecializationPromptInstruction: null,
    trainingPromptInstruction,
  });

  return {
    userId,
    area,
    nextVersion,
    reason,
    scale,
    previousSnapshot: filteredSnapshot,
    context,
  };
}
