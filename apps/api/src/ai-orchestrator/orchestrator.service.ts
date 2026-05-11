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
const DEFAULT_TRAINING_ANSWER_OPTIONS = [
  { label: 'Non completato', score: 0 },
  { label: 'Parziale', score: 50 },
  { label: 'Completato', score: 80 },
  { label: 'Completato bene', score: 100 },
];
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
      throw new BadRequestException('ID attore mancante');
    }
    if (!userIds?.length) {
      throw new BadRequestException('ID utenti mancanti');
    }

    if (areaId && runAllAreas) {
      throw new BadRequestException('Scegli una sola area oppure esegui tutte le aree');
    }

    const selectedAreas = areaId ? await this.loadArea(areaId) : null;

    const results: Array<{
      userId: string;
      areaId: string;
      planReleaseId: string;
      questionSetId: string;
    }> = [];
    for (const userId of userIds) {
      const areas = selectedAreas ?? (runAllAreas ? await this.loadAreasForUser(userId) : []);
      if (areas.length === 0) {
        throw new BadRequestException('Nessuna area configurata per l utente');
      }
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
      throw new BadRequestException('ID area mancante');
    }
    const area = await this.prisma.area.findUnique({
      where: { id: areaId },
      select: { id: true, name: true },
    });
    if (!area) {
      throw new BadRequestException('Area non valida');
    }
    return [area];
  }

  private async loadAreasForUser(userId: string) {
    const selection = await this.prisma.userSportSelection.findUnique({
      where: { userId },
      select: { specializationId: true },
    });
    if (!selection) {
      return this.loadAreas();
    }
    const prompts = await this.prisma.sportSpecializationAreaPrompt.findMany({
      where: {
        specializationId: selection.specializationId,
        isActive: true,
        isEnabledDriver: true,
      },
      select: { area: { select: { id: true, name: true } } },
      orderBy: { area: { name: 'asc' } },
    });
    return prompts.length ? prompts.map((prompt) => prompt.area) : this.loadAreas();
  }

  async runCycleForArea(
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
        throw new BadRequestException('Utente non valido');
      }

      const existingPending = await tx.improvementPlanRelease.findFirst({
        where: { userId, areaId: area.id, status: 'PENDING_APPROVAL' },
        select: { id: true },
      });
      if (existingPending) {
        throw new BadRequestException('Esiste gia un ciclo in attesa per questa area');
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
      throw new BadRequestException('Utente non valido');
    }

    const existingPending = await this.prisma.improvementPlanRelease.findFirst({
      where: { userId, areaId: area.id, status: 'PENDING_APPROVAL' },
      select: { id: true },
    });
    if (existingPending) {
      throw new BadRequestException('Esiste gia un ciclo in attesa per questa area');
    }

    await this.assertPreviousCycleCompleted(this.prisma, userId, area.id);

    if (AiProposalProviderService.requiresUserConsent()) {
      const consent = await this.prisma.consent.findFirst({
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
      onboardingAssessment,
      currentState,
      areaGenerationConfig,
      userAreaPromptInstruction,
      sportSpecializationPromptInstruction,
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
      this.prisma.userAreaPromptInstruction.findUnique({
        where: { userId_areaId: { userId, areaId: area.id } },
        select: {
          promptText: true,
          promptVersion: true,
          updatedAt: true,
          goal: { select: { goalText: true } },
        },
      }),
      this.loadSportSpecializationPromptInstruction(userId, area.id),
    ]);

    const nextVersion = (lastPlan?.version ?? 0) + 1;
    const areaLevel = currentState?.level ?? this.levelFromSnapshot(previousSnapshot, area.id);
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

  async runTrainingPlanBatch(userIds: string[], actorId: string) {
    if (!actorId) {
      throw new BadRequestException('ID attore mancante');
    }
    if (!userIds?.length) {
      throw new BadRequestException('ID utenti mancanti');
    }

    const results: Array<{ userId: string; trainingPlanReleaseId: string }> = [];
    for (const userId of userIds) {
      const result = await this.runTrainingPlan(userId, actorId);
      results.push({ userId, trainingPlanReleaseId: result.trainingPlanReleaseId });
    }
    return results;
  }

  async previewTrainingProposalInput(userId: string) {
    const input = await this.prepareTrainingProposalInput(userId, 'Allenamento AI generato');
    return this.aiProposalProvider.buildCycleProposalPreview(input);
  }

  private async runTrainingPlan(
    userId: string,
    actorId: string,
    reason = 'Allenamento AI generato',
  ) {
    const proposalInput = await this.prepareTrainingProposalInput(userId, reason);
    const proposal =
      await this.aiProposalProvider.generateCycleProposal(proposalInput);

    return this.prisma.$transaction(async (tx) => {
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

      await tx.trainingPlanRelease.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'CLOSED', archivedAt: new Date() },
      });

      const trainingPlan = await tx.trainingPlanRelease.create({
        data: {
          userId,
          version: nextVersion,
          status: 'ACTIVE',
          generatedBy: 'AI',
          summaryText: proposal.summaryText,
          outputJson: proposal.audit.outputJson as Prisma.InputJsonObject,
          provider: proposal.provider,
          model: proposal.model,
          promptVersion: proposal.promptVersion,
          promptHash: proposal.promptHash,
          sourceSnapshotId: previousSnapshot?.id ?? null,
          proposedByAdminId: actorId,
          publishedAt: new Date(),
        },
        select: { id: true },
      });

      await tx.aiContextSummary.create({
        data: {
          userId,
          summaryText: proposal.summaryText,
          summaryJson: {
            trainingPlanReleaseId: trainingPlan.id,
            provider: proposal.provider,
            model: proposal.model,
            promptVersion: proposal.promptVersion,
          },
          cycleStatus: 'PUBLISHED',
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
        },
      });

      return { trainingPlanReleaseId: trainingPlan.id };
    });
  }

  private async prepareTrainingProposalInput(
    userId: string,
    reason: string,
  ): Promise<CycleProposalInput> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true },
    });
    if (!user || user.role !== UserRole.USER || !user.isActive) {
      throw new BadRequestException('Utente non valido');
    }

    if (AiProposalProviderService.requiresUserConsent()) {
      const consent = await this.prisma.consent.findFirst({
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

    const trainingPromptInstruction =
      await this.loadTrainingPromptInstruction(userId);
    if (!trainingPromptInstruction) {
      throw new BadRequestException(
        'Prompt allenamento non configurato per la sport-specializzazione utente',
      );
    }

    const [
      previousSnapshot,
      lastPlan,
      scale,
      onboardingAssessment,
      enabledAreas,
      goal,
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
      this.prisma.trainingPlanRelease.findFirst({
        where: { userId },
        orderBy: { version: 'desc' },
        select: { version: true },
      }),
      this.loadScaleConfig(this.prisma),
      this.prisma.userOnboardingAssessment.findUnique({
        where: { userId },
        select: { answersJson: true, profileJson: true },
      }),
      this.loadAreasForUser(userId),
      this.prisma.userPerformanceGoal.findUnique({
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
    const context = this.buildAiCycleContext({
      userId,
      area,
      nextVersion,
      reason,
      scale,
      previousSnapshot: filteredSnapshot,
      history: [],
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
    areaGenerationConfig: Awaited<ReturnType<OrchestratorService['loadAreaGenerationConfig']>>;
    userAreaPromptInstruction: {
      promptText: string;
      promptVersion: string;
      updatedAt: Date;
      goal: { goalText: string };
    } | null;
    sportSpecializationPromptInstruction: Awaited<
      ReturnType<OrchestratorService['loadSportSpecializationPromptInstruction']>
    >;
    trainingPromptInstruction: Awaited<
      ReturnType<OrchestratorService['loadTrainingPromptInstruction']>
    >;
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
        performanceGoal: input.userAreaPromptInstruction?.goal.goalText ?? null,
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
        userAreaPromptInstruction: input.userAreaPromptInstruction
          ? {
              promptVersion: input.userAreaPromptInstruction.promptVersion,
              updatedAt: input.userAreaPromptInstruction.updatedAt.toISOString(),
              basePrompt: input.userAreaPromptInstruction.promptText,
            }
          : null,
        sportSpecializationPromptInstruction:
          input.sportSpecializationPromptInstruction
            ? {
                sportLabel:
                  input.sportSpecializationPromptInstruction.specialization.sport
                    .label,
                specializationLabel:
                  input.sportSpecializationPromptInstruction.specialization.label,
                areaName: input.sportSpecializationPromptInstruction.area.name,
                version: input.sportSpecializationPromptInstruction.version,
                updatedAt:
                  input.sportSpecializationPromptInstruction.updatedAt.toISOString(),
                basePrompt: input.sportSpecializationPromptInstruction.basePrompt,
              }
            : null,
        trainingPromptInstruction: input.trainingPromptInstruction
          ? {
              sportLabel: input.trainingPromptInstruction.sport.label,
              specializationLabel: input.trainingPromptInstruction.label,
              version: input.trainingPromptInstruction.trainingPromptVersion,
              updatedAt: input.trainingPromptInstruction.updatedAt.toISOString(),
              basePrompt: input.trainingPromptInstruction.trainingPrompt,
            }
          : null,
        planItemRequirements: [
          'Fonda ogni attivita sui punteggi dell area target, sulle note di completamento precedenti e sui motivi di rifiuto gia presenti.',
          'Ogni attivita deve essere abbastanza concreta da poter essere eseguita dall atleta senza spiegazioni aggiuntive.',
          'Includi criteri di successo misurabili, frequenza o trigger e una progressione chiara.',
        ],
        questionnaireRequirements: [
          'Crea il numero di domande richiesto dal layout AI dell area target.',
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

  private async loadSportSpecializationPromptInstruction(
    userId: string,
    areaId: string,
  ) {
    const selection = await this.prisma.userSportSelection.findUnique({
      where: { userId },
      select: { specializationId: true },
    });
    if (!selection) {
      return null;
    }
    return this.prisma.sportSpecializationAreaPrompt.findUnique({
      where: {
        specializationId_areaId: {
          specializationId: selection.specializationId,
          areaId,
        },
      },
      select: {
        basePrompt: true,
        version: true,
        updatedAt: true,
        isActive: true,
        isEnabledDriver: true,
        area: { select: { name: true } },
        specialization: {
          select: {
            label: true,
            sport: { select: { label: true } },
          },
        },
      },
    }).then((prompt) => (prompt?.isActive && prompt.isEnabledDriver ? prompt : null));
  }

  private async loadTrainingPromptInstruction(userId: string) {
    const selection = await this.prisma.userSportSelection.findUnique({
      where: { userId },
      select: { specializationId: true },
    });
    if (!selection) {
      return null;
    }
    return this.prisma.sportSpecialization.findUnique({
      where: { id: selection.specializationId },
      select: {
        label: true,
        trainingPrompt: true,
        trainingPromptVersion: true,
        trainingPromptActive: true,
        updatedAt: true,
        sport: { select: { label: true } },
      },
    }).then((specialization) =>
      specialization?.trainingPromptActive && specialization.trainingPrompt
        ? {
            ...specialization,
            trainingPrompt: specialization.trainingPrompt,
          }
        : null,
    );
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
        `Nessun professionista collegato all'utente per l'area ${area.name}`,
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
        'L attivita dell allenamento precedente deve essere completata prima di generare un nuovo ciclo',
      );
    }

    const questionnaire = active.questionSets[0];
    if (!questionnaire || questionnaire.status !== 'CLOSED') {
      throw new BadRequestException(
        'Il questionario precedente deve essere completato prima di generare un nuovo ciclo',
      );
    }
  }

  async publishCycle(planReleaseId: string, actorId: string) {
    if (!planReleaseId) {
      throw new BadRequestException('ID rilascio allenamento mancante');
    }
    if (!actorId) {
      throw new BadRequestException('ID attore mancante');
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
        throw new BadRequestException('Rilascio allenamento non trovato');
      }

      if (plan.status !== 'PENDING_APPROVAL') {
        throw new BadRequestException('Il rilascio allenamento non e in approvazione');
      }

      const allItemsApproved = plan.items.every(
        (item) => item.status === 'APPROVED',
      );
      if (!allItemsApproved) {
        throw new BadRequestException('Non tutte le attivita allenamento sono approvate');
      }

      const questionSet = plan.questionSets[0];
      if (!questionSet) {
        throw new BadRequestException('Questionario mancante');
      }

      if (questionSet.status !== 'PENDING_APPROVAL') {
        throw new BadRequestException('Il questionario non e in approvazione');
      }

      const allAreasApproved = questionSet.approvals.every(
        (approval) => approval.status === 'APPROVED',
      );
      if (!allAreasApproved) {
        throw new BadRequestException('Non tutte le aree del questionario sono approvate');
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
      throw new BadRequestException('ID questionario mancante');
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
        throw new BadRequestException('Questionario non trovato');
      }

      if (questionSet.status !== 'PUBLISHED') {
        throw new BadRequestException('Questionario non pubblicato');
      }

      if (
        questionSet.areaId &&
        questionSet.questions.some(
          (question) => question.areaId !== questionSet.areaId,
        )
      ) {
        throw new BadRequestException('Il questionario contiene piu aree');
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
          throw new BadRequestException('Questionario incompleto');
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
      throw new BadRequestException('ID rilascio allenamento mancante');
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
    rejectionReason = 'Proposta ciclo rifiutata',
  ) {
    if (!planReleaseId) {
      throw new BadRequestException('ID rilascio allenamento mancante');
    }
    if (!actorId) {
      throw new BadRequestException('ID attore mancante');
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
        throw new BadRequestException('Rilascio allenamento non trovato');
      }

      if (plan.status === 'REJECTED') {
        return { planReleaseId, status: 'REJECTED', cycleStatus: 'CLOSED' };
      }

      if (plan.status !== 'PENDING_APPROVAL') {
        throw new BadRequestException('Il rilascio allenamento non e in approvazione');
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
