import { BadGatewayException, Logger } from '@nestjs/common';
import {
  DEFAULT_MICRO_TEST_PROMPT,
  MICRO_TEST_ATTEMPTS,
  MicroTestInput,
  buildMicroTestPrompt,
  generateMicroTests,
  stubMicroTests,
  validateMicroTests,
} from './micro-test-generation';
import { requestStructuredProposal } from './proposal-structured-transport';

jest.mock('./proposal-structured-transport', () => ({
  requestStructuredProposal: jest.fn(),
}));

const input: MicroTestInput = {
  basePrompt: 'Prompt dei micro-test modificabile.',
  promptVersionId: 'version-1',
  scale: { minScore: 0, maxScore: 100 },
  athleteContext: [{ question: 'Da quanto giochi?', answer: '1-3 anni' }],
  targets: [
    {
      areaId: 'tecnica',
      name: 'Tecnica',
      score: 55,
      confidence: 25,
      evidenceGaps: ['Manca una prova sulla volée.'],
      evidence: [
        {
          source: 'ASSESSMENT',
          question: 'A rete cosa succede?',
          answer: 'Chiudo, ma senza decidere dove',
        },
      ],
    },
  ],
  proposedTitles: ['Bandeja su 10'],
};
const test = (extra: object = {}) => ({
  areaId: 'tecnica',
  title: 'Volée a muro',
  instructions:
    'A due metri dal muro, 10 volée di dritto: conta quante tornano.',
  informationGoal: 'Capire se a rete controlli la direzione.',
  durationMinutes: 10,
  physicalLoad: 'LOW',
  safetyNotes: 'Scaldati prima e fermati se senti fastidio.',
  options: [
    { label: '0-3 su 10', score: 20 },
    { label: '4-7 su 10', score: 50 },
    { label: '8-10 su 10', score: 80 },
  ],
  ...extra,
});

