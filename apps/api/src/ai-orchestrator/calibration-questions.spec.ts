import { BadGatewayException, Logger } from '@nestjs/common';
import {
  CalibrationQuestionsInput,
  buildCalibrationPrompt,
  generateCalibrationQuestions,
  stubCalibrationQuestions,
  validateCalibrationQuestions,
} from './calibration-questions';
import { requestStructuredProposal } from './proposal-structured-transport';

jest.mock('./proposal-structured-transport', () => ({
  requestStructuredProposal: jest.fn(),
}));

const input: CalibrationQuestionsInput = {
  basePrompt: 'Prompt di calibrazione modificabile.',
  promptVersionId: 'version-1',
  kind: 'ADAPTIVE',
  questionsPerDriver: 2,
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
    },
  ],
};
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

  it('keeps option scores and numbers questions and options', () => {
    const questions = validateCalibrationQuestions(
      { questions: [question(), question({ text: 'Altra domanda?' })] },
      input,
    );
    expect(questions?.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(questions?.[0].options[2]).toEqual({
      value: '2',
      label: 'Più di 6',
      score: 80,
    });
  });

  it.each([
    ['a wrong number of questions', { questions: [question()] }, 'attese 2'],
    [
      'an unexpected driver',
      { questions: [question(), question({ areaId: 'mental' })] },
      'driver inatteso',
    ],
    [
      'an option outside the scale',
      {
        questions: [
          question(),
          question({
            options: [
              { label: 'A', score: 0 },
              { label: 'B', score: 50 },
              { label: 'C', score: 140 },
            ],
          }),
        ],
      },
      'opzione non valida',
    ],
    [
      'too few options',
      {
        questions: [
          question(),
          question({ options: [{ label: 'Sì', score: 100 }] }),
        ],
      },
      'numero di opzioni',
    ],
  ])('rejects %s', (_label, raw, problem) => {
    const problems: string[] = [];
    expect(validateCalibrationQuestions(raw, input, problems)).toBeNull();
    expect(problems.join(' ')).toContain(problem);
  });

  it('stub output passes its own contract', () => {
    expect(
      validateCalibrationQuestions(stubCalibrationQuestions(input), input),
    ).toHaveLength(2);
  });

  it('sends targets with their gaps and the fixed format after the editable prompt', () => {
    const prompt = buildCalibrationPrompt({ ...input, kind: 'CLOSING' });
    expect(prompt.system.startsWith('Prompt di calibrazione')).toBe(true);
    expect(prompt.system).toContain('esattamente 2 domande');
    expect(prompt.user.task).toMatch(/chiusura/);
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
