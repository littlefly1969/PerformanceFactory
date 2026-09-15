import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AiCycleContext,
  AiProposalProviderService,
} from '../ai-orchestrator/proposal-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEvaluationRunDto,
  PromptVariantDto,
} from './dto/create-evaluation-run.dto';
import { RateEvaluationResultDto } from './dto/rate-evaluation-result.dto';

export async function listEvaluationRuns(prisma: PrismaService) {
  return prisma.aiEvaluationRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      _count: { select: { results: true } },
    },
  });
}

export async function getEvaluationRun(prisma: PrismaService, runId: string) {
  const run = await prisma.aiEvaluationRun.findUnique({
    where: { id: runId },
    include: {
      results: {
        include: {
          goldenContext: { include: { area: { select: { name: true } } } },
        },
        orderBy: [{ variantLabel: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });
  if (!run) throw new NotFoundException(`Run ${runId} non trovato`);
  return run;
}

export async function createEvaluationRun(
  prisma: PrismaService,
  logger: Logger,
  proposalProvider: AiProposalProviderService,
  actorId: string,
  dto: CreateEvaluationRunDto,
) {
  const goldens = await prisma.aiGoldenContext.findMany({
    where: { id: { in: dto.goldenContextIds } },
  });
  if (goldens.length !== dto.goldenContextIds.length) {
    throw new BadRequestException('Alcuni golden context non esistono');
  }
  const run = await prisma.aiEvaluationRun.create({
    data: {
      name: dto.name,
      status: 'PENDING',
      createdById: actorId,
      goldenContextIds: dto.goldenContextIds,
      initialContextVariants: dto.variants.map((v) => ({
        label: v.label,
        value: v.initialContext ?? null,
      })) as unknown as Prisma.InputJsonValue,
      responseFormatVariants: dto.variants.map((v) => ({
        label: v.label,
        value: v.responseFormatPrompt ?? null,
      })) as unknown as Prisma.InputJsonValue,
    },
  });
  setImmediate(() => {
    executeEvaluationRun(
      prisma,
      proposalProvider,
      run.id,
      goldens,
      dto.variants,
    ).catch((error) => {
      logger.error(
        `Evaluation run ${run.id} fallita: ${error instanceof Error ? error.message : error}`,
      );
    });
  });
  return run;
}

export async function executeEvaluationRun(
  prisma: PrismaService,
  proposalProvider: AiProposalProviderService,
  runId: string,
  goldens: Array<{
    id: string;
    areaId: string;
    contextJson: Prisma.JsonValue;
  }>,
  variants: PromptVariantDto[],
) {
  await prisma.aiEvaluationRun.update({
    where: { id: runId },
    data: { status: 'RUNNING', startedAt: new Date() },
  });
  const scale = await prisma.performanceScaleConfig.findFirst({
    where: { isActive: true },
  });
  if (!scale) {
    await prisma.aiEvaluationRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: 'Nessuna scala performance attiva',
      },
    });
    return;
  }
  let hadFailure = false;
  for (const golden of goldens) {
    const areaConfig = await prisma.aiAreaGenerationConfig.findUnique({
      where: { areaId: golden.areaId },
    });
    for (const variant of variants) {
      try {
        const context = golden.contextJson as unknown as AiCycleContext;
        const replayContext: AiCycleContext = {
          ...context,
          guidance: {
            areaGenerationConfig: {
              initialContext:
                variant.initialContext ?? areaConfig?.initialContext ?? '',
              responseFormatPrompt:
                variant.responseFormatPrompt ??
                areaConfig?.responseFormatPrompt ??
                '',
              questionnaireLayoutJson:
                (areaConfig?.questionnaireLayoutJson as unknown) ?? null,
            },
            userAreaPromptInstruction:
              context.guidance?.userAreaPromptInstruction ?? null,
            sportSpecializationPromptInstruction:
              context.guidance?.sportSpecializationPromptInstruction ?? null,
            trainingPromptInstruction:
              context.guidance?.trainingPromptInstruction ?? null,
            planItemRequirements: context.guidance?.planItemRequirements ?? [],
            questionnaireRequirements:
              context.guidance?.questionnaireRequirements ?? [],
            safetyRules: context.guidance?.safetyRules ?? [],
          },
        };
        const area = await prisma.area.findUnique({
          where: { id: golden.areaId },
        });
        const proposal = await proposalProvider.generateCycleProposal({
          userId: 'eval-run',
          area: { id: golden.areaId, name: area?.name ?? 'area' },
          nextVersion: 0,
          reason: `eval:${variant.label}`,
          scale: {
            minScore: scale.minScore,
            maxScore: scale.maxScore,
            potentialStep: scale.potentialStep,
            thresholdRatio: scale.thresholdRatio,
          },
          previousSnapshot: {
            id: 'eval-fake',
            rankingGlobal: 0,
            reason: 'eval',
            createdAt: new Date(),
            areas: [],
          },
          context: replayContext,
        });
        await prisma.aiEvaluationResult.create({
          data: {
            runId,
            goldenContextId: golden.id,
            areaConfigId: areaConfig?.id ?? null,
            variantLabel: variant.label,
            status: 'SUCCESS',
            input: proposal.audit.inputJson as Prisma.InputJsonObject,
            output: proposal.audit.outputJson as Prisma.InputJsonObject,
            provider: proposal.provider,
            model: proposal.model,
            durationMs: proposal.audit.latencyMs,
            inputTokens: proposal.audit.inputTokens ?? null,
            outputTokens: proposal.audit.outputTokens ?? null,
            totalTokens: proposal.audit.totalTokens ?? null,
            correlationId: proposal.audit.correlationId,
          },
        });
      } catch (error) {
        hadFailure = true;
        const message =
          error instanceof Error ? error.message : 'Errore sconosciuto';
        await prisma.aiEvaluationResult.create({
          data: {
            runId,
            goldenContextId: golden.id,
            areaConfigId: null,
            variantLabel: variant.label,
            status: 'FAILED',
            provider: 'unknown',
            model: 'unknown',
            errorMessage: message.slice(0, 1000),
          },
        });
      }
    }
  }
  await prisma.aiEvaluationRun.update({
    where: { id: runId },
    data: {
      status: hadFailure ? 'COMPLETED' : 'COMPLETED',
      completedAt: new Date(),
    },
  });
}

export async function rateEvaluationResult(
  prisma: PrismaService,
  actorId: string,
  resultId: string,
  dto: RateEvaluationResultDto,
) {
  return prisma.aiEvaluationResult.update({
    where: { id: resultId },
    data: {
      relevanceArea: dto.relevanceArea ?? null,
      planConcreteness: dto.planConcreteness ?? null,
      questionRelevance: dto.questionRelevance ?? null,
      tone: dto.tone ?? null,
      overall: dto.overall ?? null,
      notes: dto.notes ?? null,
      ratedById: actorId,
      ratedAt: new Date(),
    },
  });
}