describe('micro-test generation', () => {
  const previous = process.env.AI_PROVIDER;
  beforeAll(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation());
  afterEach(() => {
    process.env.AI_PROVIDER = previous;
    jest.mocked(requestStructuredProposal).mockReset();
  });

  it('keeps the editable prompt apart from the fixed format and sends the history', () => {
    const prompt = buildMicroTestPrompt(input);
    expect(
      prompt.system.startsWith('Prompt dei micro-test modificabile.'),
    ).toBe(true);
    expect(prompt.system).toContain('FORMATO DI RISPOSTA (fisso)');
    expect(prompt.user.drivers[0].evidence[0].source).toBe('ASSESSMENT');
    expect(prompt.user.proposedTitles).toEqual(['Bandeja su 10']);
    expect(DEFAULT_MICRO_TEST_PROMPT).toContain('lacune');
  });

  it('accepts one test per driver with increasing outcomes', () => {
    expect(validateMicroTests({ tests: [test()] }, input)).toEqual([
      {
        areaId: 'tecnica',
        title: 'Volée a muro',
        instructions: test().instructions,
        informationGoal: 'Capire se a rete controlli la direzione.',
        durationMinutes: 10,
        physicalLoad: 'LOW',
        safetyNotes: 'Scaldati prima e fermati se senti fastidio.',
        options: [
          { value: 'o1', label: '0-3 su 10', score: 20 },
          { value: 'o2', label: '4-7 su 10', score: 50 },
          { value: 'o3', label: '8-10 su 10', score: 80 },
        ],
        format: 'PRACTICAL',
        situations: [],
        video: null,
      },
    ]);
  });

  it.each([
    ['a missing driver', { tests: [] }],
    ['an unknown driver', { tests: [test({ areaId: 'altro' })] }],
    ['a repeated driver', { tests: [test(), test({ title: 'Altro' })] }],
    ['a title already proposed', { tests: [test({ title: 'bandeja su 10' })] }],
    ['empty instructions', { tests: [test({ instructions: ' ' })] }],
    [
      'too few outcomes',
      { tests: [test({ options: test().options.slice(0, 2) })] },
    ],
    [
      'an outcome out of scale',
      {
        tests: [
          test({
            options: [
              ...test().options.slice(0, 2),
              { label: 'Tutte', score: 120 },
            ],
          }),
        ],
      },
    ],
    [
      'scores not increasing',
      {
        tests: [
          test({
            options: [
              { label: 'Poche', score: 50 },
              { label: 'Alcune', score: 50 },
              { label: 'Molte', score: 80 },
            ],
          }),
        ],
      },
    ],
    [
      'duplicate outcomes',
      {
        tests: [
          test({
            options: [
              { label: 'Poche', score: 20 },
              { label: 'poche', score: 50 },
              { label: 'Molte', score: 80 },
            ],
          }),
        ],
      },
    ],
    ['a missing information goal', { tests: [test({ informationGoal: '' })] }],
    ['an implausible duration', { tests: [test({ durationMinutes: 90 })] }],
    ['a high physical load', { tests: [test({ physicalLoad: 'HIGH' })] }],
    [
      'a physical test without safety notes',
      { tests: [test({ safetyNotes: ' ' })] },
    ],
    [
      'a maximal test',
      {
        tests: [
          test({ instructions: 'Fai 10 sprint massimali e conta i secondi.' }),
        ],
      },
    ],
    [
      'a health prescription',
      { tests: [test({ safetyNotes: 'Prendi un integratore prima.' })] },
    ],
    ['malformed output', null],
  ])('rejects %s', (_, raw) => {
    expect(validateMicroTests(raw, input)).toBeNull();
  });

  it('accepts a test without physical load, duration or safety notes', () => {
    const [ok] = validateMicroTests(
      {
        tests: [
          test({
            physicalLoad: 'NONE',
            durationMinutes: null,
            safetyNotes: '',
          }),
        ],
      },
      input,
    )!;
    expect(ok).toMatchObject({ physicalLoad: 'NONE', durationMinutes: null });
  });

  it('refuses a moderate physical load when the athlete declared limitations', () => {
    const limited = {
      ...input,
      declaredLimitations: [
        { question: 'Hai dolori o infortuni?', answer: 'Mal di schiena' },
      ],
    };
    expect(
      validateMicroTests(
        { tests: [test({ physicalLoad: 'MODERATE' })] },
        limited,
      ),
    ).toBeNull();
    expect(validateMicroTests({ tests: [test()] }, limited)).toHaveLength(1);
    expect(buildMicroTestPrompt(limited).system).toContain('solo NONE o LOW');
  });

  it('produces valid stub tests, practical first and then game situations', () => {
    const first = { ...input, proposedTitles: [] };
    expect(validateMicroTests(stubMicroTests(first), first)).toMatchObject([
      { format: 'PRACTICAL' },
    ]);
    expect(
      validateMicroTests(stubMicroTests(withVideos), withVideos),
    ).toMatchObject([
      {
        format: 'SITUATIONAL',
        situations: [{}, {}, {}],
        video: { videoId: 'video-1', title: 'La vibora di un coach' },
      },
    ]);
  });

  const withVideos: MicroTestInput = {
    ...input,
    proposedTitles: ['Bandeja su 10'],
    videos: [
      { id: 'video-1', title: 'La vibora di un coach', description: '' },
    ],
  };
  const situation = (extra: object = {}) => ({
    label: 'Uscita dal fondo',
    question: 'La palla ti arriva sul vetro di fondo, lenta e alta. Cosa fai?',
    context: 'Sei in posizione arretrata, gli avversari sono a rete.',
    options: [
      {
        label: 'Colpisco forte cercando il passante',
        correct: false,
        feedback: 'Da dietro il passante raramente passa.',
        score: 30,
      },
      {
        label: 'Aspetto il rimbalzo sul vetro e alzo lungo',
        correct: true,
        feedback: 'Esatto: il vetro è un alleato.',
        score: 80,
      },
    ],
    video: { videoId: null, title: 'Uscire dal vetro di fondo' },
    ...extra,
  });
  const situational = (extra: object = {}) =>
    test({
      title: 'Il terzo colpo decide il punto.',
      instructions: 'Tre situazioni di gioco reali.',
      physicalLoad: 'NONE',
      safetyNotes: '',
      durationMinutes: 2,
      options: [],
      format: 'SITUATIONAL',
      situations: [situation(), situation({ label: 'Posizionamento' })],
      video: { videoId: 'video-1', title: 'La vibora di un coach' },
      ...extra,
    });

  it('accepts game situations with one correct answer and a video from the archive', () => {
    const [ok] = validateMicroTests({ tests: [situational()] }, withVideos)!;
    expect(ok.format).toBe('SITUATIONAL');
    expect(ok.options).toEqual([]);
    expect(ok.situations[0].options[1]).toEqual({
      value: 'o2',
      label: 'Aspetto il rimbalzo sul vetro e alzo lungo',
      score: 80,
      correct: true,
      feedback: 'Esatto: il vetro è un alleato.',
    });
    expect(ok.situations[0].video).toEqual({
      videoId: null,
      title: 'Uscire dal vetro di fondo',
    });
    expect(buildMicroTestPrompt(withVideos).user.videos).toHaveLength(1);
    expect(buildMicroTestPrompt(withVideos).system).toContain('SITUATIONAL');
  });

  it.each([
    ['a single situation', { situations: [situation()] }],
    [
      'two correct answers',
      {
        situations: [
          situation({
            options: situation().options.map((o) => ({ ...o, correct: true })),
          }),
          situation(),
        ],
      },
    ],
    [
      'a correct answer worth less than a wrong one',
      {
        situations: [
          situation({
            options: [
              { ...situation().options[0], score: 90 },
              situation().options[1],
            ],
          }),
          situation(),
        ],
      },
    ],
    [
      'an answer without the coach explanation',
      {
        situations: [
          situation({
            options: [
              { ...situation().options[0], feedback: '' },
              situation().options[1],
            ],
          }),
          situation(),
        ],
      },
    ],
    ['a physical load', { physicalLoad: 'LOW', safetyNotes: 'Scaldati.' }],
    [
      'a video outside the archive',
      { video: { videoId: 'inventato', title: 'Video' } },
    ],
    ['a video without title', { video: { videoId: null, title: ' ' } }],
  ])('rejects game situations with %s', (_, extra) => {
    expect(
      validateMicroTests({ tests: [situational(extra)] }, withVideos),
    ).toBeNull();
  });

  it('refuses an invalid provider output instead of showing it, after one retry', async () => {
    process.env.AI_PROVIDER = 'openai';
    jest.mocked(requestStructuredProposal).mockResolvedValue({
      outputText: JSON.stringify({ tests: [test({ areaId: 'altro' })] }),
    } as Awaited<ReturnType<typeof requestStructuredProposal>>);
    await expect(
      generateMicroTests(new Logger('test'), input),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(requestStructuredProposal).toHaveBeenCalledTimes(
      MICRO_TEST_ATTEMPTS,
    );
  });

  it('retries a rejected test once, telling the AI why it was rejected', async () => {
    process.env.AI_PROVIDER = 'gemini';
    const reply = (raw: object) =>
      ({ outputText: JSON.stringify(raw) }) as Awaited<
        ReturnType<typeof requestStructuredProposal>
      >;
    jest
      .mocked(requestStructuredProposal)
      .mockResolvedValueOnce(
        reply({
          tests: [test({ instructions: 'Fai sprint massimali a rete.' })],
        }),
      )
      .mockResolvedValueOnce(reply({ tests: [test()] }));
    const result = await generateMicroTests(new Logger('test'), input);
    expect(result.tests).toHaveLength(1);
    const calls = jest.mocked(requestStructuredProposal).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][4].user).not.toHaveProperty('previousAttemptRejected');
    expect(
      (calls[1][4].user as { previousAttemptRejected: string })
        .previousAttemptRejected,
    ).toContain('contenuto non sicuro');
  });

  it('accepts safety notes that rule out banned content', () => {
    expect(
      validateMicroTests(
        {
          tests: [
            test({
              instructions:
                'A ritmo non massimale, 10 volée a muro senza sprint: conta quante tornano.',
              safetyNotes: 'Evita sforzi massimali, non arrivare al cedimento.',
            }),
          ],
        },
        input,
      ),
    ).toHaveLength(1);
  });

  it('applies the banned terms set in the back office', () => {
    const custom = { ...input, unsafeTerms: ['volée a muro'] };
    expect(validateMicroTests({ tests: [test()] }, custom)).toBeNull();
    expect(buildMicroTestPrompt(custom).system).toContain('volée a muro');
    expect(
      validateMicroTests(
        { tests: [test({ safetyNotes: 'Niente sprint.' })] },
        { ...input, unsafeTerms: ['sprint'] },
      ),
    ).toHaveLength(1);
  });
});
