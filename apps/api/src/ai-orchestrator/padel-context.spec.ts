import { PADEL_SPORT_RULE } from './padel-context';
import {
  DEFAULT_INITIAL_QUESTIONS_PROMPT,
  buildInitialQuestionsPrompt,
} from './initial-questions';
import {
  DEFAULT_CALIBRATION_PROMPT,
  buildCalibrationPrompt,
} from './calibration-questions';
import {
  DEFAULT_MICRO_TEST_PROMPT,
  buildMicroTestPrompt,
} from './micro-test-generation';
import { DEFAULT_ASSESSMENT_PROMPT } from './assessment-evaluation-model';
import { buildAssessmentPrompt } from './assessment-evaluation';
import {
  DEFAULT_POTENTIAL_PROMPT,
  buildPotentialPrompt,
} from './potential-generation';

const basePrompt = 'Prompt di prova modificabile.';
const scale = { minScore: 0, maxScore: 100 };
const fitRanking = {
  source: 'SELF_DECLARED' as const,
  declaredAt: '2026-10-01T00:00:00.000Z',
  padel: { current: '3ª fascia', best: '2ª fascia' },
  tennis: { current: 'Nessuna classifica', best: '3.2' },
};

const systems = (): [string, string][] => [
  [
    'domande iniziali',
    buildInitialQuestionsPrompt({
      basePrompt,
      promptVersionId: null,
      scale,
      athleteContext: [],
      availability: [],
      fitRanking,
      drivers: [{ areaId: 'tecnica', name: 'Tecnica' }],
      questionsPerArea: 2,
    }).system,
  ],
  [
    'calibrazione',
    buildCalibrationPrompt({
      basePrompt,
      promptVersionId: null,
      scale,
      athleteContext: [],
      fitRanking,
      targets: [
        {
          areaId: 'tecnica',
          name: 'Tecnica',
          score: 50,
          confidence: 30,
          evidenceGaps: [],
          askedQuestions: [],
          focus: true,
        },
      ],
    }).system,
  ],
  [
    'micro-test',
    buildMicroTestPrompt({
      basePrompt,
      promptVersionId: null,
      scale,
      athleteContext: [],
      fitRanking,
      targets: [
        {
          areaId: 'tecnica',
          name: 'Tecnica',
          score: 50,
          confidence: 30,
          evidenceGaps: [],
          evidence: [],
        },
      ],
      proposedTitles: [],
    }).system,
  ],
  [
    'valutazione',
    buildAssessmentPrompt({
      basePrompt,
      promptVersionId: null,
      scale,
      athleteContext: [],
      availability: [],
      fitRanking,
      drivers: [{ areaId: 'tecnica', name: 'Tecnica', answers: [] }],
    }).system,
  ],
  [
    'potenziale',
    buildPotentialPrompt({
      basePrompt,
      promptVersionId: null,
      scale: { min: 0, max: 100 },
      level: 'INTERMEDIATE',
      levelConfidence: 40,
      daysPerWeek: 3,
      fitRanking,
      drivers: [
        {
          areaId: 'tecnica',
          name: 'Tecnica',
          score: 50,
          confidence: 30,
          commitment: 'MEDIUM',
          rationale: '',
          evidenceGaps: [],
        },
      ],
    }).system,
  ],
];

const defaults: [string, string][] = [
  ['domande iniziali', DEFAULT_INITIAL_QUESTIONS_PROMPT],
  ['calibrazione', DEFAULT_CALIBRATION_PROMPT],
  ['micro-test', DEFAULT_MICRO_TEST_PROMPT],
  ['valutazione', DEFAULT_ASSESSMENT_PROMPT],
  ['potenziale', DEFAULT_POTENTIAL_PROMPT],
];

describe('padel sport rule', () => {
  it.each(systems())(
    'il prompt %s porta la regola dello sport anche con un base prompt dell’AI Tuner',
    (_name, system) => {
      expect(system).toContain(PADEL_SPORT_RULE);
    },
  );

  it.each(defaults)(
    'il prompt di default %s nomina il padel',
    (_name, text) => {
      expect(text.toLowerCase()).toContain('padel');
    },
  );

  it('la regola vieta gli argomenti da tennis che il padel non ha', () => {
    expect(PADEL_SPORT_RULE).toMatch(/corde/);
    expect(PADEL_SPORT_RULE).toMatch(/incordatura/);
    expect(PADEL_SPORT_RULE).toMatch(/singolare/);
  });

  it('nessun prompt di default nomina corde o incordatura', () => {
    for (const [, text] of defaults)
      expect(text.toLowerCase()).not.toMatch(/cord[ae]|incordat/);
  });

  it('nei prompt di default la racchetta compare solo come sport escluso', () => {
    for (const [, text] of defaults)
      for (const match of text.toLowerCase().match(/racchett\w*/g) ?? [])
        expect(text.toLowerCase()).toContain(`sport di ${match}`);
  });
});
