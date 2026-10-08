import {
  ConfidenceRule,
  INITIAL_CONFIDENCE_RULES,
  checkRule,
  ruleProblems,
} from './confidence-policy';

const areas = (...confidences: number[]) =>
  confidences.map((confidence, i) => ({ areaId: `a${i}`, confidence }));
const rule = (r: Partial<ConfidenceRule>): ConfidenceRule => ({
  minOverallConfidence: null,
  minAreaConfidence: null,
  minAreasAtConfidence: null,
  ...r,
});

describe('confidence policy', () => {
  it('combines overall and per-area criteria', () => {
    const r = rule({ minOverallConfidence: 70, minAreaConfidence: 60 });
    expect(
      checkRule(r, { overallConfidence: 72, drivers: areas(65, 80) }).met,
    ).toBe(true);
    expect(
      checkRule(r, { overallConfidence: 69, drivers: areas(65, 80) }),
    ).toMatchObject({ met: false, overallMet: false });
    expect(
      checkRule(r, { overallConfidence: 90, drivers: areas(55, 80, 40) }),
    ).toMatchObject({ met: false, belowAreas: ['a2', 'a0'], areasMet: 1 });
  });

  it('accepts a minimum number of reliable areas instead of all of them', () => {
    const r = rule({ minAreaConfidence: 60, minAreasAtConfidence: 4 });
    const evaluation = {
      overallConfidence: 50,
      drivers: areas(70, 65, 61, 80, 20, 30),
    };
    expect(checkRule(r, evaluation)).toMatchObject({
      met: true,
      areasMet: 4,
      areasRequired: 4,
    });
    expect(
      checkRule(r, { ...evaluation, drivers: areas(70, 65, 20, 30) }).met,
    ).toBe(false);
  });

  it('AT-10: confidence decides, not the number or pace of answers', () => {
    // La regola non conosce domande, round o tempi: solo confidence.
    expect(
      Object.keys(INITIAL_CONFIDENCE_RULES.R_CONSOLIDATION).sort(),
    ).toEqual([
      'minAreaConfidence',
      'minAreasAtConfidence',
      'minOverallConfidence',
    ]);
  });

  it('is never met without evaluated areas', () => {
    expect(
      checkRule(rule({ minOverallConfidence: 10 }), {
        overallConfidence: 90,
        drivers: [],
      }).met,
    ).toBe(false);
  });

  it('keeps lesson eligibility and consolidation as separate rules', () => {
    expect(INITIAL_CONFIDENCE_RULES.LESSON_ELIGIBILITY).not.toEqual(
      INITIAL_CONFIDENCE_RULES.R_CONSOLIDATION,
    );
    for (const initial of Object.values(INITIAL_CONFIDENCE_RULES))
      expect(ruleProblems(initial)).toEqual([]);
  });

  it('rejects empty or out of range rules', () => {
    expect(ruleProblems(rule({}))).toContain(
      'Indica almeno una soglia di confidence',
    );
    expect(ruleProblems(rule({ minOverallConfidence: 120 }))).toHaveLength(1);
    expect(
      ruleProblems(rule({ minOverallConfidence: 50, minAreasAtConfidence: 3 })),
    ).toContain('Il numero di aree richiede una soglia per area');
  });
});
