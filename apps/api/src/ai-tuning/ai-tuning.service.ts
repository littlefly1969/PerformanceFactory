import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AiCycleContext,
  AiProposalProviderService,
  CycleProposalInput,
} from '../ai-orchestrator/proposal-provider.service';
import { RunReplayDto } from './dto/run-replay.dto';
import { SaveReplayFeedbackDto } from './dto/save-replay-feedback.dto';
import { UpsertGoldenContextDto } from './dto/upsert-golden-context.dto';
import {
  CreateEvaluationRunDto,
  PromptVariantDto,
} from './dto/create-evaluation-run.dto';
import { RateEvaluationResultDto } from './dto/rate-evaluation-result.dto';
import { TestPromptDto } from './dto/test-prompt.dto';

const AUDITS_PAGE_SIZE = 30;
const REPLAYS_PAGE_SIZE = 30;

@Injectable()
export class AiTuningService {
  private readonly logger = new Logger(AiTuningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly proposalProvider: AiProposalProviderService,
  ) {}

  pseudonymizeUserId(userId: string): string {
    const hash = createHash('sha256').update(userId).digest('hex');
    return `Atleta #${hash.substring(0, 8)}`;
  }

  async listAreas() {
    return this.prisma.area.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async listAreaConfigs() {
    return this.prisma.aiAreaGenerationConfig.findMany({
      include: { area: { select: { id: true, name: true } } },
      orderBy: { area: { name: 'asc' } },
    });
  }

  async listAudits(params: {
    areaId?: string;
    page?: number;
    provider?: string;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const skip = (page - 1) * AUDITS_PAGE_SIZE;
    const where: Prisma.AiProposalAuditWhereInput = {
      status: 'SUCCESS',
      user: { role: UserRole.USER },
    };
    if (params.areaId) {
      where.planRelease = { areaId: params.areaId };
    }
    if (params.provider) {
      where.provider = params.provider;
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.aiProposalAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: AUDITS_PAGE_SIZE,
        skip,
        select: {
          id: true,
          userId: true,
          createdAt: true,
          provider: true,
          model: true,
          promptVersion: true,
          latencyMs: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          planRelease: {
            select: {
              area: { select: { id: true, name: true } },
              version: true,
            },
          },
        },
      }),
      this.prisma.aiProposalAudit.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        athleteLabel: this.pseudonymizeUserId(row.userId),
        createdAt: row.createdAt,
        provider: row.provider,
        model: row.model,
        promptVersion: row.promptVersion,
        latencyMs: row.latencyMs,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        totalTokens: row.totalTokens,
        area: row.planRelease?.area ?? null,
        cycleVersion: row.planRelease?.version ?? null,
      })),
      total,
      page,
      pageSize: AUDITS_PAGE_SIZE,
    };
  }

  async getAuditDetail(auditId: string) {
    const row = await this.prisma.aiProposalAudit.findUnique({
      where: { id: auditId },
      include: {
        planRelease: {
          select: {
            id: true,
            areaId: true,
            version: true,
            area: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException(`Audit ${auditId} non trovato`);
    }
    const areaConfig = row.planRelease?.areaId
      ? await this.prisma.aiAreaGenerationConfig.findUnique({
          where: { areaId: row.planRelease.areaId },
        })
      : null;
    return {
      id: row.id,
      athleteLabel: this.pseudonymizeUserId(row.userId),
      createdAt: row.createdAt,
      provider: row.provider,
      model: row.model,
      promptVersion: row.promptVersion,
      promptHash: row.promptHash,
      latencyMs: row.latencyMs,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.totalTokens,
      area: row.planRelease?.area ?? null,
      cycleVersion: row.planRelease?.version ?? null,
      inputJson: row.inputJson,
      outputJson: row.outputJson,
      currentAreaConfig: areaConfig
        ? {
            id: areaConfig.id,
            initialContext: areaConfig.initialContext,
            responseFormatPrompt: areaConfig.responseFormatPrompt,
          }
        : null,
    };
  }

  async testPrompt(dto: TestPromptDto) {
    return this.proposalProvider.testPrompt({
      prompt: dto.prompt,
      context: dto.context,
      provider: dto.provider,
    });
  }

  async runReplay(actorId: string, dto: RunReplayDto) {
    const audit = await this.prisma.aiProposalAudit.findUnique({
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
      const area = await this.prisma.area.findFirst({
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

    const currentAreaConfig =
      await this.prisma.aiAreaGenerationConfig.findUnique({
        where: { areaId },
      });

    const initialContext =
      dto.initialContextOverride ?? currentAreaConfig?.initialContext ?? '';
    const responseFormatPrompt =
      dto.responseFormatPromptOverride ??
      currentAreaConfig?.responseFormatPrompt ??
      '';

    const scale = await this.prisma.performanceScaleConfig.findFirst({
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

    const replayRecord = await this.prisma.aiPromptReplay.create({
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
      const proposal = await this.proposalProvider.generateCycleProposal(input);
      const updated = await this.prisma.aiPromptReplay.update({
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
      await this.prisma.aiPromptReplay.update({
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

  async listReplays(actorId: string, page = 1) {
    const skip = (Math.max(1, page) - 1) * REPLAYS_PAGE_SIZE;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.aiPromptReplay.findMany({
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
      this.prisma.aiPromptReplay.count({ where: { createdById: actorId } }),
    ]);
    return {
      items: items.map((r) => ({
        id: r.id,
        sourceAuditId: r.sourceAuditId,
        athleteLabel: this.pseudonymizeUserId(r.sourceAudit.userId),
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

  async getReplay(actorId: string, replayId: string) {
    const replay = await this.prisma.aiPromptReplay.findUnique({
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
        athleteLabel: this.pseudonymizeUserId(replay.sourceAudit.userId),
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

  async saveReplayFeedback(
    actorId: string,
    replayId: string,
    dto: SaveReplayFeedbackDto,
  ) {
    const replay = await this.prisma.aiPromptReplay.findUnique({
      where: { id: replayId },
      select: { id: true, createdById: true },
    });
    if (!replay || replay.createdById !== actorId) {
      throw new NotFoundException(`Replay ${replayId} non disponibile`);
    }
    return this.prisma.aiReplayFeedback.upsert({
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

  async listGoldenContexts(areaId?: string) {
    return this.prisma.aiGoldenContext.findMany({
      where: areaId ? { areaId } : {},
      orderBy: { createdAt: 'desc' },
      include: { area: { select: { id: true, name: true } } },
    });
  }

  async createGoldenContext(actorId: string, dto: UpsertGoldenContextDto) {
    return this.prisma.aiGoldenContext.create({
      data: {
        label: dto.label,
        description: dto.description ?? null,
        areaId: dto.areaId,
        athleteLevel: dto.athleteLevel ?? null,
        contextJson: dto.contextJson as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
        createdById: actorId,
      },
    });
  }

  async updateGoldenContext(id: string, dto: UpsertGoldenContextDto) {
    return this.prisma.aiGoldenContext.update({
      where: { id },
      data: {
        label: dto.label,
        description: dto.description ?? null,
        areaId: dto.areaId,
        athleteLevel: dto.athleteLevel ?? null,
        contextJson: dto.contextJson as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async deleteGoldenContext(id: string) {
    await this.prisma.aiGoldenContext.delete({ where: { id } });
    return { ok: true };
  }

  async createGoldenContextFromAudit(
    actorId: string,
    auditId: string,
    label: string,
  ) {
    const audit = await this.prisma.aiProposalAudit.findUnique({
      where: { id: auditId },
      include: {
        planRelease: { select: { areaId: true } },
      },
    });
    if (!audit) {
      throw new NotFoundException(`Audit ${auditId} non trovato`);
    }
    const inputJson = audit.inputJson as Prisma.JsonObject;
    const promptBlock = (inputJson?.prompt ?? {}) as Prisma.JsonObject;
    const userBlock = (promptBlock?.user ?? {}) as Prisma.JsonObject;
    const context = userBlock?.context as AiCycleContext | undefined;
    if (!context || !audit.planRelease?.areaId) {
      throw new BadRequestException(
        'Audit non utilizzabile come golden (manca contesto o area)',
      );
    }
    return this.prisma.aiGoldenContext.create({
      data: {
        label,
        description: `Da audit ${audit.id}`,
        areaId: audit.planRelease.areaId,
        athleteLevel: context.athlete?.areaLevel ?? null,
        contextJson: context as unknown as Prisma.InputJsonValue,
        isActive: true,
        createdById: actorId,
      },
    });
  }

  async listEvaluationRuns() {
    return this.prisma.aiEvaluationRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        _count: { select: { results: true } },
      },
    });
  }

  async getEvaluationRun(runId: string) {
    const run = await this.prisma.aiEvaluationRun.findUnique({
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

  async createEvaluationRun(actorId: string, dto: CreateEvaluationRunDto) {
    const goldens = await this.prisma.aiGoldenContext.findMany({
      where: { id: { in: dto.goldenContextIds } },
    });
    if (goldens.length !== dto.goldenContextIds.length) {
      throw new BadRequestException('Alcuni golden context non esistono');
    }
    const run = await this.prisma.aiEvaluationRun.create({
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
      this.executeEvaluationRun(run.id, goldens, dto.variants).catch(
        (error) => {
          this.logger.error(
            `Evaluation run ${run.id} fallita: ${error instanceof Error ? error.message : error}`,
          );
        },
      );
    });
    return run;
  }

  private async executeEvaluationRun(
    runId: string,
    goldens: Array<{
      id: string;
      areaId: string;
      contextJson: Prisma.JsonValue;
    }>,
    variants: PromptVariantDto[],
  ) {
    await this.prisma.aiEvaluationRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    const scale = await this.prisma.performanceScaleConfig.findFirst({
      where: { isActive: true },
    });
    if (!scale) {
      await this.prisma.aiEvaluationRun.update({
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
      const areaConfig = await this.prisma.aiAreaGenerationConfig.findUnique({
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
              planItemRequirements:
                context.guidance?.planItemRequirements ?? [],
              questionnaireRequirements:
                context.guidance?.questionnaireRequirements ?? [],
              safetyRules: context.guidance?.safetyRules ?? [],
            },
          };
          const area = await this.prisma.area.findUnique({
            where: { id: golden.areaId },
          });
          const proposal = await this.proposalProvider.generateCycleProposal({
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
          await this.prisma.aiEvaluationResult.create({
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
          await this.prisma.aiEvaluationResult.create({
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
    await this.prisma.aiEvaluationRun.update({
      where: { id: runId },
      data: {
        status: hadFailure ? 'COMPLETED' : 'COMPLETED',
        completedAt: new Date(),
      },
    });
  }

  async rateEvaluationResult(
    actorId: string,
    resultId: string,
    dto: RateEvaluationResultDto,
  ) {
    return this.prisma.aiEvaluationResult.update({
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

  async getCostSummary(params: { from?: Date; to?: Date }) {
    const where: Prisma.AiProposalAuditWhereInput = {
      status: 'SUCCESS',
      totalTokens: { not: null },
    };
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = params.from;
      if (params.to) where.createdAt.lte = params.to;
    }
    const grouped = await this.prisma.aiProposalAudit.groupBy({
      by: ['provider', 'model'],
      where,
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        latencyMs: true,
      },
      _count: { _all: true },
    });

    const recent = await this.prisma.aiProposalAudit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        provider: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        latencyMs: true,
        planRelease: { select: { area: { select: { name: true } } } },
      },
    });

    const replayAgg = await this.prisma.aiPromptReplay.groupBy({
      by: ['provider', 'model'],
      where: { status: 'SUCCESS', totalTokens: { not: null } },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        durationMs: true,
      },
      _count: { _all: true },
    });

    return {
      byProvider: grouped.map((row) => ({
        provider: row.provider,
        model: row.model,
        count: row._count._all,
        inputTokens: row._sum.inputTokens ?? 0,
        outputTokens: row._sum.outputTokens ?? 0,
        totalTokens: row._sum.totalTokens ?? 0,
        latencyMsSum: row._sum.latencyMs ?? 0,
      })),
      replays: replayAgg.map((row) => ({
        provider: row.provider,
        model: row.model,
        count: row._count._all,
        inputTokens: row._sum.inputTokens ?? 0,
        outputTokens: row._sum.outputTokens ?? 0,
        totalTokens: row._sum.totalTokens ?? 0,
        durationMsSum: row._sum.durationMs ?? 0,
      })),
      recent: recent.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        provider: row.provider,
        model: row.model,
        area: row.planRelease?.area?.name ?? null,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        totalTokens: row.totalTokens,
        latencyMs: row.latencyMs,
      })),
    };
  }
}
