import {
  DEFAULT_CALIBRATION_SETTINGS as settings,
  dayOf,
  nextRoundAt,
  nextRoundKind,
  roundTargets,
  settingsProblems,
  statusAfterEvaluation,
} from './calibration-rules';

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 10));
const drivers = (...confidences: number[]) =>
  confidences.map((confidence, i) => ({ areaId: `a${i}`, confidence }));

describe('calibration rules', () => {
  it('counts days from the first evaluation and switches to closing on day 25', () => {
    expect(dayOf(day(1), day(1))).toBe(1);
    expect(dayOf(day(1), day(24))).toBe(24);
    expect(nextRoundKind(day(1), day(24), settings)).toBe('ADAPTIVE');
    expect(nextRoundKind(day(1), day(25), settings)).toBe('CLOSING');
  });

  it('targets the least reliable drivers below threshold', () => {
    const list = drivers(60, 20, 80, 45);
    expect(
      roundTargets(list, 'ADAPTIVE', settings).map((d) => d.areaId),
    ).toEqual(['a1', 'a3']);
    expect(
      roundTargets(list, 'CLOSING', settings).map((d) => d.areaId),
    ).toEqual(['a1', 'a3', 'a0']);
  });

  it('waits the configured hours between rounds', () => {
    expect(nextRoundAt(null, settings)).toBeNull();
    expect(nextRoundAt(day(1), settings)).toEqual(
      new Date(day(1).getTime() + 20 * 60 * 60 * 1000),
    );
  });

  it('estimates the level, then completes at threshold', () => {
    expect(
      statusAfterEvaluation(
        'FREE_CALIBRATING',
        { levelConfidence: 55, drivers: drivers(40, 50) },
        settings,
        'ADAPTIVE',
      ),
    ).toEqual({ status: 'FREE_LEVEL_ESTIMATED', levelEstimated: true });
    expect(
      statusAfterEvaluation(
        'FREE_LEVEL_ESTIMATED',
        { levelConfidence: 80, drivers: drivers(70, 90) },
        settings,
        'ADAPTIVE',
      ),
    ).toEqual({
      status: 'CALIBRATION_COMPLETED',
      completionReason: 'CONFIDENCE_REACHED',
      levelEstimated: false,
    });
  });

  it('closes with the closing assessment even below threshold', () => {
    expect(
      statusAfterEvaluation(
        'FREE_CALIBRATING',
        { levelConfidence: 30, drivers: drivers(40, 50) },
        settings,
        'CLOSING',
      ),
    ).toMatchObject({
      status: 'CALIBRATION_COMPLETED',
      completionReason: 'CLOSING_ASSESSMENT',
    });
  });

  it('never reopens a completed calibration', () => {
    expect(
      statusAfterEvaluation(
        'CALIBRATION_COMPLETED',
        { levelConfidence: 10, drivers: drivers(10) },
        settings,
        'ADAPTIVE',
      ).status,
    ).toBe('CALIBRATION_COMPLETED');
  });

  it('refuses a closing day after the deadline', () => {
    expect(settingsProblems({ ...settings, closingDay: 31 })).toHaveLength(1);
  });

  it('keeps R open while the free lesson is pending, except at the closing assessment', () => {
    const above = { levelConfidence: 80, drivers: drivers(75, 90) };
    expect(
      statusAfterEvaluation(
        'FREE_LESSON_VALIDATION',
        above,
        settings,
        'ADAPTIVE',
        true,
      ),
    ).toEqual({ status: 'FREE_LESSON_VALIDATION', levelEstimated: false });
    expect(
      statusAfterEvaluation(
        'FREE_LESSON_VALIDATION',
        above,
        settings,
        'CLOSING',
        true,
      ).status,
    ).toBe('CALIBRATION_COMPLETED');
    // Feedback valutato: la soglia torna a chiudere.
    expect(
      statusAfterEvaluation(
        'FREE_LESSON_VALIDATION',
        above,
        settings,
        'ADAPTIVE',
        false,
      ).completionReason,
    ).toBe('CONFIDENCE_REACHED');
    expect(
      statusAfterEvaluation(
        'FREE_LESSON_VALIDATION',
        { levelConfidence: 80, drivers: drivers(40, 90) },
        settings,
        'ADAPTIVE',
        false,
      ),
    ).toEqual({ status: 'FREE_LEVEL_ESTIMATED', levelEstimated: false });
  });
});
