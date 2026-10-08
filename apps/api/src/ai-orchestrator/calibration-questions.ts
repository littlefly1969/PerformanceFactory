import { BadGatewayException, Logger } from '@nestjs/common';
import { hashJson } from './proposal-audit';
import { requestStructuredProposal } from './proposal-structured-transport';
import { resolveModel, resolveProvider } from './provider-config';
import { AiProvider } from './proposal-provider-model';
import { AssessmentEvaluationAnswer } from './assessment-evaluation-model';

/** Tipo di prompt in AiPromptVersion per le domande dei round di calibrazione. */
export const CALIBRATION_PROMPT_TYPE = 'CALIBRATION_QUESTIONS';

export const DEFAULT_CALIBRATION_PROMPT = [
  'Sei il motore di calibrazione di Performance Factory. Dopo la prima valutazione di un atleta amatoriale maggiorenne ricevi, per i driver con la confidenza più bassa, lo score R provvisorio, la confidenza, le lacune di evidenza indicate dalla valutazione e le domande già fatte.',
  'Scrivi nuove domande a scelta singola che riducano proprio quelle lacune: comportamenti concreti, frequenze, situazioni di gioco, risultati misurabili. Evita domande già fatte o equivalenti.',
  'Ogni opzione ha uno score di riferimento sulla scala ricevuta: deve ancorare la risposta al livello reale, non premiare la risposta più lunga. Le opzioni coprono tutta la scala e sono mutuamente esclusive.',
  "Nel round di chiusura copri tutti i driver ricevuti con le domande più informative: è l'ultima occasione prima di consolidare R.",
  'Scrivi in italiano, con il tu, frasi brevi. Niente diagnosi mediche, niente dati personali, niente promesse di risultato.',
].join('\n');

export const CALIBRATION_LIMITS = {
  question: 200,
  option: 100,
  minOptions: 3,
  maxOptions: 5,
};

export type CalibrationTarget = {
  areaId: string;
  name: string;
  score: number;
  confidence: number;
  evidenceGaps: string[];
  askedQuestions: string[];
};

export type CalibrationQuestionsInput = {
  basePrompt: string;
  promptVersionId: string | null;
  kind: 'ADAPTIVE' | 'CLOSING';
  questionsPerDriver: number;
  scale: { minScore: number; maxScore: number };
  athleteContext: AssessmentEvaluationAnswer[];
  targets: CalibrationTarget[];
};

export type CalibrationQuestion = {
  id: string;
  areaId: string;
  text: string;
  options: { value: string; label: string; score: number }[];
};

export type CalibrationQuestionsResult = {
  provider: AiProvider;
  model: string;
  promptHash: string;
  questions: CalibrationQuestion[];
  latencyMs: number;
};

function formatRules(input: CalibrationQuestionsInput) {
  return [
    'FORMATO DI RISPOSTA (fisso): rispondi solo con JSON conforme allo schema.',
    `- questions: esattamente ${input.questionsPerDriver} domande per ciascuno dei ${input.targets.length} driver ricevuti, con lo stesso areaId.`,
    `- text: massimo ${CALIBRATION_LIMITS.question} caratteri.`,
    '- solo domande su comportamenti, frequenze e situazioni di gioco già vissute: niente micro-test, esercizi o prove da svolgere, che l’atleta riceve a parte nel pannello della lezione gratuita. Questa regola prevale sulle istruzioni sopra.',
    `- options: da ${CALIBRATION_LIMITS.minOptions} a ${CALIBRATION_LIMITS.maxOptions}, label di massimo ${CALIBRATION_LIMITS.option} caratteri, score tra ${input.scale.minScore} e ${input.scale.maxScore}.`,
  ].join('\n');
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['areaId', 'text', 'options'],
        properties: {
          areaId: { type: 'string' },
          text: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'score'],
              properties: {
                label: { type: 'string' },
                score: { type: 'number' },
              },
            },
          },
        },
      },
    },
  },
};

export function buildCalibrationPrompt(input: CalibrationQuestionsInput) {
  return {
    system: `${input.basePrompt.trim()}\n\n${formatRules(input)}`,
    user: {
      task:
        input.kind === 'CLOSING'
          ? 'Round di chiusura: domande finali sui driver ancora poco affidabili.'
          : 'Nuovo round: domande sui driver con la confidenza più bassa.',
      scale: input.scale,
      questionsPerDriver: input.questionsPerDriver,
      athleteContext: input.athleteContext,
      drivers: input.targets,
    },
  };
}

