import {
  DEFAULT_CALIBRATION_SETTINGS as settings,
  NO_LESSON,
  dayOf,
  daysLeft,
  deadlineReached,
  finishProblem,
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

  it('keeps asking on the least known drivers once the rule is met', () => {
    expect(
      focusDrivers(
        { overallConfidence: 80, drivers: drivers(90, 75) },
        rule,
      ).map((d) => d.areaId),
    ).toEqual(['a1', 'a0']);
  });

  it('estimates the level and keeps calibrating once R is consolidated', () => {
    expect(
      statusAfterEvaluation(
        'FREE_CALIBRATING',
        evaluation(45, 55, 40, 50),
        settings,
        rule,
      ),
    ).toEqual({ status: 'FREE_LEVEL_ESTIMATED', levelEstimated: true });
    // Regola soddisfatta senza lezione: R consolidata, la calibrazione resta aperta.
    expect(
      statusAfterEvaluation(
        'FREE_LEVEL_ESTIMATED',
        evaluation(80, 80, 70, 90),
        settings,
        rule,
      ),
    ).toEqual({ status: 'FREE_LEVEL_ESTIMATED', levelEstimated: false });
  });

  it('AT-11: many answers with low quality do not consolidate R', () => {
    // Le aree sono sopra soglia, ma la confidence complessiva resta bassa.
    expect(
      statusAfterEvaluation(
        'FREE_LEVEL_ESTIMATED',
        evaluation(40, 80, 75, 90),
        settings,
        rule,
        { ...NO_LESSON, done: true },
      ).status,
    ).toBe('FREE_LEVEL_ESTIMATED');
  });

  it('AT-19/AT-27: no round count consolidates a weak R', () => {
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

  it('a pending free lesson keeps the calibration open, even with R consolidated', () => {
    const pending = { ...NO_LESSON, pending: true };
    expect(
      statusAfterEvaluation(
        'FREE_LESSON_VALIDATION',
        evaluation(80, 80, 75, 90),
        settings,
        rule,
        pending,
      ),
    ).toEqual({ status: 'FREE_LESSON_VALIDATION', levelEstimated: false });
    // Posto ritirato: si torna al livello stimato e si continua.
    expect(
      statusAfterEvaluation(
        'FREE_LESSON_VALIDATION',
        evaluation(80, 80, 75, 90),
        settings,
        rule,
        NO_LESSON,
      ),
    ).toEqual({ status: 'FREE_LEVEL_ESTIMATED', levelEstimated: false });
  });

  it('closes by itself only with the lesson done and R consolidated', () => {
    const done = { ...NO_LESSON, done: true };
    expect(
      statusAfterEvaluation(
        'FREE_LESSON_VALIDATION',
        evaluation(80, 80, 75, 90),
        settings,
        rule,
        done,
      ),
    ).toEqual({
      status: 'CALIBRATION_COMPLETED',
      completionReason: 'CONFIDENCE_REACHED',
      levelEstimated: false,
    });
    // Lezione svolta ma R non ancora consolidata: si continua.
    expect(
      statusAfterEvaluation(
        'FREE_LESSON_VALIDATION',
        evaluation(60, 80, 40, 90),
        settings,
        rule,
        done,
      ),
    ).toEqual({ status: 'FREE_LEVEL_ESTIMATED', levelEstimated: false });
  });

  it('lets the athlete finish only with R consolidated and no lesson to wait for', () => {
    expect(finishProblem(false, NO_LESSON)).toBe('CALIBRATION_NOT_READY');
    expect(finishProblem(true, { ...NO_LESSON, pending: true })).toBe(
      'CALIBRATION_WAITING_LESSON',
    );
    expect(finishProblem(true, { ...NO_LESSON, available: true })).toBe(
      'CALIBRATION_LESSON_CHOICE',
    );
    expect(finishProblem(true, NO_LESSON)).toBeNull();
    expect(finishProblem(true, { ...NO_LESSON, done: true })).toBeNull();
  });

  it('closes at the deadline and counts the days left', () => {
    expect(deadlineReached(day(31), day(30))).toBe(false);
    expect(deadlineReached(day(31), day(31))).toBe(true);
    expect(daysLeft(day(31), day(30))).toBe(1);
    expect(daysLeft(day(31), day(1))).toBe(30);
    expect(daysLeft(day(31), day(40))).toBe(0);
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

  it('needs banned words for the micro-tests, while the training list may stay empty', () => {
    expect(settings.unsafeTrainingTerms).toEqual([]);
    expect(
      settingsProblems({ ...settings, unsafeMicroTestTerms: [] }),
    ).toHaveLength(1);
    expect(
      settingsProblems({ ...settings, unsafeTrainingTerms: ['x'.repeat(61)] }),
    ).toHaveLength(1);
  });

  it('accepts 0-50 questions per micro-test, 0 meaning no indication', () => {
    expect(settings.questionsPerMicroTest).toBe(0);
    expect(
      settingsProblems({ ...settings, questionsPerMicroTest: 51 }),
    ).toHaveLength(1);
    expect(
      settingsProblems({ ...settings, questionsPerMicroTest: -1 }),
    ).toHaveLength(1);
  });
});
