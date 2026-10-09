import {
  DEFAULT_POTENTIAL_PROMPT,
  PotentialGenerationInput,
  buildPotentialPrompt,
  potentialBounds,
  stubPotential,
  validatePotential,
} from './potential-generation';

const input: PotentialGenerationInput = {
  basePrompt: DEFAULT_POTENTIAL_PROMPT,
  promptVersionId: null,
  scale: { min: 0, max: 100 },
  level: 'INTERMEDIATE',
  levelConfidence: 80,
  daysPerWeek: 3,
  drivers: [
    {
      areaId: 'a',
      name: 'Tecnica',
      score: 40,
      confidence: 70,
      commitment: 'HIGH',
      rationale: 'r',
      evidenceGaps: [],
    },
    {
      areaId: 'b',
      name: 'Fisico',
      score: 85,
      confidence: 90,
      commitment: 'LOW',
      rationale: 'r',
      evidenceGaps: [],
    },
  ],
};

type Scenario = {
  areaId: string;
  horizon: string;
  value: number;
  confidence: number;
  rationale: string;
};
const valid = () => stubPotential(input).scenarios as Scenario[];
const tweak = (change: (s: Scenario[]) => void) => {
  const scenarios = valid();
  change(scenarios);
  const problems: string[] = [];
  return {
    result: validatePotential({ scenarios }, input, problems),
    problems,
  };
};
const find = (s: Scenario[], areaId: string, horizon: string) =>
  s.find((x) => x.areaId === areaId && x.horizon === horizon)!;

describe('potential generation criteria', () => {
  it('bounds P by the level ceiling and confidence by the horizon', () => {
    expect(potentialBounds(input, input.drivers[0])).toEqual({
      PROGRAM_3M: { maxValue: 60, maxConfidence: 63 },
      PROGRAM_6M: { maxValue: 70, maxConfidence: 52 },
      PROGRAM_12M: { maxValue: 78, maxConfidence: 42 },
    });
    // Già oltre il tetto del livello: P può solo restare R.
    expect(potentialBounds(input, input.drivers[1]).PROGRAM_12M).toEqual({
      maxValue: 85,
      maxConfidence: 48,
    });
  });

  it('accepts a complete proposal within the criteria', () => {
    expect(validatePotential(stubPotential(input), input)).toHaveLength(6);
  });

  it.each([
    [
      'above the criteria',
      (s: Scenario[]) => (find(s, 'a', 'PROGRAM_3M').value = 61),
      'valore fuori criteri: a:PROGRAM_3M',
    ],
    [
      'below the current R',
      (s: Scenario[]) => (find(s, 'b', 'PROGRAM_3M').value = 84),
      'valore fuori criteri: b:PROGRAM_3M',
    ],
    [
      'declining with the horizon',
      (s: Scenario[]) => (find(s, 'a', 'PROGRAM_12M').value = 50),
      'potenziale in calo: a:PROGRAM_12M',
    ],
    [
      'more confident further away',
      (s: Scenario[]) => {
        find(s, 'a', 'PROGRAM_3M').confidence = 10;
      },
      'confidenza in crescita: a:PROGRAM_6M',
    ],
    [
      'over the confidence limit',
      (s: Scenario[]) => (find(s, 'a', 'PROGRAM_3M').confidence = 64),
      'confidenza fuori criteri: a:PROGRAM_3M',
    ],
    [
      'missing a horizon',
      (s: Scenario[]) => s.splice(s.indexOf(find(s, 'b', 'PROGRAM_6M')), 1),
      'scenari mancanti per b',
    ],
    [
      'for an unknown driver',
      (s: Scenario[]) => s.push({ ...s[0], areaId: 'x' }),
      'scenario inatteso o ripetuto: x:PROGRAM_3M',
    ],
    [
      'without a rationale',
      (s: Scenario[]) => (s[0].rationale = ' '),
      'motivazione non valida: a:PROGRAM_3M',
    ],
  ])('rejects a proposal %s', (_, change, problem) => {
    const { result, problems } = tweak(change);
    expect(result).toBeNull();
    expect(problems).toContain(problem);
  });

  it('sends the bounds and the criteria version to the AI', () => {
    const prompt = buildPotentialPrompt(input);
    expect(prompt.user.criteria).toBe('potential-criteria@1');
    expect(prompt.user.drivers[0].bounds.PROGRAM_6M.maxValue).toBe(70);
    expect(prompt.system).toContain('mai in calo');
  });
});
