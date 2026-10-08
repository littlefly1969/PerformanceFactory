import {
  DEFAULT_CALIBRATION_SETTINGS as settings,
  dayOf,
  roundTargets,
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

  it('targets the least reliable drivers below the area threshold of the rule', () => {
    const list = { overallConfidence: 60, drivers: drivers(60, 20, 80, 45) };
    expect(roundTargets(list, rule, settings).map((d) => d.areaId)).toEqual([
      'a1',
      'a3',
    ]);
  });

  it('targets the weakest drivers when only the overall confidence is missing', () => {
    const list = { overallConfidence: 60, drivers: drivers(75, 72, 90) };
    expect(roundTargets(list, rule, settings).map((d) => d.areaId)).toEqual([
      'a1',
      'a0',
    ]);
  });

  it('has nothing to ask once the rule is met', () => {
    expect(
      roundTargets(
        { overallConfidence: 80, drivers: drivers(75, 90) },
        rule,
        settings,
      ),
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

  it('AT-18: a pending free lesson never blocks consolidation', () => {
    expect(
      statusAfterEvaluation(
        'FREE_LESSON_VALIDATION',
        evaluation(80, 80, 75, 90),
        settings,
        rule,
        true,
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
        false,
      ),
    ).toEqual({ status: 'FREE_LEVEL_ESTIMATED', levelEstimated: false });
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
