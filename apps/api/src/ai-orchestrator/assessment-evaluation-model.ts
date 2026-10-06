import { AiProvider } from './proposal-provider-model';

/** Tipo di prompt AI_ASSESSMENT in AiPromptVersion, separato dai prompt di coaching. */
export const ASSESSMENT_PROMPT_TYPE = 'ASSESSMENT_EVALUATION';

export const DEFAULT_ASSESSMENT_PROMPT = [
  "Sei il motore di valutazione iniziale (AI_ASSESSMENT) di Performance Factory, un Super Coach digitale che coordina più driver della performance. Ricevi il primo set strutturato dell'assessment di un atleta amatoriale maggiorenne: per ogni driver le domande, l'opzione scelta e il suo punteggio di riferimento, la disponibilità dichiarata e le risposte della discovery.",
  'Il tuo compito è stimare la Performance Reale (R) provvisoria di ciascun driver. Non stimi il potenziale, gli scenari P3/P6/P12 né un punteggio globale.',
  'Il benchmark è la persona, non il campione: valuta il livello espresso oggi rispetto a un amatore che pratica lo stesso sport.',
  'Usa i punteggi delle opzioni come ancoraggio. Correggili quando le altre risposte (stesso driver, altri driver, disponibilità, frequenza, salute, obiettivo) indicano un quadro diverso, e spiega la correzione nella motivazione.',
  'Le risposte sono autovalutazioni. La confidenza misura quantità, coerenza e oggettività delle evidenze, non quanto è alto il punteggio. Con due domande di autovalutazione per driver resta bassa, indicativamente tra 15 e 40: alzala solo con risposte coerenti e specifiche, abbassala con risposte contraddittorie.',
  'Per ogni driver indica cosa servirebbe per aumentare la confidenza: domande di approfondimento, micro-test o il feedback di un coach.',
  "Scrivi motivazioni brevi e concrete in italiano, rivolte all'atleta con il tu. Niente diagnosi mediche, niente promesse di risultato.",
].join('\n');

export type AssessmentEvaluationAnswer = {
  question: string;
  answer: string | number | boolean | null;
};

export type AssessmentEvaluationDriver = {
  areaId: string;
  name: string;
  answers: Array<
    AssessmentEvaluationAnswer & {
      optionScore: number | null;
      optionScoreRange: { min: number; max: number } | null;
    }
  >;
};

/** Contesto senza dati identificativi: nessun nome, email o id utente. */
export type AssessmentEvaluationInput = {
  basePrompt: string;
  promptVersionId: string | null;
  scale: { minScore: number; maxScore: number };
  athleteContext: AssessmentEvaluationAnswer[];
  availability: AssessmentEvaluationAnswer[];
  drivers: AssessmentEvaluationDriver[];
};

export type AssessmentDriverEvaluation = {
  areaId: string;
  score: number;
  confidence: number;
  rationale: string;
  evidenceGaps: string[];
};

export type AssessmentEvaluationOutput = {
  summary: string;
  overallConfidence: number;
  drivers: AssessmentDriverEvaluation[];
};

export type AssessmentEvaluationResult = {
  provider: AiProvider;
  model: string;
  promptHash: string;
  inputJson: Record<string, unknown>;
  output: AssessmentEvaluationOutput;
  latencyMs: number;
};

export const ASSESSMENT_LIMITS = {
  summary: 600,
  rationale: 400,
  evidenceGap: 160,
  evidenceGaps: 3,
};

/** Contratto fisso, non modificabile dall'AI Tuner: il backend lo valida comunque. */
export function assessmentFormatRules(input: AssessmentEvaluationInput) {
  return [
    'FORMATO DI RISPOSTA (fisso): rispondi solo con JSON conforme allo schema.',
    `- drivers: esattamente una voce per ciascuno dei ${input.drivers.length} driver ricevuti, con lo stesso areaId.`,
    `- score: numero tra ${input.scale.minScore} e ${input.scale.maxScore}, la R provvisoria del driver.`,
    '- confidence: intero tra 0 e 100, separato dallo score.',
    `- rationale: massimo ${ASSESSMENT_LIMITS.rationale} caratteri.`,
    `- evidenceGaps: da 0 a ${ASSESSMENT_LIMITS.evidenceGaps} voci di massimo ${ASSESSMENT_LIMITS.evidenceGap} caratteri.`,
    `- summary: massimo ${ASSESSMENT_LIMITS.summary} caratteri; overallConfidence: intero tra 0 e 100.`,
  ].join('\n');
}

export function buildAssessmentJsonSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'overallConfidence', 'drivers'],
    properties: {
      summary: { type: 'string' },
      overallConfidence: { type: 'integer' },
      drivers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'areaId',
            'score',
            'confidence',
            'rationale',
            'evidenceGaps',
          ],
          properties: {
            areaId: { type: 'string' },
            score: { type: 'number' },
            confidence: { type: 'integer' },
            rationale: { type: 'string' },
            evidenceGaps: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  };
}
