import { BadGatewayException, Logger } from '@nestjs/common';
import {
  buildInitialQuestionsPrompt,
  generateInitialQuestions,
  InitialQuestionsInput,
  stubInitialQuestions,
  validateInitialQuestions,
} from './initial-questions';
import { requestStructuredProposal } from './proposal-structured-transport';

jest.mock('./proposal-structured-transport', () => ({
  requestStructuredProposal: jest.fn(),
}));

const input: InitialQuestionsInput = {
  basePrompt: 'Prompt di prova modificabile.',
  promptVersionId: 'version-1',
  scale: { minScore: 0, maxScore: 100 },
  athleteContext: [{ question: 'Sport', answer: 'Padel' }],
  availability: [{ question: 'Giorni', answer: '3 giorni' }],
  fitRanking: {
    source: 'SELF_DECLARED',
    declaredAt: '2026-10-01T00:00:00.000Z',
    padel: { current: '3ª fascia', best: '2ª fascia' },
    tennis: { current: 'Nessuna classifica', best: 'Nessuna classifica' },
  },
  drivers: [
    { areaId: 'tecnica', name: 'Tecnica' },
    { areaId: 'mental', name: 'Mentale' },
  ],
  questionsPerArea: 2,
};

const question = (areaId: string, text: string, scores = [0, 50, 100]) => ({
  areaId,
  text,
  options: scores.map((score, i) => ({ label: `Opzione ${i}`, score })),
});
const silent = () => new Logger('test');

describe('initial questions', () => {
  const previous = process.env.AI_PROVIDER;
  beforeAll(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation());
  afterEach(() => {
    process.env.AI_PROVIDER = previous;
    jest.mocked(requestStructuredProposal).mockReset();
  });

  it('sends funnel, availability and FIT ranking with the fixed format rules', () => {
    const prompt = buildInitialQuestionsPrompt(input);
    expect(prompt.system).toMatch(/^Prompt di prova modificabile\./);
    expect(prompt.system).toContain('esattamente 2 per ciascuno dei 2 driver');
    expect(prompt.system).toContain('fitRanking');
    expect(prompt.user).toMatchObject({
      fitRanking: input.fitRanking,
      athleteContext: input.athleteContext,
      availability: input.availability,
      questionsPerArea: 2,
    });
  });

  it('stub writes N questions per driver that pass the contract', () => {
    const stub = stubInitialQuestions(input);
    const questions = validateInitialQuestions(stub, input);
    expect(questions?.map((q) => q.areaId)).toEqual([
      'tecnica',
      'tecnica',
      'mental',
      'mental',
    ]);
  });

  it('regroups the questions in the order of the drivers received', () => {
    const questions = validateInitialQuestions(
      {
        questions: [
          question('mental', 'M1'),
          question('tecnica', 'T1'),
          question('mental', 'M2'),
          question('tecnica', 'T2'),
        ],
      },
      input,
    );
    expect(questions?.map((q) => q.text)).toEqual(['T1', 'T2', 'M1', 'M2']);
    expect(questions?.[0].options[2]).toEqual({
      value: '2',
      label: 'Opzione 2',
      score: 100,
    });
  });

  it.each([
    [
      'a missing question',
      [
        question('tecnica', 'T1'),
        question('tecnica', 'T2'),
        question('mental', 'M1'),
      ],
      'Mentale: attese 2 domande, ricevute 1',
    ],
    [
      'an unknown driver',
      [
        question('tecnica', 'T1'),
        question('tecnica', 'T2'),
        question('mental', 'M1'),
        question('mental', 'M2'),
        question('fisico', 'F1'),
      ],
      'driver non richiesto: fisico',
    ],
    [
      'a repeated question',
      [
        question('tecnica', 'T1'),
        question('tecnica', 't1 '),
        question('mental', 'M1'),
        question('mental', 'M2'),
      ],
      'domanda ripetuta (2)',
    ],
    [
      'a score outside the scale',
      [
        question('tecnica', 'T1', [0, 50, 120]),
        question('tecnica', 'T2'),
        question('mental', 'M1'),
        question('mental', 'M2'),
      ],
      'opzione non valida (1.3)',
    ],
    [
      'too few options',
      [
        question('tecnica', 'T1', [0, 100]),
        question('tecnica', 'T2'),
        question('mental', 'M1'),
        question('mental', 'M2'),
      ],
      'numero di opzioni non valido (1)',
    ],
  ])('rejects %s', (_, questions, problem) => {
    const problems: string[] = [];
    expect(validateInitialQuestions({ questions }, input, problems)).toBeNull();
    expect(problems).toContain(problem);
  });

  it('retries an invalid output once, then asks the athlete to retry', async () => {
    process.env.AI_PROVIDER = 'openai';
    const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
    jest
      .mocked(requestStructuredProposal)
      .mockResolvedValueOnce({ outputText: 'non json', usage })
      .mockResolvedValueOnce({
        outputText: JSON.stringify(stubInitialQuestions(input)),
        usage,
      });
    const ok = await generateInitialQuestions(silent(), input);
    expect(ok.attempts).toBe(2);
    expect(ok.questions).toHaveLength(4);
    expect(jest.mocked(requestStructuredProposal).mock.calls[0][5]).toBe(
      'initial_questions',
    );

    jest
      .mocked(requestStructuredProposal)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ outputText: '{}', usage });
    await expect(
      generateInitialQuestions(silent(), input),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
