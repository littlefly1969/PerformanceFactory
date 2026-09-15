import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AiCycleContext,
  AiProposalProviderService,
  CycleProposalInput,
} from '../ai-orchestrator/proposal-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import { REPLAYS_PAGE_SIZE } from './ai-tuning-model';
import { RunReplayDto } from './dto/run-replay.dto';
import { SaveReplayFeedbackDto } from './dto/save-replay-feedback.dto';
import { TestPromptDto } from './dto/test-prompt.dto';
import { pseudonymizeUserId } from './tuning-audits';

export async function testPrompt(
  proposalProvider: AiProposalProviderService,
  dto: TestPromptDto,
) {
  return proposalProvider.testPrompt({
    prompt: dto.prompt,
    context: dto.context,
    provider: dto.provider,
  });
}

export async function runReplay(
  prisma: PrismaService,
  proposalProvider: AiProposalProviderService,
  actorId: string,
  dto: RunReplayDto,
) {
  const audit = await prisma.aiProposalAudit.findUnique({
    where: { id: dto.auditId },
    include: {
      planRelease: {
        select: { areaId: true, area: { select: { id: true, name: true } } },
      },
    },
  });
  if (!audit) {
    throw new NotFoundException(`Audit ${dto.auditId} non trovato`);
  }

  const inputJson = audit.inputJson as Prisma.JsonObject;
  const promptBlock = (inputJson?.prompt ?? {}) as Prisma.JsonObject;
  const userBlock = (promptBlock?.user ?? {}) as Prisma.JsonObject;
  const savedContext = userBlock?.context as AiCycleContext | undefined;
  if (!savedContext) {
    throw new BadRequestException(
      'Audit storico senza contesto: replay non disponibile',
    );
  }

  let areaId = audit.planRelease?.areaId;
  let areaName = audit.planRelease?.area?.name ?? null;
  if (!areaId) {
    const fallbackName = savedContext.targetArea?.name ?? null;
    if (!fallbackName) {
      throw new BadRequestException(
        'Impossibile risalire all area target per il replay',
      );
    }
    const area = await prisma.area.findFirst({
      where: { name: fallbackName },
    });
    if (!area) {
      throw new BadRequestException(
        `Area ${fallbackName} non trovata nel catalogo`,
      );
    }
    areaId = area.id;
    areaName = area.name;
  }

  const currentAreaConfig = await prisma.aiAreaGenerationConfig.findUnique({
    where: { areaId },
  });

  const initialContext =
    dto.initialContextOverride ?? currentAreaConfig?.initialContext ?? '';
  const responseFormatPrompt =
    dto.responseFormatPromptOverride ??
    currentAreaConfig?.responseFormatPrompt ??
    '';

  const scale = await prisma.performanceScaleConfig.findFirst({
    where: { isActive: true },
  });
  if (!scale) {
    throw new BadRequestException('Nessuna scala performance attiva');
  }

  const replayContext: AiCycleContext = {
    ...savedContext,
    guidance: {
      areaGenerationConfig: {
        initialContext,
        responseFormatPrompt,
        questionnaireLayoutJson:
          (currentAreaConfig?.questionnaireLayoutJson as unknown) ?? null,
      },
      userAreaPromptInstruction:
        savedContext.guidance?.userAreaPromptInstruction ?? null,
      sportSpecializationPromptInstruction:
        savedContext.guidance?.sportSpecializationPromptInstruction ?? null,
      trainingPromptInstruction:
        savedContext.guidance?.trainingPromptInstruction ?? null,
      planItemRequirements: savedContext.guidance?.planItemRequirements ?? [],
      questionnaireRequirements:
        savedContext.guidance?.questionnaireRequirements ?? [],
      safetyRules: savedContext.guidance?.safetyRules ?? [],
    },
  };

  const input: CycleProposalInput = {
    userId: audit.userId,
    area: { id: areaId, name: areaName ?? 'area' },
    nextVersion: 0,
    reason: 'replay',
    scale: {
      minScore: scale.minScore,
      maxScore: scale.maxScore,
      potentialStep: scale.potentialStep,
      thresholdRatio: scale.thresholdRatio,
    },
    previousSnapshot: {
      id: 'replay-fake',
      rankingGlobal: 0,
      reason: 'replay',
      createdAt: new Date(),
      areas: [],
    },
    context: replayContext,
  };

  const replayRecord = await prisma.aiPromptReplay.create({
    data: {
      sourceAuditId: audit.id,
      areaConfigId: currentAreaConfig?.id ?? null,
      createdById: actorId,
      initialContextOverride: dto.initialContextOverride ?? null,
      responseFormatOverride: dto.responseFormatPromptOverride ?? null,
      status: 'RUNNING',
      provider: '',
      model: '',
    },
  });

  try {
    const proposal = await proposalProvider.generateCycleProposal(input);
    const updated = await prisma.aiPromptReplay.update({
      where: { id: replayRecord.id },
      data: {
        status: 'SUCCESS',
        provider: proposal.provider,
        model: proposal.model,
        input: proposal.audit.inputJson as Prisma.InputJsonObject,
        output: proposal.audit.outputJson as Prisma.InputJsonObject,
        durationMs: proposal.audit.latencyMs,
        inputTokens: proposal.audit.inputTokens ?? null,
        outputTokens: proposal.audit.outputTokens ?? null,
        totalTokens: proposal.audit.totalTokens ?? null,
        correlationId: proposal.audit.correlationId,
      },
    });
    return {
      replay: updated,
      original: {
        outputJson: audit.outputJson,
        provider: audit.provider,
        model: audit.model,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Errore sconosciuto';
    await prisma.aiPromptReplay.update({
      where: { id: replayRecord.id },
      data: {
        status: 'FAILED',
        errorMessage: message.slice(0, 1000),
        provider: 'unknown',
        model: 'unknown',
      },
    });
    throw error;
  }
}

export async function listReplays(
  prisma: PrismaService,
  actorId: string,
  page = 1,
) {
  const skip = (Math.max(1, page) - 1) * REPLAYS_PAGE_SIZE;
  const [items, total] = await prisma.$transaction([
    prisma.aiPromptReplay.findMany({
      where: { createdById: actorId },
      orderBy: { createdAt: 'desc' },
      take: REPLAYS_PAGE_SIZE,
      skip,
      include: {
        sourceAudit: {
          select: {
            userId: true,
            planRelease: {
              select: { area: { select: { id: true, name: true } } },
            },
          },
        },
        feedback: true,
      },
    }),
    prisma.aiPromptReplay.count({ where: { createdById: actorId } }),
  ]);
  return {
    items: items.map((r) => ({
      id: r.id,
      sourceAuditId: r.sourceAuditId,
      athleteLabel: pseudonymizeUserId(r.sourceAudit.userId),
      area: r.sourceAudit.planRelease?.area ?? null,
      provider: r.provider,
      model: r.model,
      status: r.status,
      errorMessage: r.errorMessage,
      durationMs: r.durationMs,
      totalTokens: r.totalTokens,
      createdAt: r.createdAt,
      hasFeedback: r.feedback !== null,
      chosenSide: r.feedback?.chosenSide ?? null,
      overall: r.feedback?.overall ?? null,
    })),
    total,
    page,
    pageSize: REPLAYS_PAGE_SIZE,
  };
}

export async function getReplay(
  prisma: PrismaService,
  actorId: string,
  replayId: string,
) {
  const replay = await prisma.aiPromptReplay.findUnique({
    where: { id: replayId },
    include: {
      sourceAudit: {
        include: {
          planRelease: {
            select: {
              area: { select: { id: true, name: true } },
              version: true,
            },
          },
        },
      },
      feedback: true,
    },
  });
  if (!replay) {
    throw new NotFoundException(`Replay ${replayId} non trovato`);
  }
  if (replay.createdById !== actorId) {
    throw new NotFoundException(`Replay ${replayId} non disponibile`);
  }
  return {
    id: replay.id,
    sourceAudit: {
      id: replay.sourceAudit.id,
      athleteLabel: pseudonymizeUserId(replay.sourceAudit.userId),
      provider: replay.sourceAudit.provider,
      model: replay.sourceAudit.model,
      outputJson: replay.sourceAudit.outputJson,
      inputJson: replay.sourceAudit.inputJson,
      inputTokens: replay.sourceAudit.inputTokens,
      outputTokens: replay.sourceAudit.outputTokens,
      totalTokens: replay.sourceAudit.totalTokens,
      area: replay.sourceAudit.planRelease?.area ?? null,
      cycleVersion: replay.sourceAudit.planRelease?.version ?? null,
    },
    replay: {
      provider: replay.provider,
      model: replay.model,
      status: replay.status,
      input: replay.input,
      output: replay.output,
      errorMessage: replay.errorMessage,
      durationMs: replay.durationMs,
      inputTokens: replay.inputTokens,
      outputTokens: replay.outputTokens,
      totalTokens: replay.totalTokens,
      correlationId: replay.correlationId,
      initialContextOverride: replay.initialContextOverride,
      responseFormatOverride: replay.responseFormatOverride,
      createdAt: replay.createdAt,
    },
    feedback: replay.feedback,
  };
}

export async function saveReplayFeedback(
  prisma: PrismaService,
  actorId: string,
  replayId: string,
  dto: SaveReplayFeedbackDto,
) {
  const replay = await prisma.aiPromptReplay.findUnique({
    where: { id: replayId },
    select: { id: true, createdById: true },
  });
  if (!replay || replay.createdById !== actorId) {
    throw new NotFoundException(`Replay ${replayId} non disponibile`);
  }
  return prisma.aiReplayFeedback.upsert({
    where: { replayId },
    create: {
      replayId,
      chosenSide: dto.chosenSide,
      relevanceArea: dto.relevanceArea ?? null,
      planConcreteness: dto.planConcreteness ?? null,
      questionRelevance: dto.questionRelevance ?? null,
      tone: dto.tone ?? null,
      overall: dto.overall ?? null,
      notes: dto.notes ?? null,
      createdById: actorId,
    },
    update: {
      chosenSide: dto.chosenSide,
      relevanceArea: dto.relevanceArea ?? null,
      planConcreteness: dto.planConcreteness ?? null,
      questionRelevance: dto.questionRelevance ?? null,
      tone: dto.tone ?? null,
      overall: dto.overall ?? null,
      notes: dto.notes ?? null,
    },
  });
}
