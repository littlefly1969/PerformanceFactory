import { BadGatewayException, Logger } from '@nestjs/common';
import {
  DEFAULT_MICRO_TEST_PROMPT,
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
  options: [
    { label: '0-3 su 10', score: 20 },
    { label: '4-7 su 10', score: 50 },
    { label: '8-10 su 10', score: 80 },
  ],
  ...extra,
});

describe('micro-test generation', () => {
  const previous = process.env.AI_PROVIDER;
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
        options: [
          { value: 'o1', label: '0-3 su 10', score: 20 },
          { value: 'o2', label: '4-7 su 10', score: 50 },
          { value: 'o3', label: '8-10 su 10', score: 80 },
        ],
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
    ['malformed output', null],
  ])('rejects %s', (_, raw) => {
    expect(validateMicroTests(raw, input)).toBeNull();
  });

  it('produces valid stub tests', () => {
    expect(validateMicroTests(stubMicroTests(input), input)).toHaveLength(1);
  });

  it('refuses an invalid provider output instead of showing it', async () => {
    process.env.AI_PROVIDER = 'openai';
    jest.mocked(requestStructuredProposal).mockResolvedValue({
      outputText: JSON.stringify({ tests: [test({ areaId: 'altro' })] }),
    } as Awaited<ReturnType<typeof requestStructuredProposal>>);
    await expect(
      generateMicroTests(new Logger('test'), input),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
