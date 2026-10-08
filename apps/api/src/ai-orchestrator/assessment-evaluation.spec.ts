import { BadGatewayException, Logger } from '@nestjs/common';
import {
  buildAssessmentPrompt,
  evaluateAssessment,
  stubAssessmentEvaluation,
  validateAssessmentEvaluation,
} from './assessment-evaluation';
import { AssessmentEvaluationInput } from './assessment-evaluation-model';
import { requestStructuredProposal } from './proposal-structured-transport';

jest.mock('./proposal-structured-transport', () => ({
  requestStructuredProposal: jest.fn(),
}));

const range = { min: 0, max: 100 };
const input: AssessmentEvaluationInput = {
  basePrompt: 'Prompt di prova modificabile.',
  promptVersionId: 'version-1',
  scale: { minScore: 0, maxScore: 100 },
  athleteContext: [{ question: 'Sport', answer: 'Padel' }],
  availability: [{ question: 'Giorni', answer: '3 giorni' }],
  drivers: [
    {
      areaId: 'tecnica',
      name: 'Tecnica',
      answers: [
        {
          question: 'A',
          answer: 'Alto',
          optionScore: 100,
          optionScoreRange: range,
        },
        {
          question: 'B',
          answer: 'Medio',
          optionScore: 50,
          optionScoreRange: range,
        },
      ],
    },
    {
      areaId: 'mental',
      name: 'Mental',
      answers: [
        {
          question: 'C',
          answer: 'Basso',
          optionScore: 0,
          optionScoreRange: range,
        },
        {
          question: 'D',
          answer: 'Basso',
          optionScore: 20,
          optionScoreRange: range,
        },
      ],
    },
  ],
};
const driver = (areaId: string, extra: object = {}) => ({
  areaId,
  score: 60,
  confidence: 30,
  rationale: 'Motivazione breve.',
  evidenceGaps: ['Un micro-test.'],
  commitment: 'MEDIUM',
  ...extra,
});
const valid = (drivers: object[]) => ({
  summary: 'Sintesi provvisoria.',
  overallConfidence: 30,
  level: 'INTERMEDIATE',
  levelConfidence: 35,
  drivers,
});

describe('assessment evaluation', () => {
  const previous = process.env.AI_PROVIDER;
  afterEach(() => {
    process.env.AI_PROVIDER = previous;
    jest.mocked(requestStructuredProposal).mockReset();
  });

  it('stub normalizes option scores per driver with low confidence and no potential', () => {
    const output = stubAssessmentEvaluation(input);
    expect(output.drivers).toEqual([
      expect.objectContaining({ areaId: 'tecnica', score: 75, confidence: 30 }),
      expect.objectContaining({ areaId: 'mental', score: 10, confidence: 30 }),
    ]);
    expect(output.overallConfidence).toBe(30);
    expect(validateAssessmentEvaluation(output, input)).toEqual(output);
    expect(JSON.stringify(output)).not.toMatch(/potential|P3|P6|P12/);
  });

  it('accepts a complete output and reorders drivers as received', () => {
    const output = validateAssessmentEvaluation(
      valid([driver('mental'), driver('tecnica', { score: 72.46 })]),
      input,
    );
    expect(output?.drivers.map((d) => [d.areaId, d.score])).toEqual([
      ['tecnica', 72.5],
      ['mental', 60],
    ]);
  });

  it.each([
    ['a missing driver', valid([driver('tecnica')]), 'driver mancante: mental'],
    [
      'an unknown driver',
      valid([driver('tecnica'), driver('mental'), driver('nutrizione')]),
      'driver inatteso',
    ],
    [
      'a duplicated driver',
      valid([driver('tecnica'), driver('tecnica'), driver('mental')]),
      'duplicato',
    ],
    [
      'a score outside the scale',
      valid([driver('tecnica', { score: 140 }), driver('mental')]),
      'score fuori scala',
    ],
    [
      'a score given as text',
      valid([driver('tecnica', { score: '60' }), driver('mental')]),
      'score fuori scala',
    ],
    [
      'a non-integer confidence',
      valid([driver('tecnica', { confidence: 0.4 }), driver('mental')]),
      'confidence non valida',
    ],
    [
      'an empty rationale',
      valid([driver('tecnica', { rationale: ' ' }), driver('mental')]),
      'rationale non valida',
    ],
    [
      'too many evidence gaps',
      valid([
        driver('tecnica', { evidenceGaps: ['a', 'b', 'c', 'd'] }),
        driver('mental'),
      ]),
      'evidenceGaps non validi',
    ],
    [
      'an unknown level',
      { ...valid([driver('tecnica'), driver('mental')]), level: 'EXPERT' },
      'level non valido',
    ],
    [
      'an unknown commitment',
      valid([driver('tecnica', { commitment: 'TOTAL' }), driver('mental')]),
      'commitment non valido',
    ],
    [
      'a missing summary',
      { ...valid([driver('tecnica'), driver('mental')]), summary: '' },
      'summary non valido',
    ],
  ])('rejects %s', (_label, raw, problem) => {
    const problems: string[] = [];
    expect(validateAssessmentEvaluation(raw, input, problems)).toBeNull();
    expect(problems.join(' ')).toContain(problem);
  });

  it('puts the editable prompt first and the fixed format contract after it', () => {
    const prompt = buildAssessmentPrompt(input);
    expect(prompt.system.startsWith('Prompt di prova modificabile.')).toBe(
      true,
    );
    expect(prompt.system).toContain('FORMATO DI RISPOSTA (fisso)');
    expect(prompt.system).toContain('esattamente una voce per ciascuno dei 2');
    expect(prompt.user.drivers).toBe(input.drivers);
  });

  it('runs the deterministic stub without calling an external provider', async () => {
    process.env.AI_PROVIDER = 'stub';
    const result = await evaluateAssessment(new Logger('test'), input);
    expect(result).toMatchObject({
      provider: 'stub',
      model: 'deterministic-stub',
    });
    expect(result.inputJson).toMatchObject({ promptVersionId: 'version-1' });
    expect(requestStructuredProposal).not.toHaveBeenCalled();
  });

  it('validates the external provider output and refuses an invalid one', async () => {
    process.env.AI_PROVIDER = 'openai';
    jest.mocked(requestStructuredProposal).mockResolvedValueOnce({
      outputText: JSON.stringify(valid([driver('tecnica'), driver('mental')])),
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    const ok = await evaluateAssessment(new Logger('test'), input);
    expect(ok.output.drivers).toHaveLength(2);
    expect(jest.mocked(requestStructuredProposal).mock.calls[0][5]).toBe(
      'assessment_evaluation',
    );

    jest.mocked(requestStructuredProposal).mockResolvedValueOnce({
      outputText: 'non json',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    await expect(
      evaluateAssessment(new Logger('test'), input),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
