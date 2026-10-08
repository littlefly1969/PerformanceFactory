import { BadGatewayException, Logger } from '@nestjs/common';
import {
  CalibrationQuestionsInput,
  buildCalibrationPrompt,
  generateCalibrationQuestions,
  stubCalibrationQuestions,
  validateCalibrationStep,
} from './calibration-questions';
import { requestStructuredProposal } from './proposal-structured-transport';

jest.mock('./proposal-structured-transport', () => ({
  requestStructuredProposal: jest.fn(),
}));

const input: CalibrationQuestionsInput = {
  basePrompt: 'Prompt di calibrazione modificabile.',
  promptVersionId: 'version-1',
  scale: { minScore: 0, maxScore: 100 },
  athleteContext: [],
  targets: [
    {
      areaId: 'tecnica',
      name: 'Tecnica',
      score: 55,
      confidence: 25,
      evidenceGaps: ['Esempi di colpi in partita.'],
      askedQuestions: ['Quanto è regolare il tuo dritto?'],
      focus: true,
    },
    {
      areaId: 'mental',
      name: 'Mental',
      score: 60,
      confidence: 85,
      evidenceGaps: [],
      askedQuestions: [],
      focus: false,
    },
  ],
};
const step = (questions: object[], action = 'ASK_GROUP') => ({
  action,
  rationale: 'Mancano esempi concreti di colpi in partita.',
  questions,
});
const question = (extra: object = {}) => ({
  areaId: 'tecnica',
  text: 'In partita, quante volte su dieci la volée finisce in campo?',
  options: [
    { label: 'Meno di 3', score: 20 },
    { label: 'Da 3 a 6', score: 50 },
    { label: 'Più di 6', score: 80 },
  ],
  ...extra,
});

describe('calibration questions', () => {
  const previous = process.env.AI_PROVIDER;
  afterEach(() => {
    process.env.AI_PROVIDER = previous;
    jest.mocked(requestStructuredProposal).mockReset();
  });

  it('AT-09: accepts a variable group, numbering questions and options', () => {
    const result = validateCalibrationStep(
      step([question(), question({ text: 'Altra domanda?' })]),
      input,
    );
    expect(result).toMatchObject({
      action: 'ASK_GROUP',
      targetAreas: ['tecnica'],
      rationale: 'Mancano esempi concreti di colpi in partita.',
    });
    expect(result?.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(result?.questions[0].options[2]).toEqual({
      value: '2',
      label: 'Più di 6',
      score: 80,
    });
  });

  it('AT-08: accepts a single question and a neutral clarification', () => {
    expect(
      validateCalibrationStep(step([question()], 'ASK_SINGLE'), input)?.action,
    ).toBe('ASK_SINGLE');
    expect(
      validateCalibrationStep(
        step([question()], 'REQUEST_CLARIFICATION'),
        input,
      )?.questions,
    ).toHaveLength(1);
  });

  it.each([
    ['a group of one', step([question()]), 'ASK_GROUP: da 2'],
    [
      'two questions for a single step',
      step([question(), question({ text: 'Altra?' })], 'ASK_SINGLE'),
      'ASK_SINGLE: da 1 a 1',
    ],
    [
      'a group longer than the screen allows',
      step(
        Array.from({ length: 7 }, (_, i) =>
          question({ text: `Domanda ${i}?` }),
        ),
      ),
      'da 2 a 6',
    ],
    [
      'an action the server owns',
      step([], 'READY_FOR_REVEAL'),
      'azione non ammessa',
    ],
    [
      'a step without a reason',
      { ...step([question()], 'ASK_SINGLE'), rationale: '' },
      'motivo',
    ],
    [
      'a driver outside the focus',
      step([question(), question({ areaId: 'mental' })]),
      'driver non in focus',
    ],
    [
      'a question already asked',
      step([
        question(),
        question({ text: 'quanto è regolare  il tuo dritto?' }),
      ]),
      'già fatta',
    ],
    [
      'an option outside the scale',
      step([
        question(),
        question({
          text: 'Altra?',
          options: [
            { label: 'A', score: 0 },
            { label: 'B', score: 50 },
            { label: 'C', score: 140 },
          ],
        }),
      ]),
      'opzione non valida',
    ],
    [
      'too few options',
      step([
        question(),
        question({ text: 'Altra?', options: [{ label: 'Sì', score: 100 }] }),
      ]),
      'numero di opzioni',
    ],
  ])('rejects %s', (_label, raw, problem) => {
    const problems: string[] = [];
    expect(validateCalibrationStep(raw, input, problems)).toBeNull();
    expect(problems.join(' ')).toContain(problem);
  });

  it('stub output passes its own contract, only on drivers in focus', () => {
    expect(
      validateCalibrationStep(stubCalibrationQuestions(input), input),
    ).toMatchObject({ action: 'ASK_SINGLE', targetAreas: ['tecnica'] });
    const both = {
      ...input,
      targets: input.targets.map((t) => ({ ...t, focus: true })),
    };
    expect(
      validateCalibrationStep(stubCalibrationQuestions(both), both)?.questions,
    ).toHaveLength(2);
  });

  it('sends every driver with its focus and the fixed format after the editable prompt', () => {
    const prompt = buildCalibrationPrompt(input);
    expect(prompt.system.startsWith('Prompt di calibrazione')).toBe(true);
    expect(prompt.system).toContain('ASK_SINGLE (esattamente 1 domanda)');
    expect(prompt.system).not.toMatch(/per ciascuno dei/);
    expect(prompt.system).toContain(
      'niente micro-test, esercizi o prove da svolgere',
    );
    expect(prompt.system.indexOf('niente micro-test')).toBeGreaterThan(
      prompt.system.indexOf('FORMATO DI RISPOSTA'),
    );
    expect(prompt.user.drivers.map((d) => d.focus)).toEqual([true, false]);
    expect(prompt.user.drivers[0].evidenceGaps).toEqual([
      'Esempi di colpi in partita.',
    ]);
  });

  it('refuses an invalid external output', async () => {
    process.env.AI_PROVIDER = 'openai';
    jest.mocked(requestStructuredProposal).mockResolvedValueOnce({
      outputText: JSON.stringify({ questions: [] }),
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    await expect(
      generateCalibrationQuestions(new Logger('test'), input),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