export async function generateCalibrationQuestions(
  logger: Logger,
  input: CalibrationQuestionsInput,
): Promise<CalibrationQuestionsResult> {
  const startedAt = Date.now();
  const provider = resolveProvider();
  const model = resolveModel(provider);
  const prompt = buildCalibrationPrompt(input);
  const inputJson = { promptVersionId: input.promptVersionId, prompt };
  let raw: unknown;
  if (provider === 'stub') {
    raw = stubCalibrationQuestions(input);
  } else {
    const result = await requestStructuredProposal(
      logger,
      provider,
      model,
      inputJson,
      { ...prompt, schema },
      'calibration_questions',
    );
    try {
      raw = JSON.parse(result.outputText);
    } catch {
      raw = null;
    }
  }
  const problems: string[] = [];
  const questions = validateCalibrationQuestions(raw, input, problems);
  if (!questions) {
    logger.warn(
      `INVALID_CALIBRATION_QUESTIONS ${provider}/${model}: ${problems.join('; ')}`,
    );
    throw new BadGatewayException({
      code: 'INVALID_CALIBRATION_QUESTIONS',
      message: 'Non siamo riusciti a preparare le nuove domande. Riprova.',
    });
  }
  return {
    provider,
    model,
    promptHash: hashJson(inputJson),
    questions,
    latencyMs: Date.now() - startedAt,
  };
}

/** Stub deterministico per sviluppo e test: domande generiche sul driver. */
export function stubCalibrationQuestions(input: CalibrationQuestionsInput) {
  const { minScore, maxScore } = input.scale;
  const step = (maxScore - minScore) / 3;
  return {
    questions: input.targets.flatMap((target) =>
      Array.from({ length: input.questionsPerDriver }, (_, i) => ({
        areaId: target.areaId,
        text: `${target.name}: quanto spesso ti capita la situazione ${target.askedQuestions.length + i + 1}?`,
        options: ['Mai', 'A volte', 'Spesso', 'Sempre'].map((label, k) => ({
          label,
          score: Math.round(minScore + step * k),
        })),
      })),
    ),
  };
}

/** Contratto rigido: numero di domande, driver, opzioni e scala sono verificati. */
export function validateCalibrationQuestions(
  raw: unknown,
  input: CalibrationQuestionsInput,
  problems: string[] = [],
): CalibrationQuestion[] | null {
  const items = (raw as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(items)) {
    problems.push('questions mancanti');
    return null;
  }
  const targets = new Set(input.targets.map((t) => t.areaId));
  const perDriver = new Map<string, number>();
  const questions: CalibrationQuestion[] = [];
  items.forEach((item, index) => {
    const entry = item as Partial<Record<string, unknown>>;
    const areaId = typeof entry?.areaId === 'string' ? entry.areaId : '';
    if (!targets.has(areaId)) {
      problems.push(`driver inatteso: ${areaId || '?'}`);
      return;
    }
    perDriver.set(areaId, (perDriver.get(areaId) ?? 0) + 1);
    const text = clean(entry.text, CALIBRATION_LIMITS.question);
    if (!text) problems.push(`testo non valido (${index + 1})`);
    const options = Array.isArray(entry.options) ? entry.options : [];
    if (
      options.length < CALIBRATION_LIMITS.minOptions ||
      options.length > CALIBRATION_LIMITS.maxOptions
    )
      problems.push(`numero di opzioni non valido (${index + 1})`);
    const parsed = options.map((option, k) => {
      const o = option as Partial<Record<string, unknown>>;
      const label = clean(o?.label, CALIBRATION_LIMITS.option);
      const score = o?.score;
      if (
        !label ||
        typeof score !== 'number' ||
        !Number.isFinite(score) ||
        score < input.scale.minScore ||
        score > input.scale.maxScore
      )
        problems.push(`opzione non valida (${index + 1}.${k + 1})`);
      return { value: String(k), label: label ?? '', score: Number(score) };
    });
    if (new Set(parsed.map((o) => o.label)).size !== parsed.length)
      problems.push(`opzioni duplicate (${index + 1})`);
    questions.push({
      id: `q${index + 1}`,
      areaId,
      text: text ?? '',
      options: parsed,
    });
  });
  for (const areaId of targets)
    if (perDriver.get(areaId) !== input.questionsPerDriver)
      problems.push(
        `domande per ${areaId}: attese ${input.questionsPerDriver}`,
      );
  return problems.length ? null : questions;
}

function clean(value: unknown, max: number) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && trimmed.length <= max ? trimmed : null;
}
