import {
  DEFAULT_CALIBRATION_SETTINGS as settings,
  NO_LESSON,
  dayOf,
  focusDrivers,
  settingsProblems,
  statusAfterEvaluation,
} from './calibration-rules';
import { ConfidenceRule } from './confidence-policy';

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 10));
const drivers = (...confidences: number[]) =>
  confidences.map((confidence, i) => ({ areaId: `a${i}`, confidence }));
const rule: ConfidenceRule = {
  minOverallConfidence: 70,
  minAreaConfidence: 70,
  minAreasAtConfidence: null,
};
const evaluation = (
  overallConfidence: number,
  levelConfidence: number | null,
  ...confidences: number[]
) => ({ overallConfidence, levelConfidence, drivers: drivers(...confidences) });

describe('calibration rules', () => {
  it('counts days from the first evaluation, for information only', () => {
    expect(dayOf(day(1), day(1))).toBe(1);
    expect(dayOf(day(1), day(24))).toBe(24);
  });

  it('AT-07: focuses every driver below the area threshold, none above', () => {
    const list = {
      overallConfidence: 60,
      drivers: drivers(60, 20, 80, 45, 30),
    };
    expect(focusDrivers(list, rule).map((d) => d.areaId)).toEqual([
      'a1',
      'a4',
      'a3',
      'a0',
    ]);
  });

  it('focuses all drivers when only the overall confidence is missing', () => {
    const list = { overallConfidence: 60, drivers: drivers(75, 72, 90) };
    expect(focusDrivers(list, rule).map((d) => d.areaId)).toEqual([
      'a1',
      'a0',
      'a2',
    ]);
  });

  it('has nothing to ask once the rule is met', () => {
    expect(
      focusDrivers({ overallConfidence: 80, drivers: drivers(75, 90) }, rule),
    ).toEqual([]);
  });

  it('estimates the level, then consolidates only when the rule is met', () => {
    expect(
      statusAfterEvaluation(
        'FREE_CALIBRATING',
        evaluation(45, 55, 40, 50),
        settings,
        rule,
      ),
    ).toEqual({ status: 'FREE_LEVEL_ESTIMATED', levelEstimated: true });
    expect(
      statusAfterEvaluation(
        'FREE_LEVEL_ESTIMATED',
        evaluation(80, 80, 70, 90),
        settings,
        rule,
      ),
    ).toEqual({
      status: 'CALIBRATION_COMPLETED',
      completionReason: 'CONFIDENCE_REACHED',
      levelEstimated: false,
    });
  });

  it('AT-11: many answers with low quality do not consolidate R', () => {
    // Le aree sono sopra soglia, ma la confidence complessiva resta bassa.
    expect(
      statusAfterEvaluation(
        'FREE_LEVEL_ESTIMATED',
        evaluation(40, 80, 75, 90),
        settings,
        rule,
      ).status,
    ).toBe('FREE_LEVEL_ESTIMATED');
  });

  it('AT-19/AT-27: no time or round count consolidates a weak R', () => {
    // Nessun parametro di tempo o di round: solo la regola decide.
    expect(settings).not.toHaveProperty('closingDay');
    expect(settings).not.toHaveProperty('minHoursBetweenRounds');
    expect(
      statusAfterEvaluation(
        'FREE_CALIBRATING',
        evaluation(40, 30, 40, 50),
        settings,
        rule,
      ),
    ).toEqual({ status: 'FREE_CALIBRATING', levelEstimated: false });
  });

  it('a pending free lesson holds R until the coach feedback is evaluated', () => {
    const pending = { pending: true, available: false };
    // La regola è soddisfatta, ma è la lezione a chiudere R e P.
    expect(
      statusAfterEvaluation(
        'FREE_LESSON_VALIDATION',
        evaluation(80, 80, 75, 90),
        settings,
        rule,
        pending,
      ),
    ).toEqual({ status: 'FREE_LESSON_VALIDATION', levelEstimated: false });
    expect(
      statusAfterEvaluation(
        'FREE_LESSON_VALIDATION',
        evaluation(80, 80, 75, 90),
        settings,
        rule,
        NO_LESSON,
      ),
    ).toMatchObject({
      status: 'CALIBRATION_COMPLETED',
      completionReason: 'CONFIDENCE_REACHED',
    });
    expect(
      statusAfterEvaluation(
        'FREE_LESSON_VALIDATION',
        evaluation(60, 80, 40, 90),
        settings,
        rule,
        NO_LESSON,
      ),
    ).toEqual({ status: 'FREE_LEVEL_ESTIMATED', levelEstimated: false });
  });

  it('holds R while a lesson can still be booked, and not without one (AT-15/AT-16)', () => {
    const available = { pending: false, available: true };
    // Lezione possibile con il livello stimato: R aspetta la lezione o la rinuncia.
    expect(
      statusAfterEvaluation(
        'FREE_LEVEL_ESTIMATED',
        evaluation(80, 80, 75, 90),
        settings,
        rule,
        available,
      ),
    ).toEqual({ status: 'FREE_LEVEL_ESTIMATED', levelEstimated: false });
    // Livello stimato da questa stessa valutazione: vale già la lezione.
    expect(
      statusAfterEvaluation(
        'FREE_CALIBRATING',
        evaluation(80, 80, 75, 90),
        settings,
        rule,
        available,
      ),
    ).toEqual({ status: 'FREE_LEVEL_ESTIMATED', levelEstimated: true });
    // Senza livello non si compone un gruppo: la lezione non è possibile.
    expect(
      statusAfterEvaluation(
        'FREE_CALIBRATING',
        evaluation(80, 10, 75, 90),
        settings,
        rule,
        available,
      ),
    ).toMatchObject({ status: 'CALIBRATION_COMPLETED' });
    // Territorio non servito o rinuncia: basta la regola di confidence.
    expect(
      statusAfterEvaluation(
        'FREE_LEVEL_ESTIMATED',
        evaluation(80, 80, 75, 90),
        settings,
        rule,
        NO_LESSON,
      ),
    ).toMatchObject({ status: 'CALIBRATION_COMPLETED' });
  });

  it('never reopens a completed calibration', () => {
    expect(
      statusAfterEvaluation(
        'CALIBRATION_COMPLETED',
        evaluation(10, 10, 10),
        settings,
        rule,
      ).status,
    ).toBe('CALIBRATION_COMPLETED');
  });

  it('refuses a level threshold outside 1-100', () => {
    expect(
      settingsProblems({ ...settings, levelConfidenceThreshold: 0 }),
    ).toHaveLength(1);
    expect(settingsProblems(settings)).toEqual([]);
  });
});
