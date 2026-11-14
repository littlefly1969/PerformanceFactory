import {
  MicroTestInput,
  buildMicroTestPrompt,
  stubMicroTests,
  validateMicroTests,
} from './micro-test-generation';
import { filterOf, filterShape } from './micro-test-practical';

const input: MicroTestInput = {
  basePrompt: 'Prompt dei micro-test.',
  promptVersionId: null,
  scale: { minScore: 0, maxScore: 100 },
  athleteContext: [],
  targets: [
    {
      areaId: 'prep',
      name: 'Preparazione atletica',
      score: 40,
      confidence: 20,
      evidenceGaps: ['Manca una prova sul core.'],
      evidence: [],
    },
  ],
  proposedTitles: [],
};
const offCourt: MicroTestInput = { ...input, filter: 'OFF_COURT' };

const plank = (extra: object = {}) => ({
  areaId: 'prep',
  title: 'Plank: 45 secondi',
  instructions: 'Una tenuta in plank sugli avambracci.',
  informationGoal: 'Capire quanto tiene il core.',
  durationMinutes: 2,
  physicalLoad: 'LOW',
  safetyNotes: 'Fermati se senti fastidio.',
  options: [
    { label: 'Non ci sono riuscito', score: 20 },
    { label: 'Mi sono fermato prima', score: 40 },
    { label: 'Fatto, ma alla fine tremavo', score: 60 },
    { label: 'Facile, avevo ancora energia', score: 80 },
  ],
  results: [1, 2, 3, 4].map((k) => ({
    verdict: `Esito ${k}.`,
    takeaway: 'Ripeti tra una settimana.',
  })),
  format: 'PRACTICAL',
  situations: [],
  video: null,
  setting: 'OFF_COURT',
  steps: [
    'Avambracci a terra, gomiti sotto le spalle.',
    'Corpo dritto dalla testa ai talloni.',
    'Tieni senza far scendere il bacino.',
  ],
  timerSeconds: 45,
  question: 'Com’è andata?',
  ...extra,
});

const problemsOf = (raw: object, at: MicroTestInput = offCourt) => {
  const problems: string[] = [];
  validateMicroTests({ tests: [raw] }, at, problems);
  return problems;
};

describe('micro-test filters', () => {
  it('maps each filter to its format and place, and back', () => {
    expect(filterShape('THEORY')).toEqual({
      format: 'SITUATIONAL',
      setting: null,
    });
    expect(filterShape('ON_COURT')).toEqual({
      format: 'PRACTICAL',
      setting: 'ON_COURT',
    });
    expect(filterOf({ format: 'SITUATIONAL' })).toBe('THEORY');
    expect(filterOf({ format: 'PRACTICAL', setting: 'OFF_COURT' })).toBe(
      'OFF_COURT',
    );
    // I pratici scritti prima dei filtri non hanno luogo: vanno sul campo.
    expect(filterOf({ format: 'PRACTICAL' })).toBe('ON_COURT');
  });

  it('tells the AI the filter chosen by the athlete, as a fixed rule', () => {
    const prompt = buildMicroTestPrompt(offCourt);
    expect(prompt.system).toContain('FILTRO SCELTO DALL’ATLETA');
    expect(prompt.system).toContain('setting OFF_COURT');
    expect(prompt.user).toMatchObject({ filter: 'OFF_COURT' });
    expect(buildMicroTestPrompt(input).system).not.toContain('FILTRO SCELTO');
  });

  it('accepts a practical test with place, steps, timer and outcome question', () => {
    expect(validateMicroTests({ tests: [plank()] }, offCourt)).toMatchObject([
      {
        format: 'PRACTICAL',
        setting: 'OFF_COURT',
        steps: plank().steps,
        timerSeconds: 45,
        question: 'Com’è andata?',
      },
    ]);
    expect(problemsOf(plank({ timerSeconds: null }))).toEqual([]);
  });

  it('rejects a test that does not match the filter', () => {
    expect(problemsOf(plank({ setting: 'ON_COURT' }))).toEqual([
      'luogo diverso dal filtro OFF_COURT (1)',
    ]);
    expect(problemsOf(plank(), { ...input, filter: 'THEORY' })).toContain(
      'forma diversa dal filtro THEORY (1)',
    );
  });

  it('rejects missing or oversized steps, a bad timer and a missing question', () => {
    expect(problemsOf(plank({ steps: ['Uno solo.'] }))).toEqual([
      'passaggi non validi (1)',
    ]);
    expect(problemsOf(plank({ steps: ['a', 'b', '', 'c'] }))).toEqual([
      'passaggi non validi (1)',
    ]);
    expect(problemsOf(plank({ steps: ['x'.repeat(141), 'b'] }))).toEqual([
      'passaggi non validi (1)',
    ]);
    expect(problemsOf(plank({ timerSeconds: 5 }))).toEqual([
      'timer non valido (1)',
    ]);
    expect(problemsOf(plank({ timerSeconds: 45.5 }))).toEqual([
      'timer non valido (1)',
    ]);
    expect(problemsOf(plank({ question: '' }))).toEqual([
      "domanda dell'esito non valida (1)",
    ]);
    expect(problemsOf(plank({ setting: 'GYM' }))).toContain(
      'luogo non valido (1)',
    );
  });

  it('checks banned terms in steps and outcome question too', () => {
    expect(
      problemsOf(plank({ steps: ['Fai uno sprint al muro.', 'Ripeti.'] })),
    ).toEqual([expect.stringContaining('contenuto non sicuro')]);
  });

  it('writes stub tests that respect every filter', () => {
    for (const filter of ['THEORY', 'ON_COURT', 'OFF_COURT'] as const) {
      const at = { ...input, filter };
      const problems: string[] = [];
      const [test] = validateMicroTests(stubMicroTests(at), at, problems)!;
      expect(problems).toEqual([]);
      expect({ format: test.format, setting: test.setting }).toEqual(
        filterShape(filter),
      );
    }
  });
});
