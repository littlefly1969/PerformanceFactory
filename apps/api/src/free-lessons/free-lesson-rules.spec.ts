import {
  DEFAULT_FREE_LESSON_SETTINGS as settings,
  MICRO_TEST_GENERATION,
  canClaimGeneration,
  creditEntries,
  fitsCalibration,
  freeLessonSettingsProblems,
  lessonEligibility,
  microTestOptionProblems,
  microTestTargets,
} from './free-lesson-rules';
import { ratingScore } from '../discovery/calibration/lesson-evidence';

const base = {
  calibrationStatus: 'FREE_LEVEL_ESTIMATED',
  credits: 100,
  creditsToUnlock: 100,
  clubs: 1,
  seatStatus: null,
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

  it('requires the estimated level, the credits and a club, with R still open', () => {
    expect(lessonEligibility(base)).toEqual({ phase: 'ELIGIBLE', missing: [] });
    expect(
      lessonEligibility({
        ...base,
        calibrationStatus: 'FREE_CALIBRATING',
        credits: 40,
        clubs: 0,
      }),
    ).toEqual({ phase: 'LOCKED', missing: ['LEVEL', 'CREDITS', 'CLUB'] });
    // Soglia 0: resta la sola regola del Blueprint.
    expect(
      lessonEligibility({ ...base, credits: 0, creditsToUnlock: 0 }).phase,
    ).toBe('ELIGIBLE');
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

  it('keeps the lesson far enough from the calibration deadline', () => {
    const deadline = new Date('2026-11-01T00:00:00Z');
    expect(
      fitsCalibration(new Date('2026-10-30T00:00:00Z'), deadline, settings),
    ).toBe(true);
    expect(
      fitsCalibration(new Date('2026-10-30T00:00:01Z'), deadline, settings),
    ).toBe(false);
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

  it('targets the least reliable drivers for the AI micro-tests', () => {
    expect(
      microTestTargets(
        [
          { areaId: 'a', confidence: 70 },
          { areaId: 'b', confidence: 20 },
          { areaId: 'c', confidence: 40 },
        ],
        2,
      ).map((a) => a.areaId),
    ).toEqual(['b', 'c']);
  });

  it('lets one request at a time generate a batch, with bounded retries', () => {
    const now = new Date('2026-10-10T10:00:00Z');
    const ago = (ms: number) => new Date(now.getTime() - ms);
    const { leaseMs, retryAfterMs, maxAttempts } = MICRO_TEST_GENERATION;
    const row = (status: string, claimedAt: Date | null, attempts = 1) => ({
      status,
      claimedAt,
      attempts,
    });
    expect(canClaimGeneration(null, now)).toBe(true);
    expect(canClaimGeneration(row('PENDING', null, 0), now)).toBe(true);
    expect(canClaimGeneration(row('RUNNING', ago(1000)), now)).toBe(false);
    expect(canClaimGeneration(row('RUNNING', ago(leaseMs + 1)), now)).toBe(
      true,
    );
    expect(canClaimGeneration(row('FAILED', ago(1000)), now)).toBe(false);
    expect(canClaimGeneration(row('FAILED', ago(retryAfterMs + 1)), now)).toBe(
      true,
    );
    expect(
      canClaimGeneration(
        row('FAILED', ago(retryAfterMs + 1), maxAttempts),
        now,
      ),
    ).toBe(false);
    expect(canClaimGeneration(row('READY', ago(retryAfterMs + 1)), now)).toBe(
      false,
    );
  });
});
