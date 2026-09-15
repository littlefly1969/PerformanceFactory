import { DEFAULT_SCALE } from './orchestrator-model';
import {
  buildSnapshotArea,
  clampScore,
  computeRankingGlobal,
  interpolateRealScore,
  weightedHistoricalAverage,
} from './performance-scoring';

describe('performance scoring', () => {
  it.each([
    [undefined, undefined, undefined, 0],
    [undefined, 60, 50, 60],
    [undefined, undefined, 50, 50],
    [80, undefined, undefined, 80],
    [80, undefined, 60, 74],
    [80, 60, undefined, 73],
    [80, 60, 40, 68],
  ])(
    'interpolates current=%s latest=%s history=%s',
    (current, latest, history, expected) => {
      expect(interpolateRealScore(current, latest, history)).toBeCloseTo(
        expected,
      );
    },
  );

  it('gives more weight to recent history and handles missing history', () => {
    expect(weightedHistoricalAverage([])).toBeUndefined();
    expect(weightedHistoricalAverage([80])).toBe(80);
    expect(weightedHistoricalAverage([100, 0])).toBeCloseTo(58.1395);
    expect(weightedHistoricalAverage([0, 100])).toBeLessThan(50);
  });

  it.each([
    [NaN, 0],
    [-10, 0],
    [150, 100],
    [42, 42],
  ])('clamps %s to %s', (value, expected) => {
    expect(clampScore(value, DEFAULT_SCALE)).toBe(expected);
  });

  it('keeps potential within the scale and never below real performance', () => {
    const area = { id: 'area', name: 'Strength' };
    expect(buildSnapshotArea(area, [], new Map(), DEFAULT_SCALE)).toEqual({
      areaId: 'area',
      realR: 0,
      potentialP: 100,
    });
    const snapshot = buildSnapshotArea(
      area,
      [{ areaId: 'area', realR: 90, potentialP: 90 }],
      new Map([['area', { total: 100, count: 1 }]]),
      DEFAULT_SCALE,
    );
    expect(snapshot.realR).toBeCloseTo(95.5);
    expect(snapshot.potentialP).toBe(100);
  });

  it('normalizes ranking, including empty or invalid scales', () => {
    expect(computeRankingGlobal([], DEFAULT_SCALE)).toBe(0);
    expect(
      computeRankingGlobal([{ realR: 50 }], { minScore: 10, maxScore: 10 }),
    ).toBe(0);
    expect(
      computeRankingGlobal([{ realR: 20 }, { realR: 80 }], DEFAULT_SCALE),
    ).toBe(50);
    expect(computeRankingGlobal([{ realR: 200 }], DEFAULT_SCALE)).toBe(100);
    expect(computeRankingGlobal([{ realR: -20 }], DEFAULT_SCALE)).toBe(0);
  });
});
