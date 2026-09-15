import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SnapshotAreaHistoryItem } from './orchestrator-model';
import {
  buildSnapshotArea,
  computeRankingGlobal,
  loadScaleConfig,
} from './performance-scoring';

export async function createSnapshotFromQuestionSet(
  prisma: PrismaService,
  questionSetId: string,
  reason: string,
) {
  if (!questionSetId) {
    throw new BadRequestException('ID questionario mancante');
  }

  return prisma.$transaction((tx) =>
    createSnapshotFromQuestionSetInTransaction(tx, questionSetId, reason),
  );
}

export async function createSnapshotFromQuestionSetInTransaction(
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

  const scale = await loadScaleConfig(tx);
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
    buildSnapshotArea(
      area,
      historicalAreas.get(area.id) ?? [],
      scoresByArea,
      scale,
    ),
  );

  const rankingGlobal = computeRankingGlobal(snapshotAreas, scale);

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
