import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AiProposalProviderService,
  CycleProposalInput,
  CycleProposal,
} from './proposal-provider.service';

const DEFAULT_SCALE = {
  minScore: 0,
  maxScore: 100,
  potentialStep: 5,
  thresholdRatio: 0.85,
};
type AreaRecord = {
  id: string;
  name: string;
};
type SnapshotAreaHistoryItem = {
  areaId: string;
  realR: number;
  potentialP: number;
};

@Injectable()
export class OrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProposalProvider: AiProposalProviderService,
  ) {}

  async runProposalBatch(
    userIds: string[],
    actorId: string,
    areaId?: string,
    runAllAreas = true,
  ) {
    if (!actorId) {
      throw new BadRequestException('Missing actor id');
    }
    if (!userIds?.length) {
      throw new BadRequestException('Missing user ids');
    }

    if (areaId && runAllAreas) {
      throw new BadRequestException('Choose single area or run all areas');
    }

    const areas = areaId
      ? await this.loadArea(areaId)
      : runAllAreas
        ? await this.loadAreas()
        : [];

    if (areas.length === 0) {
      throw new BadRequestException('No areas configured');
    }

    const results: Array<{
      userId: string;
      areaId: string;
      planReleaseId: string;
      questionSetId: string;
    }> = [];
    for (const userId of userIds) {
      for (const area of areas) {
        const result = await this.runCycleForArea(userId, area, actorId);
        results.push({ userId, areaId: area.id, ...result });
      }
    }
    return results;
  }

  private async loadAreas() {
    return this.prisma.area.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  private async loadArea(areaId: string) {
    if (!areaId) {
      throw new BadRequestException('Missing area id');
    }
    const area = await this.prisma.area.findUnique({
      where: { id: areaId },
      select: { id: true, name: true },
    });
    if (!area) {
      throw new BadRequestException('Invalid area');
    }
    return [area];
  }

  async runCycleForArea(
    userId: string,
    area: AreaRecord,
    actorId: string,
    reason = 'Ciclo AI generato',
  ) {
    if (!userId) {
      throw new BadRequestException('Missing user id');
    }
    if (!actorId) {
      throw new BadRequestException('Missing actor id');
    }

    const proposalInput = await this.prepareCycleProposalInput(
      userId,
      area,
      reason,
    );
    const proposal =
      await this.aiProposalProvider.generateCycleProposal(proposalInput);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isActive: true },
      });

      if (!user || user.role !== UserRole.USER || !user.isActive) {
        throw new BadRequestException('Invalid user');
      }

      const existingPending = await tx.improvementPlanRelease.findFirst({
        where: { userId, areaId: area.id, status: 'PENDING_APPROVAL' },
        select: { id: true },
      });
      if (existingPending) {
        throw new BadRequestException('Pending cycle already exists for area');
      }

      await this.assertPreviousCycleCompleted(tx, userId, area.id);

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
          items: { create: this.buildPlanItems(area, proposal) },
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
          questions: { create: this.buildQuestions(area, proposal) },
          approvals: {
            create: await this.buildApprovals(tx, userId, area),
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

  async previewCycleProposalInput(
    userId: string,
    areaId: string,
    reason = 'Ciclo AI generato',
  ) {
    const [area] = await this.loadArea(areaId);
    const input = await this.prepareCycleProposalInput(userId, area, reason);
    return this.aiProposalProvider.buildCycleProposalPreview(input);
  }

  private async prepareCycleProposalInput(
    userId: string,
    area: AreaRecord,
    reason: string,
  ): Promise<CycleProposalInput> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user || user.role !== UserRole.USER || !user.isActive) {
      throw new BadRequestException('Invalid user');
    }

    const existingPending = await this.prisma.improvementPlanRelease.findFirst({
      where: { userId, areaId: area.id, status: 'PENDING_APPROVAL' },
      select: { id: true },
    });
    if (existingPending) {
      throw new BadRequestException('Pending cycle already exists for area');
    }

    await this.assertPreviousCycleCompleted(this.prisma, userId, area.id);

    if (AiProposalProviderService.requiresUserConsent()) {
      const consent = await this.prisma.consent.findFirst({
        where: { userId, type: 'AI' },
        select: { id: true },
      });
      if (!consent) {
        throw new BadRequestException(
          'AI consent is required for external AI proposals',
        );
      }
    }

    const [
      previousSnapshot,
      lastPlan,
      scale,
      history,
      onboardingAssessment,
      currentState,
      areaGenerationConfig,
    ] = await Promise.all([
      this.prisma.performanceProfileSnapshot.findFirst({
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
      this.prisma.improvementPlanRelease.findFirst({
        where: { userId, areaId: area.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      }),
      this.loadScaleConfig(this.prisma),
      this.loadAreaCycleHistory(userId, area.id),
      this.prisma.userOnboardingAssessment.findUnique({
        where: { userId },
        select: { answersJson: true, profileJson: true },
      }),
      this.prisma.currentState.findUnique({
        where: { userId_areaId: { userId, areaId: area.id } },
        select: { level: true, score: true },
      }),
      this.loadAreaGenerationConfig(area.id),
    ]);

    const nextVersion = (lastPlan?.version ?? 0) + 1;
    const areaLevel = currentState?.level ?? this.levelFromSnapshot(previousSnapshot, area.id);
    const promptConfigs = await this.loadPromptConfigs(area.id, areaLevel);
    const context = this.buildAiCycleContext({
      userId,
      area,
      nextVersion,
      reason,
      scale,
      previousSnapshot,
      history,
      onboardingAssessment,
      areaLevel,
      promptConfigs,
      areaGenerationConfig,
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

  private async loadAreaCycleHistory(userId: string, areaId: string) {
    return this.prisma.improvementPlanRelease.findMany({
      where: { userId, areaId },
      orderBy: { version: 'desc' },
      take: 3,
      select: {
        id: true,
        version: true,
        status: true,
        cycleStatus: true,
        createdAt: true,
        publishedAt: true,
        archivedAt: true,
        items: {
          orderBy: { id: 'asc' },
          select: {
            title: true,
            body: true,
            status: true,
            completedAt: true,
            completionRating: true,
            completionNotes: true,
            rejectionReason: true,
          },
        },
        questionSets: {
          orderBy: { createdAt: 'desc' },
          select: {
            status: true,
            createdAt: true,
            publishedAt: true,
            closedAt: true,
            approvals: {
              select: {
                status: true,
                rejectionReason: true,
              },
            },
            questions: {
              orderBy: { orderIndex: 'asc' },
              select: {
                text: true,
                orderIndex: true,
                answers: {
                  select: {
                    scoreAwarded: true,
                    answeredAt: true,
                    answerOption: { select: { label: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  private buildAiCycleContext(input: {
    userId: string;
    area: AreaRecord;
    nextVersion: number;
    reason: string;
    scale: {
      minScore: number;
      maxScore: number;
      potentialStep: number;
      thresholdRatio: number;
    };
    previousSnapshot: CycleProposalInput['previousSnapshot'];
    history: Awaited<ReturnType<OrchestratorService['loadAreaCycleHistory']>>;
    onboardingAssessment: {
      answersJson: Prisma.JsonValue | null;
      profileJson: Prisma.JsonValue | null;
    } | null;
    areaLevel: string;
    promptConfigs: Awaited<ReturnType<OrchestratorService['loadPromptConfigs']>>;
    areaGenerationConfig: Awaited<ReturnType<OrchestratorService['loadAreaGenerationConfig']>>;
  }): CycleProposalInput['context'] {
    const latestAreas =
      input.previousSnapshot?.areas.map((area) => ({
        areaName: area.area.name,
        realR: area.realR,
        potentialP: area.potentialP,
        gap: Math.max(0, area.potentialP - area.realR),
      })) ?? [];
    const targetArea = input.previousSnapshot?.areas.find(
      (area) => area.areaId === input.area.id,
    );
    const targetAreaPerformance = targetArea
      ? {
          realR: this.roundScore(targetArea.realR),
          potentialP: this.roundScore(targetArea.potentialP),
          gap: this.roundScore(Math.max(0, targetArea.potentialP - targetArea.realR)),
        }
      : null;
    const onboardingAnswers = input.onboardingAssessment?.answersJson ?? null;

    return {
      athlete: {
        generalAnamnesis: this.buildGeneralAnamnesis(
          input.onboardingAssessment?.profileJson ?? null,
          onboardingAnswers,
        ),
        targetAreaAnamnesis: this.buildTargetAreaAnamnesis(
          onboardingAnswers,
          input.area.id,
          input.area.name,
        ),
        areaLevel: input.areaLevel,
      },
      targetArea: {
        name: input.area.name,
      },
      cycle: {
        nextVersion: input.nextVersion,
      },
      performance: {
        latestSnapshot: input.previousSnapshot
          ? {
              rankingGlobal: input.previousSnapshot.rankingGlobal,
              targetArea: targetAreaPerformance,
              otherAreas: latestAreas
                .filter((area) => area.areaName !== input.area.name)
                .map((area) => ({
                  areaName: area.areaName,
                  realR: this.roundScore(area.realR),
                  potentialP: this.roundScore(area.potentialP),
                  gap: this.roundScore(area.gap),
                })),
            }
          : null,
      },
      history: {
        previousAreaCycles: input.history.slice(0, 2).map((cycle) => ({
          version: cycle.version,
          status: cycle.status,
          cycleStatus: cycle.cycleStatus,
          exercises: cycle.items.map((item) => ({
            title: item.title,
            body: item.body,
            status: item.status,
            completionRating: item.completionRating,
            completionNotes: item.completionNotes,
            rejectionReason: item.rejectionReason,
          })),
          questionnaires: cycle.questionSets.map((set) => ({
            status: set.status,
            rejectionReasons: set.approvals
              .map((approval) => approval.rejectionReason)
              .filter((reason): reason is string => Boolean(reason)),
            questions: set.questions.map((question) => ({
              text: question.text,
              answers: question.answers.map((answer) => ({
                scoreAwarded: answer.scoreAwarded,
                optionLabel: answer.answerOption?.label ?? null,
              })),
            })),
          })),
        })),
      },
      guidance: {
        areaGenerationConfig: input.areaGenerationConfig
          ? {
              initialContext: input.areaGenerationConfig.initialContext,
              responseFormatPrompt:
                input.areaGenerationConfig.responseFormatPrompt,
              questionnaireLayoutJson:
                input.areaGenerationConfig.questionnaireLayoutJson,
            }
          : null,
        adminPromptInstructions: input.promptConfigs.map((config) => ({
          name: config.name,
          scope: config.areaId ? `area:${config.area?.name ?? input.area.name}` : 'global',
          athleteLevel: config.athleteLevel,
          version: config.version,
          basePrompt: config.basePrompt,
        })),
        planItemRequirements: [
          'Fonda ogni attivita sui punteggi dell area target, sulle note di completamento precedenti e sui motivi di rifiuto gia presenti.',
          'Ogni attivita deve essere abbastanza concreta da poter essere eseguita dall atleta senza spiegazioni aggiuntive.',
          'Includi criteri di successo misurabili, frequenza o trigger e una progressione chiara.',
        ],
        questionnaireRequirements: [
          'Crea esattamente tre domande brevi per l area target.',
          'Le domande devono monitorare esecuzione o aderenza al lavoro proposto, non l umore generico.',
          'Evita di duplicare domande precedenti salvo quando la continuita e utile; se le ripeti, rendi chiaro il motivo nella formulazione.',
        ],
        safetyRules: [
          'Non diagnosticare infortuni e non fare affermazioni mediche.',
          'Non prescrivere carichi, integratori o trattamenti non sicuri.',
          'Mantieni le raccomandazioni adatte alla revisione professionale prima della pubblicazione.',
        ],
      },
    };
  }

  private buildGeneralAnamnesis(
    profileJson: Prisma.JsonValue | null,
    answersJson: Prisma.JsonValue | null,
  ) {
    if (profileJson && typeof profileJson === 'object' && !Array.isArray(profileJson)) {
      return profileJson;
    }

    const answers = Array.isArray(answersJson) ? answersJson : [];
    const generalAnswers = answers
      .map((answer) => this.normalizeOnboardingAnswer(answer))
      .filter(this.isNormalizedOnboardingAnswer)
      .filter((answer) => answer?.scope === 'GENERAL')
      .map((answer) => ({
        label: answer.label ?? answer.key,
        value: answer.value,
      }));

    return generalAnswers.length ? generalAnswers : null;
  }

  private buildTargetAreaAnamnesis(
    answersJson: Prisma.JsonValue | null,
    areaId: string,
    areaName: string,
  ) {
    const answers = Array.isArray(answersJson) ? answersJson : [];
    const normalized = answers
      .map((answer) => this.normalizeOnboardingAnswer(answer))
      .filter(this.isNormalizedOnboardingAnswer);

    const structured = normalized
      .filter(
        (answer) =>
          answer?.scope === 'AREA' &&
          (answer.areaId === areaId || answer.areaName === areaName),
      )
      .map((answer) => ({
        label: answer.label ?? answer.key ?? areaName,
        value: answer.value,
        score: answer.score,
      }));
    if (structured.length) {
      return structured;
    }

    const legacy = normalized.find(
      (answer) => answer?.areaId === areaId || answer?.areaName === areaName,
    );
    if (!legacy) {
      return null;
    }
    return {
      areaName: legacy.areaName ?? areaName,
      realR: legacy.realR,
      potentialP: legacy.potentialP,
    };
  }

  private normalizeOnboardingAnswer(value: Prisma.JsonValue) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as {
      key?: string;
      scope?: string;
      areaId?: string;
      areaName?: string;
      label?: string;
      value?: Prisma.JsonValue;
      score?: number | null;
      realR?: number;
      potentialP?: number;
    };
  }

  private isNormalizedOnboardingAnswer(
    value: ReturnType<OrchestratorService['normalizeOnboardingAnswer']>,
  ): value is NonNullable<
    ReturnType<OrchestratorService['normalizeOnboardingAnswer']>
  > {
    return value !== null;
  }

  private roundScore(value: number) {
    return Math.round(value * 10) / 10;
  }

  private async loadAreaGenerationConfig(areaId: string) {
    return this.prisma.aiAreaGenerationConfig.findUnique({
      where: { areaId },
      select: {
        initialContext: true,
        responseFormatPrompt: true,
        questionnaireLayoutJson: true,
      },
    });
  }

  private async loadPromptConfigs(areaId: string, athleteLevel: string) {
    const levels = [athleteLevel, 'BASELINE'];
    return this.prisma.aiPromptConfig.findMany({
      where: {
        isActive: true,
        athleteLevel: { in: levels },
        OR: [{ areaId: null }, { areaId }],
      },
      select: {
        id: true,
        name: true,
        basePrompt: true,
        areaId: true,
        athleteLevel: true,
        version: true,
        area: { select: { id: true, name: true } },
      },
      orderBy: [
        { areaId: 'asc' },
        { athleteLevel: 'asc' },
        { version: 'desc' },
      ],
    });
  }

  private levelFromSnapshot(
    snapshot: CycleProposalInput['previousSnapshot'],
    areaId: string,
  ) {
    const area = snapshot?.areas.find((item) => item.areaId === areaId);
    if (!area) {
      return 'BASELINE';
    }
    if (area.realR >= 80) {
      return 'ADVANCED';
    }
    if (area.realR >= 60) {
      return 'STABLE';
    }
    return 'BASELINE';
  }

  private toIsoOrNull(value?: Date | null) {
    return value ? value.toISOString() : null;
  }

  private buildSnapshotArea(
    area: AreaRecord,
    history: SnapshotAreaHistoryItem[],
    scoresByArea: Map<string, { total: number; count: number }>,
    scale: {
      minScore: number;
      maxScore: number;
      potentialStep: number;
      thresholdRatio: number;
    },
  ) {
    const scoreEntry = scoresByArea.get(area.id);
    const scoredReal =
      scoreEntry && scoreEntry.count > 0
        ? scoreEntry.total / scoreEntry.count
        : undefined;
    const latest = history[0];
    const historicalReal = this.weightedHistoricalAverage(
      history.map((item) => item.realR),
    );
    const realR = this.clampScore(
      this.interpolateRealScore(scoredReal, latest?.realR, historicalReal),
      scale,
    );

    const historicalPotential = this.weightedHistoricalAverage(
      history.map((item) => item.potentialP),
    );
    const basePotential = this.clampScore(
      Math.max(
        latest?.potentialP ?? historicalPotential ?? scale.maxScore,
        realR,
      ),
      scale,
    );
    let potentialP = basePotential;
    if (realR >= scale.thresholdRatio * basePotential) {
      potentialP = Math.min(
        scale.maxScore,
        Math.max(basePotential, realR + scale.potentialStep),
      );
    }

    return {
      areaId: area.id,
      realR,
      potentialP,
    };
  }

  private interpolateRealScore(
    currentScore: number | undefined,
    latestScore: number | undefined,
    historicalScore: number | undefined,
  ) {
    if (currentScore === undefined) {
      return latestScore ?? historicalScore ?? 0;
    }
    if (latestScore === undefined && historicalScore === undefined) {
      return currentScore;
    }
    if (latestScore === undefined) {
      return currentScore * 0.7 + historicalScore! * 0.3;
    }
    if (historicalScore === undefined) {
      return currentScore * 0.65 + latestScore * 0.35;
    }
    return currentScore * 0.55 + latestScore * 0.3 + historicalScore * 0.15;
  }

  private weightedHistoricalAverage(values: number[]) {
    let total = 0;
    let weightTotal = 0;

    values.forEach((value, index) => {
      const weight = Math.pow(0.72, index);
      total += value * weight;
      weightTotal += weight;
    });

    return weightTotal > 0 ? total / weightTotal : undefined;
  }

  private buildPlanItems(
    area: AreaRecord,
    proposal: CycleProposal,
  ): Prisma.PlanItemUncheckedCreateWithoutPlanReleaseInput[] {
    return proposal.planItems.map((item) => ({
      areaId: area.id,
      type: item.type,
      title: item.title,
      body: item.body,
      metadata: (item.metadata ?? {
        source: 'orchestrator',
        area: area.name,
        provider: proposal.provider,
        model: proposal.model,
        promptVersion: proposal.promptVersion,
      }) as Prisma.InputJsonObject,
      status: 'PROPOSED',
    }));
  }

  private buildQuestions(
    area: AreaRecord,
    proposal: CycleProposal,
  ): Prisma.QuestionUncheckedCreateWithoutQuestionSetInput[] {
    return proposal.questions.map((question, index) => ({
      areaId: area.id,
      text: question.text,
      objectiveRef: question.objectiveRef ?? `area:${area.id}`,
      orderIndex: question.orderIndex ?? index + 1,
      options: {
        create: question.options.map((option) => ({ ...option })),
      },
    }));
  }

  private computeRankingGlobal(
    snapshotAreas: Array<{ realR: number }>,
    scale: { minScore: number; maxScore: number },
  ): number {
    if (snapshotAreas.length === 0) {
      return 0;
    }
    const total = snapshotAreas.reduce((sum, area) => sum + area.realR, 0);
    const avg = total / snapshotAreas.length;
    if (scale.maxScore <= scale.minScore) {
      return 0;
    }
    const normalized =
      ((avg - scale.minScore) / (scale.maxScore - scale.minScore)) * 100;
    return Math.round(Math.max(0, Math.min(100, normalized)));
  }

  private clampScore(
    value: number,
    scale: { minScore: number; maxScore: number },
  ) {
    if (Number.isNaN(value)) {
      return scale.minScore;
    }
    return Math.max(scale.minScore, Math.min(scale.maxScore, value));
  }

  private async loadScaleConfig(tx: Prisma.TransactionClient) {
    const config = await tx.performanceScaleConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        minScore: true,
        maxScore: true,
        potentialStep: true,
        thresholdRatio: true,
      },
    });

    if (!config) {
      return DEFAULT_SCALE;
    }

    return {
      minScore: config.minScore,
      maxScore: config.maxScore,
      potentialStep: config.potentialStep,
      thresholdRatio: config.thresholdRatio,
    };
  }

  private async buildApprovals(
    tx: Prisma.TransactionClient,
    userId: string,
    area: AreaRecord,
  ) {
    const link = await tx.professionalUserLink.findFirst({
      where: { userId, areaId: area.id },
      select: { professionalId: true },
    });

    if (!link) {
      throw new BadRequestException(
        `No professional linked to user for area ${area.name}`,
      );
    }

    return [
      {
        areaId: area.id,
        professionalId: link.professionalId,
        status: 'PENDING',
      },
    ];
  }

  private async assertPreviousCycleCompleted(
    client: Pick<PrismaService, 'improvementPlanRelease'>,
    userId: string,
    areaId: string,
  ) {
    const active = await client.improvementPlanRelease.findFirst({
      where: { userId, areaId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        items: { select: { status: true } },
        questionSets: {
          select: { status: true, closedAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!active) {
      return;
    }

    const allActivitiesCompleted =
      active.items.length > 0 &&
      active.items.every((item) => item.status === 'COMPLETED');
    if (!allActivitiesCompleted) {
      throw new BadRequestException(
        'Previous plan activity must be completed before generating a new cycle',
      );
    }

    const questionnaire = active.questionSets[0];
    if (!questionnaire || questionnaire.status !== 'CLOSED') {
      throw new BadRequestException(
        'Previous questionnaire must be completed before generating a new cycle',
      );
    }
  }

  async publishCycle(planReleaseId: string, actorId: string) {
    if (!planReleaseId) {
      throw new BadRequestException('Missing plan release id');
    }
    if (!actorId) {
      throw new BadRequestException('Missing actor id');
    }

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.improvementPlanRelease.findUnique({
        where: { id: planReleaseId },
        select: {
          id: true,
          userId: true,
          areaId: true,
          status: true,
          cycleStatus: true,
          items: { select: { id: true, status: true } },
          questionSets: {
            select: {
              id: true,
              status: true,
              approvals: { select: { status: true } },
            },
          },
        },
      });

      if (!plan) {
        throw new BadRequestException('Plan release not found');
      }

      if (plan.status !== 'PENDING_APPROVAL') {
        throw new BadRequestException('Plan release not in approval');
      }

      const allItemsApproved = plan.items.every(
        (item) => item.status === 'APPROVED',
      );
      if (!allItemsApproved) {
        throw new BadRequestException('Not all plan items are approved');
      }

      const questionSet = plan.questionSets[0];
      if (!questionSet) {
        throw new BadRequestException('Missing question set');
      }

      if (questionSet.status !== 'PENDING_APPROVAL') {
        throw new BadRequestException('Question set not in approval');
      }

      const allAreasApproved = questionSet.approvals.every(
        (approval) => approval.status === 'APPROVED',
      );
      if (!allAreasApproved) {
        throw new BadRequestException('Not all question areas are approved');
      }

      await tx.improvementPlanRelease.updateMany({
        where: { userId: plan.userId, areaId: plan.areaId, status: 'ACTIVE' },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });

      await tx.improvementPlanRelease.update({
        where: { id: plan.id },
        data: {
          status: 'ACTIVE',
          publishedAt: new Date(),
          publishedByAdminId: actorId,
          cycleStatus: 'PUBLISHED',
        },
      });

      await tx.planItem.updateMany({
        where: { planReleaseId: plan.id },
        data: { status: 'ACTIVE' },
      });

      await tx.questionSet.update({
        where: { id: questionSet.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });

      await tx.aiContextSummary.updateMany({
        where: { planReleaseId: plan.id },
        data: { cycleStatus: 'PUBLISHED' },
      });

      await tx.cycleAuditLog.create({
        data: {
          userId: plan.userId,
          planReleaseId: plan.id,
          action: 'PUBLISH',
          actorId,
        },
      });

      return { planReleaseId: plan.id, questionSetId: questionSet.id };
    });
  }

  async createSnapshotFromQuestionSet(questionSetId: string, reason: string) {
    if (!questionSetId) {
      throw new BadRequestException('Missing question set id');
    }

    return this.prisma.$transaction((tx) =>
      this.createSnapshotFromQuestionSetInTransaction(
        tx,
        questionSetId,
        reason,
      ),
    );
  }

  async createSnapshotFromQuestionSetInTransaction(
    tx: Prisma.TransactionClient,
    questionSetId: string,
    reason: string,
  ) {
      const questionSet = await tx.questionSet.findUnique({
        where: { id: questionSetId },
        select: {
          id: true,
          userId: true,
          status: true,
          areaId: true,
          planReleaseId: true,
          questions: {
            select: {
              areaId: true,
              answers: { select: { scoreAwarded: true } },
            },
          },
        },
      });

      if (!questionSet) {
        throw new BadRequestException('Question set not found');
      }

      if (questionSet.status !== 'PUBLISHED') {
        throw new BadRequestException('Question set not published');
      }

      if (
        questionSet.areaId &&
        questionSet.questions.some(
          (question) => question.areaId !== questionSet.areaId,
        )
      ) {
        throw new BadRequestException('Question set contains multiple areas');
      }

      const scale = await this.loadScaleConfig(tx);
      const areas = await tx.area.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });

      const historicalSnapshots = await tx.performanceProfileSnapshot.findMany({
        where: { userId: questionSet.userId },
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: { areas: true },
      });

      const scoresByArea = new Map<string, { total: number; count: number }>();
      for (const question of questionSet.questions) {
        if (!question.answers || question.answers.length === 0) {
          throw new BadRequestException('Question set incomplete');
        }
        for (const answer of question.answers) {
          const entry = scoresByArea.get(question.areaId) ?? {
            total: 0,
            count: 0,
          };
          entry.total += answer.scoreAwarded;
          entry.count += 1;
          scoresByArea.set(question.areaId, entry);
        }
      }

      const historicalAreas = new Map<string, SnapshotAreaHistoryItem[]>();
      for (const snapshot of historicalSnapshots) {
        for (const snapshotArea of snapshot.areas) {
          const entries = historicalAreas.get(snapshotArea.areaId) ?? [];
          entries.push(snapshotArea);
          historicalAreas.set(snapshotArea.areaId, entries);
        }
      }

      const snapshotAreas = areas.map((area) =>
        this.buildSnapshotArea(
          area,
          historicalAreas.get(area.id) ?? [],
          scoresByArea,
          scale,
        ),
      );

      const rankingGlobal = this.computeRankingGlobal(snapshotAreas, scale);

      const snapshot = await tx.performanceProfileSnapshot.create({
        data: {
          userId: questionSet.userId,
          rankingGlobal,
          reason,
          areas: { create: snapshotAreas },
        },
        select: { id: true, createdAt: true },
      });

      await tx.questionSet.update({
        where: { id: questionSet.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      if (questionSet.planReleaseId) {
        await tx.improvementPlanRelease.update({
          where: { id: questionSet.planReleaseId },
          data: { cycleStatus: 'CLOSED' },
        });

        await tx.aiContextSummary.updateMany({
          where: { planReleaseId: questionSet.planReleaseId },
          data: { cycleStatus: 'CLOSED' },
        });
      }

      return { snapshotId: snapshot.id };
  }

  async refreshCycleReadiness(planReleaseId: string) {
    if (!planReleaseId) {
      throw new BadRequestException('Missing plan release id');
    }

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.improvementPlanRelease.findUnique({
        where: { id: planReleaseId },
        select: {
          id: true,
          status: true,
          cycleStatus: true,
          items: { select: { status: true } },
          questionSets: {
            select: {
              approvals: { select: { status: true } },
            },
          },
        },
      });

      if (!plan || plan.status !== 'PENDING_APPROVAL') {
        return { planReleaseId, cycleStatus: plan?.cycleStatus ?? 'PROPOSED' };
      }

      const allItemsApproved = plan.items.every(
        (item) => item.status === 'APPROVED',
      );
      const approvals = plan.questionSets[0]?.approvals ?? [];
      const allAreasApproved = approvals.every(
        (approval) => approval.status === 'APPROVED',
      );

      const nextStatus =
        allItemsApproved && allAreasApproved
          ? 'READY_TO_PUBLISH'
          : 'WAITING_APPROVALS';

      if (plan.cycleStatus !== nextStatus) {
        await tx.improvementPlanRelease.update({
          where: { id: plan.id },
          data: { cycleStatus: nextStatus },
        });

        await tx.aiContextSummary.updateMany({
          where: { planReleaseId: plan.id },
          data: { cycleStatus: nextStatus },
        });
      }

      return { planReleaseId, cycleStatus: nextStatus };
    });
  }

  async rejectCycleProposal(
    planReleaseId: string,
    actorId: string,
    rejectionReason = 'Cycle proposal rejected',
  ) {
    if (!planReleaseId) {
      throw new BadRequestException('Missing plan release id');
    }
    if (!actorId) {
      throw new BadRequestException('Missing actor id');
    }

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.improvementPlanRelease.findUnique({
        where: { id: planReleaseId },
        select: {
          id: true,
          userId: true,
          status: true,
        },
      });

      if (!plan) {
        throw new BadRequestException('Plan release not found');
      }

      if (plan.status === 'REJECTED') {
        return { planReleaseId, status: 'REJECTED', cycleStatus: 'CLOSED' };
      }

      if (plan.status !== 'PENDING_APPROVAL') {
        throw new BadRequestException('Plan release not in approval');
      }

      const rejectedAt = new Date();

      await tx.improvementPlanRelease.update({
        where: { id: plan.id },
        data: {
          status: 'REJECTED',
          cycleStatus: 'CLOSED',
        },
      });

      await tx.planItem.updateMany({
        where: { planReleaseId: plan.id, status: 'PROPOSED' },
        data: {
          status: 'REJECTED',
          approvedByProfessionalId: actorId,
          rejectedAt,
          rejectionReason,
        },
      });

      await tx.questionSet.updateMany({
        where: { planReleaseId: plan.id, status: 'PENDING_APPROVAL' },
        data: { status: 'REJECTED' },
      });

      await tx.questionSetAreaApproval.updateMany({
        where: {
          status: 'PENDING',
          questionSet: { planReleaseId: plan.id },
        },
        data: {
          status: 'REJECTED',
          approvedByProfessionalId: actorId,
          rejectedAt,
          rejectionReason,
        },
      });

      await tx.aiContextSummary.updateMany({
        where: { planReleaseId: plan.id },
        data: { cycleStatus: 'CLOSED' },
      });

      await tx.cycleAuditLog.create({
        data: {
          userId: plan.userId,
          planReleaseId: plan.id,
          action: 'REJECT',
          actorId,
        },
      });

      return { planReleaseId, status: 'REJECTED', cycleStatus: 'CLOSED' };
    });
  }
}
