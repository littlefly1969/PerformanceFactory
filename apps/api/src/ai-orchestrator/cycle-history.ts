import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { compactCycleForPrompt, hashJson } from './cycle-context';
import { RECENT_HISTORY_CYCLES } from './orchestrator-model';
import { AiProposalProviderService } from './proposal-provider.service';

export async function loadAreaCycleHistory(
  prisma: PrismaService,
  userId: string,
  areaId: string,
  skip = 0,
  take: number | undefined = RECENT_HISTORY_CYCLES,
) {
  return prisma.improvementPlanRelease.findMany({
    where: { userId, areaId },
    orderBy: { version: 'desc' },
    skip,
    take,
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

export async function loadAreaOlderCyclesSummary(
  prisma: PrismaService,
  aiProposalProvider: AiProposalProviderService,
  userId: string,
  areaId: string,
  areaName: string,
) {
  const olderCycles = await loadAreaCycleHistory(
    prisma,
    userId,
    areaId,
    RECENT_HISTORY_CYCLES,
    undefined,
  );
  return loadOrCreateOlderCyclesSummary(prisma, aiProposalProvider, {
    userId,
    scope: 'AREA',
    areaId,
    specializationId: null,
    targetLabel: areaName,
    olderCycles,
  });
}

export async function loadTrainingCycleHistory(
  prisma: PrismaService,
  userId: string,
  skip = 0,
  take: number | undefined = RECENT_HISTORY_CYCLES,
) {
  const releases = await prisma.trainingPlanRelease.findMany({
    where: { userId },
    orderBy: { version: 'desc' },
    skip,
    take,
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

  return releases.map((release) => ({
    ...release,
    questionSets: release.questionSets.map((set) => ({
      ...set,
      questions: set.questions.map((question) => ({
        ...question,
        answers: question.answers.map((answer) => ({
          scoreAwarded: answer.scoreAwarded,
          answeredAt: answer.answeredAt,
          answerOption: answer.answerOption,
        })),
      })),
    })),
  }));
}

export async function loadTrainingOlderCyclesSummary(
  prisma: PrismaService,
  aiProposalProvider: AiProposalProviderService,
  userId: string,
  specializationId: string,
  targetLabel: string,
) {
  const olderCycles = await loadTrainingCycleHistory(
    prisma,
    userId,
    RECENT_HISTORY_CYCLES,
    undefined,
  );
  return loadOrCreateOlderCyclesSummary(prisma, aiProposalProvider, {
    userId,
    scope: 'TRAINING',
    areaId: null,
    specializationId,
    targetLabel,
    olderCycles,
  });
}

export async function loadOrCreateOlderCyclesSummary(
  prisma: PrismaService,
  aiProposalProvider: AiProposalProviderService,
  input: {
    userId: string;
    scope: 'AREA' | 'TRAINING';
    areaId: string | null;
    specializationId: string | null;
    targetLabel: string;
    olderCycles: Awaited<ReturnType<typeof loadAreaCycleHistory>>;
  },
) {
  if (input.olderCycles.length === 0) {
    return null;
  }

  const compactCycles = input.olderCycles
    .slice()
    .reverse()
    .map((cycle) => compactCycleForPrompt(cycle));
  const sourceHash = hashJson(compactCycles);
  const existing = await prisma.aiCycleHistorySummary.findFirst({
    where: {
      userId: input.userId,
      scope: input.scope,
      areaId: input.areaId,
      specializationId: input.specializationId,
      sourceHash,
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) {
    return existing;
  }

  const summary = await aiProposalProvider.summarizeCycleHistory({
    userId: input.userId,
    scope: input.scope,
    targetLabel: input.targetLabel,
    coveredCycles: compactCycles,
  });
  return prisma.aiCycleHistorySummary.create({
    data: {
      userId: input.userId,
      scope: input.scope,
      areaId: input.areaId,
      specializationId: input.specializationId,
      targetLabel: input.targetLabel,
      summaryText: summary.summaryText,
      summaryJson: summary.summaryJson as Prisma.InputJsonObject,
      sourceHash,
      coveredVersionsJson: compactCycles.map((cycle) => cycle.version),
      provider: summary.provider,
      model: summary.model,
      promptVersion: summary.promptVersion,
      promptHash: summary.promptHash,
    },
  });
}
