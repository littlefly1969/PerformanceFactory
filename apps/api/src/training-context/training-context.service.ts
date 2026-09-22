import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildAiCycleContext } from '../ai-orchestrator/cycle-context';
import { loadAreasForUser } from '../ai-orchestrator/cycle-generation';
import { loadTrainingPromptInstruction } from '../ai-orchestrator/cycle-guidance';
import {
  loadTrainingCycleHistory,
  loadTrainingOlderCyclesSummary,
} from '../ai-orchestrator/cycle-history';
import { DEFAULT_TRAINING_ANSWER_OPTIONS } from '../ai-orchestrator/orchestrator-model';
import { loadScaleConfig } from '../ai-orchestrator/performance-scoring';
import {
  AiProposalProviderService,
  CycleProposalInput,
} from '../ai-orchestrator/proposal-provider.service';

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

@Injectable()
export class TrainingContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProposalProviderService,
  ) {}
  async build(userId: string, previousReleaseId?: string) {
    const input = await prepareTrainingProposalInput(
      this.prisma,
      this.provider,
      userId,
      previousReleaseId
        ? 'Nuovo ciclo dopo completamento'
        : 'Allenamento AI generato',
    );
    const [selection, currentState, metrics, previous] = await Promise.all([
      this.prisma.userSportSelection.findUnique({
        where: { userId },
        select: {
          sport: { select: { key: true, label: true } },
          specialization: { select: { key: true, label: true } },
        },
      }),
      this.prisma.currentState.findMany({
        where: { userId },
        select: { areaId: true, score: true, level: true, updatedAt: true },
      }),
      this.prisma.kpiDaily.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 30,
        select: { areaId: true, date: true, metric: true, value: true },
      }),
      previousReleaseId
        ? this.prisma.trainingPlanRelease.findFirst({
            where: { id: previousReleaseId, userId },
            select: {
              id: true,
              version: true,
              status: true,
              cycleStatus: true,
              archivedAt: true,
              sessions: {
                orderBy: { sequence: 'asc' },
                select: {
                  scheduledDate: true,
                  status: true,
                  completedAt: true,
                  skippedAt: true,
                  completionNotes: true,
                  completionRating: true,
                  trainingPlanItem: { select: { title: true, body: true } },
                },
              },
              questionSets: {
                select: {
                  status: true,
                  closedAt: true,
                  questions: {
                    orderBy: { orderIndex: 'asc' },
                    select: {
                      text: true,
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
          })
        : null,
    ]);
    input.context.training = {
      sport: selection?.sport ?? null,
      specialization: selection?.specialization ?? null,
      currentState,
      metrics,
      previousCycle: previous,
    };
    return input;
  }
}
