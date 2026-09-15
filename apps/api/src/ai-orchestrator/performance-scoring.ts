import { Prisma } from '@prisma/client';
import {
  AreaRecord,
  DEFAULT_SCALE,
  SnapshotAreaHistoryItem,
} from './orchestrator-model';

export function buildSnapshotArea(
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
  const historicalReal = weightedHistoricalAverage(
    history.map((item) => item.realR),
  );
  const realR = clampScore(
    interpolateRealScore(scoredReal, latest?.realR, historicalReal),
    scale,
  );

  const historicalPotential = weightedHistoricalAverage(
    history.map((item) => item.potentialP),
  );
  const basePotential = clampScore(
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

export function interpolateRealScore(
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

export function weightedHistoricalAverage(values: number[]) {
  let total = 0;
  let weightTotal = 0;

  values.forEach((value, index) => {
    const weight = Math.pow(0.72, index);
    total += value * weight;
    weightTotal += weight;
  });

  return weightTotal > 0 ? total / weightTotal : undefined;
}

export function computeRankingGlobal(
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

export function clampScore(
  value: number,
  scale: { minScore: number; maxScore: number },
) {
  if (Number.isNaN(value)) {
    return scale.minScore;
  }
  return Math.max(scale.minScore, Math.min(scale.maxScore, value));
}

export async function loadScaleConfig(tx: Prisma.TransactionClient) {
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
