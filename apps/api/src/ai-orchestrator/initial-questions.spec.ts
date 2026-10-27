import { BadGatewayException, Logger } from '@nestjs/common';
import {
  buildInitialQuestionsPrompt,
  generateInitialQuestions,
  InitialQuestionsInput,
  stubInitialQuestions,
  validateInitialQuestions,
} from './initial-questions';
import { requestStructuredProposal } from './proposal-structured-transport';
import { AiQuotaExhaustedException } from '../common/ai-fetch';

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

  it('accepts a multiple-choice question without ordered scores', () => {
    const multi = {
      ...question('tecnica', 'Quali colpi ti mettono in difficoltà?'),
      multiple: true,
      options: [
        { label: 'Nessuno', score: 100, exclusive: true },
        { label: 'Bandeja', score: 40, exclusive: false },
        { label: 'Víbora', score: 30, exclusive: false },
        { label: 'Volée bassa', score: 50, exclusive: false },
      ],
    };
    const questions = validateInitialQuestions(
      {
        questions: [
          multi,
          question('tecnica', 'T2'),
          question('mental', 'M1'),
          question('mental', 'M2'),
        ],
      },
      input,
    );
    expect(questions?.[0]).toMatchObject({ multiple: true });
    expect(questions?.[0].options[0]).toMatchObject({ exclusive: true });
    expect(questions?.[1].multiple).toBeUndefined();
  });

  it('keeps at least one single-choice question per driver', () => {
    const problems: string[] = [];
    const multi = (text: string) => ({
      ...question('tecnica', text),
      multiple: true,
    });
    expect(
      validateInitialQuestions(
        {
          questions: [
            multi('T1'),
            multi('T2'),
            question('mental', 'M1'),
            question('mental', 'M2'),
          ],
        },
        input,
        problems,
      ),
    ).toBeNull();
    expect(problems).toContain(
      'Tecnica: serve almeno una domanda a scelta singola',
    );
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
    [
      'identical scores',
      [
        question('tecnica', 'T1', [20, 20, 20]),
        question('tecnica', 'T2'),
        question('mental', 'M1'),
        question('mental', 'M2'),
      ],
      'score che non distinguono le opzioni (1)',
    ],
    [
      'scores missing both scale ends',
      [
        question('tecnica', 'T1', [20, 50, 80]),
        question('tecnica', 'T2'),
        question('mental', 'M1'),
        question('mental', 'M2'),
      ],
      'score che non distinguono le opzioni (1)',
    ],
    [
      'scores out of order',
      [
        question('tecnica', 'T1', [0, 100, 50]),
        question('tecnica', 'T2'),
        question('mental', 'M1'),
        question('mental', 'M2'),
      ],
      'score che non distinguono le opzioni (1)',
    ],
  ])('rejects %s', (_, questions, problem) => {
    const problems: string[] = [];
    expect(validateInitialQuestions({ questions }, input, problems)).toBeNull();
    expect(problems).toContain(problem);
  });

  it('accepts descending scores from the top to the bottom of the scale', () => {
    const questions = validateInitialQuestions(
      {
        questions: [
          question('tecnica', 'T1', [100, 60, 0]),
          question('tecnica', 'T2'),
          question('mental', 'M1'),
          question('mental', 'M2'),
        ],
      },
      input,
    );
    expect(questions?.[0].options.map((o) => o.score)).toEqual([100, 60, 0]);
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

  it('does not retry when the daily AI quota is exhausted', async () => {
    process.env.AI_PROVIDER = 'gemini';
    jest
      .mocked(requestStructuredProposal)
      .mockRejectedValue(new AiQuotaExhaustedException());
    await expect(
      generateInitialQuestions(silent(), input),
    ).rejects.toBeInstanceOf(AiQuotaExhaustedException);
    expect(requestStructuredProposal).toHaveBeenCalledTimes(1);
  });
});
