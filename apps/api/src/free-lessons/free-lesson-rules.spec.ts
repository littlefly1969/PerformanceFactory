import {
  DEFAULT_FREE_LESSON_SETTINGS as settings,
  creditEntries,
  freeLessonSettingsProblems,
  lessonEligibility,
  microTestOptionProblems,
} from './free-lesson-rules';
import { ratingScore } from '../discovery/calibration/lesson-evidence';

const base = {
  calibrationStatus: 'FREE_LEVEL_ESTIMATED',
  eligibilityMet: true,
  clubs: 1,
  seatStatus: null,
  declined: false,
};

describe('free lesson rules', () => {
  it('credits each source event once with stable keys', () => {
    const entries = creditEntries(
      {
        initialEvaluationId: 'e1',
        evaluatedRoundIds: ['r1', 'r2'],
        microTestCompletionIds: ['m1'],
      },
      settings,
    );
    expect(entries).toEqual([
      { action: 'INITIAL_ASSESSMENT', points: 30, sourceKey: 'assessment:e1' },
      { action: 'CALIBRATION_ROUND', points: 20, sourceKey: 'round:r1' },
      { action: 'CALIBRATION_ROUND', points: 20, sourceKey: 'round:r2' },
      { action: 'MICRO_TEST', points: 10, sourceKey: 'micro-test:m1' },
    ]);
    expect(
      creditEntries(
        {
          initialEvaluationId: 'e1',
          evaluatedRoundIds: [],
          microTestCompletionIds: ['m1'],
        },
        { ...settings, creditsMicroTest: 0 },
      ).map((e) => e.action),
    ).toEqual(['INITIAL_ASSESSMENT']);
  });

  it('AT-14/AT-15/AT-16: needs the level and the eligibility rule, then a club, never credits', () => {
    expect(lessonEligibility(base)).toEqual({ phase: 'ELIGIBLE', missing: [] });
    // AT-14: confidence insufficiente, nessuno sblocco.
    expect(
      lessonEligibility({
        ...base,
        calibrationStatus: 'FREE_CALIBRATING',
        eligibilityMet: false,
      }),
    ).toEqual({ phase: 'LOCKED', missing: ['LEVEL', 'CONFIDENCE'] });
    // AT-16: eleggibile ma territorio non servito, nessuna promessa.
    expect(lessonEligibility({ ...base, clubs: 0 })).toEqual({
      phase: 'UNAVAILABLE',
      missing: [],
    });
    expect(
      lessonEligibility({ ...base, calibrationStatus: 'CALIBRATION_COMPLETED' })
        .phase,
    ).toBe('CLOSED');
    expect(
      lessonEligibility({ ...base, calibrationStatus: 'PAYWALL_READY' }).phase,
    ).toBe('CLOSED');
    expect(lessonEligibility({ ...base, calibrationStatus: null }).phase).toBe(
      'UNAVAILABLE',
    );
  });

  it('AT-18: a declined or withdrawn lesson stays a reversible choice', () => {
    expect(lessonEligibility({ ...base, declined: true }).phase).toBe(
      'DECLINED',
    );
    expect(lessonEligibility({ ...base, seatStatus: 'WITHDRAWN' }).phase).toBe(
      'DECLINED',
    );
    // La rinuncia non scavalca le condizioni mancanti.
    expect(
      lessonEligibility({ ...base, declined: true, eligibilityMet: false }),
    ).toEqual({ phase: 'LOCKED', missing: ['CONFIDENCE'] });
  });

  it('lets the seat decide the phase, and a used seat stays used', () => {
    expect(lessonEligibility({ ...base, seatStatus: 'REQUESTED' }).phase).toBe(
      'REQUESTED',
    );
    expect(
      lessonEligibility({
        ...base,
        calibrationStatus: 'FREE_LESSON_VALIDATION',
        seatStatus: 'ASSIGNED',
      }).phase,
    ).toBe('ASSIGNED');
    expect(
      lessonEligibility({
        ...base,
        calibrationStatus: 'CALIBRATION_COMPLETED',
        seatStatus: 'ATTENDED',
      }).phase,
    ).toBe('ATTENDED');
    expect(lessonEligibility({ ...base, seatStatus: 'NO_SHOW' }).phase).toBe(
      'NO_SHOW',
    );
  });

  it('validates micro-test outcomes and settings', () => {
    const scale = { minScore: 0, maxScore: 100 };
    expect(
      microTestOptionProblems(
        [
          { value: 'a', label: 'A', score: 20 },
          { value: 'b', label: 'B', score: 80 },
        ],
        scale,
      ),
    ).toEqual([]);
    expect(
      microTestOptionProblems(
        [
          { value: 'a', label: 'A', score: 20 },
          { value: 'a', label: 'B', score: 180 },
        ],
        scale,
      ),
    ).toHaveLength(2);
    expect(freeLessonSettingsProblems(settings)).toEqual([]);
    expect(
      freeLessonSettingsProblems({ ...settings, creditsToUnlock: -1 }),
    ).toHaveLength(1);
  });

  it('maps the coach rating onto the evaluation scale', () => {
    const scale = { minScore: 0, maxScore: 100 };
    expect([1, 3, 5].map((r) => ratingScore(r, scale))).toEqual([0, 50, 100]);
  });
});
