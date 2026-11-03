import { streakOf } from './home-micro-test';
import { weakestAreas } from './home-micro-test-prepare';
import {
  DEFAULT_FREE_LESSON_SETTINGS,
  creditEntries,
} from '../../free-lessons/free-lesson-rules';

describe('home micro-test', () => {
  // Mercoledì 4 novembre 2026, ore 10 in Italia.
  const now = new Date('2026-11-04T09:00:00Z');

  it('counts consecutive days with an activity, Italian calendar', () => {
    const streak = streakOf(
      [
        new Date('2026-11-04T08:00:00Z'),
        new Date('2026-11-03T22:30:00Z'), // 23:30 del 3 in Italia
        new Date('2026-11-02T20:00:00Z'),
        new Date('2026-10-31T10:00:00Z'),
      ],
      now,
    );
    expect(streak.days).toBe(3); // 2, 3 e 4 novembre; il 31 ottobre è staccato
  });

  it('keeps the streak alive until the end of the day and marks the week from Monday', () => {
    const streak = streakOf(
      [new Date('2026-11-03T10:00:00Z'), new Date('2026-11-02T10:00:00Z')],
      now,
    );
    expect(streak.days).toBe(2);
    expect(streak.week).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(streakOf([], now)).toEqual({ days: 0, week: Array(7).fill(false) });
  });

  it('picks the three weakest areas, skipping the last micro-test area', () => {
    const areas = [
      { areaId: 'a', score: 60, confidence: 50 },
      { areaId: 'b', score: 40, confidence: 70 },
      { areaId: 'c', score: 40, confidence: 30 },
      { areaId: 'd', score: 55, confidence: 50 },
      { areaId: 'e', score: 80, confidence: 50 },
    ];
    expect(weakestAreas(areas)).toEqual(['c', 'b', 'd']);
    expect(weakestAreas(areas, 'c')).toEqual(['b', 'd', 'a']);
    expect(weakestAreas([areas[0]], 'a')).toEqual(['a']);
  });

  it('gives micro-test rounds the micro-test credits from the back office', () => {
    expect(
      creditEntries(
        {
          initialEvaluationId: null,
          evaluatedRoundIds: ['r1'],
          microTestCompletionIds: [],
          microTestRoundIds: ['r2'],
        },
        DEFAULT_FREE_LESSON_SETTINGS,
      ),
    ).toEqual([
      { action: 'CALIBRATION_ROUND', points: 20, sourceKey: 'round:r1' },
      { action: 'MICRO_TEST', points: 10, sourceKey: 'round:r2' },
    ]);
  });
});
