import { BadGatewayException, Logger } from '@nestjs/common';
import { AiQuotaExhaustedException } from '../common/ai-fetch';
import { hashJson } from './proposal-audit';
import { requestStructuredProposal } from './proposal-structured-transport';
import { resolveModel, resolveProvider } from './provider-config';
import { AiProvider } from './proposal-provider-model';
import { AssessmentEvaluationAnswer } from './assessment-evaluation-model';
import {
  CALIBRATION_LIMITS,
  CHOICE_OPTIONS_SCHEMA,
  ChoiceOption,
  MULTIPLE_CHOICE_RULE,
  parseChoiceOptions,
} from './calibration-questions';
import { FIT_RANKING_RULE, FitRankingContext } from './fit-ranking-context';
import { PADEL_SPORT_RULE } from './padel-context';

/** Tipo di prompt in AiPromptVersion per le domande conoscitive iniziali. */
export const INITIAL_QUESTIONS_PROMPT_TYPE = 'INITIAL_QUESTIONS';

export const DEFAULT_INITIAL_QUESTIONS_PROMPT = [
  'Sei il motore delle domande conoscitive iniziali di Performance Factory, la piattaforma di allenamento al padel. Lo sport è il padel: ogni domanda, situazione di gioco e termine tecnico è di padel, mai di tennis o di altri sport di racchetta. Un atleta amatoriale maggiorenne si è appena registrato: ricevi le sue risposte al funnel (obiettivo, esperienza, frequenza di gioco, salute), la disponibilità all’allenamento, la classifica FIT dichiarata di padel e di tennis (attuale e migliore di sempre) e i driver della performance da conoscere.',
  'Scrivi le prime domande per ogni driver: servono alla prima stima della Performance Reale (R), quindi devono far emergere il livello reale dell’atleta su quel driver, non le sue opinioni.',
  'Su misura: parti dalla classifica e dal funnel. Chi ha o ha avuto una classifica alta riceve situazioni di gioco e soglie da agonista; chi non è mai stato classificato riceve situazioni da amatore. La classifica di tennis dice solo da dove viene l’atleta e quanto è allenabile: non trasformarla in domande di tennis. Tieni conto dell’obiettivo e di eventuali limitazioni dichiarate. Non chiedere di nuovo ciò che il funnel o la classifica dicono già.',
  'Le domande di uno stesso driver guardano aspetti diversi del driver e non si sovrappongono. Domande su comportamenti concreti, frequenze, situazioni di gioco, risultati misurabili: di norma a scelta singola, a scelta multipla solo quando l’atleta può riconoscersi in più opzioni insieme (per esempio dove sente fastidio o quali routine segue).',
  'Ogni opzione ha uno score di riferimento sulla scala ricevuta: deve ancorare la risposta al livello reale, non premiare la risposta più lunga. Nelle domande a scelta singola le opzioni coprono tutta la scala e sono mutuamente esclusive.',
  'Scrivi in italiano, con il tu, frasi brevi. Niente diagnosi mediche, niente dati personali, niente promesse di risultato.',
].join('\n');

/** Domande per driver ammesse dal back office: corte, come l'anamnesi storica. */
export const INITIAL_QUESTIONS_PER_AREA = { min: 1, max: 4 };

/** Tentativi automatici prima di chiedere all'atleta di riprovare. */
export const INITIAL_QUESTIONS_ATTEMPTS = 2;

export type InitialQuestionsInput = {
  basePrompt: string;
  promptVersionId: string | null;
  scale: { minScore: number; maxScore: number };
  athleteContext: AssessmentEvaluationAnswer[];
  availability: AssessmentEvaluationAnswer[];
  fitRanking: FitRankingContext;
  drivers: { areaId: string; name: string }[];
  questionsPerArea: number;
};

export type InitialQuestion = {
  areaId: string;
  text: string;
  options: ChoiceOption[];
  /** Più opzioni insieme; assente sulle domande a scelta singola. */
  multiple?: true;
};

export type InitialQuestionsResult = {
  provider: AiProvider;
  model: string;
  promptHash: string;
  questions: InitialQuestion[];
  latencyMs: number;
  attempts: number;
};

function formatRules(input: InitialQuestionsInput) {
  const l = CALIBRATION_LIMITS;
  return [
    'FORMATO DI RISPOSTA (fisso): rispondi solo con JSON conforme allo schema.',
    `- questions: esattamente ${input.questionsPerArea} per ciascuno dei ${input.drivers.length} driver ricevuti (${input.questionsPerArea * input.drivers.length} in tutto), con il loro areaId, raggruppate per driver nell’ordine ricevuto.`,
    `- text: massimo ${l.question} caratteri, mai uguale a un’altra domanda.`,
    '- le domande sono solo su comportamenti, frequenze e situazioni di gioco già vissute: niente esercizi o prove da svolgere.',
    `- options: da ${l.minOptions} a ${l.maxOptions}, label di massimo ${l.option} caratteri e diverse fra loro. Con multiple false: score tutti diversi, in ordine crescente o decrescente, con la prima o l’ultima opzione a ${input.scale.minScore} e l’altra a ${input.scale.maxScore}.`,
    MULTIPLE_CHOICE_RULE,
    '- ogni driver ha almeno una domanda con multiple false.',
    FIT_RANKING_RULE,
    PADEL_SPORT_RULE,
    'Questi vincoli prevalgono sulle istruzioni sopra.',
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
        required: ['areaId', 'text', 'multiple', 'options'],
        properties: {
          areaId: { type: 'string' },
          text: { type: 'string' },
          multiple: { type: 'boolean' },
          options: CHOICE_OPTIONS_SCHEMA,
        },
      },
    },
  },
};

export function buildInitialQuestionsPrompt(input: InitialQuestionsInput) {
  return {
    system: `${input.basePrompt.trim()}\n\n${formatRules(input)}`,
    user: {
      task: `Le prime ${input.questionsPerArea} domande conoscitive per ogni driver.`,
      scale: input.scale,
      athleteContext: input.athleteContext,
      availability: input.availability,
      fitRanking: input.fitRanking,
      drivers: input.drivers,
      questionsPerArea: input.questionsPerArea,
    },
  };
}

/**
 * Un solo lotto con tutte le domande dei driver. Un output non valido o un
 * errore del provider si riprova in automatico; poi l'atleta vede un errore
 * da riprovare. Nessuna domanda di riserva.
 */
export async function generateInitialQuestions(
  logger: Logger,
  input: InitialQuestionsInput,
): Promise<InitialQuestionsResult> {
  const startedAt = Date.now();
  const provider = resolveProvider();
  const model = resolveModel(provider);
  const prompt = buildInitialQuestionsPrompt(input);
  const inputJson = { promptVersionId: input.promptVersionId, prompt };
  for (let attempt = 1; attempt <= INITIAL_QUESTIONS_ATTEMPTS; attempt++) {
    const problems: string[] = [];
    try {
      const raw =
        provider === 'stub'
          ? stubInitialQuestions(input)
          : parse(
              (
                await requestStructuredProposal(
                  logger,
                  provider,
                  model,
                  inputJson,
                  { ...prompt, schema },
                  'initial_questions',
                )
              ).outputText,
            );
      const questions = validateInitialQuestions(raw, input, problems);
      if (questions)
        return {
          provider,
          model,
          promptHash: hashJson(inputJson),
          questions,
          latencyMs: Date.now() - startedAt,
          attempts: attempt,
        };
    } catch (error) {
      // Quota esaurita: un secondo tentativo fallirebbe allo stesso modo.
      if (error instanceof AiQuotaExhaustedException) throw error;
      problems.push(error instanceof Error ? error.message : 'errore');
    }
    logger.warn(
      `INVALID_INITIAL_QUESTIONS ${provider}/${model} tentativo ${attempt}: ${problems.join('; ')}`,
    );
  }
  throw new BadGatewayException({
    code: 'INITIAL_QUESTIONS_UNAVAILABLE',
    message: 'Non siamo riusciti a preparare le tue domande. Riprova.',
  });
}

function parse(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Stub deterministico per sviluppo e test. */
export function stubInitialQuestions(input: InitialQuestionsInput) {
  const { minScore, maxScore } = input.scale;
  const step = (maxScore - minScore) / 3;
  return {
    questions: input.drivers.flatMap((driver) =>
      Array.from({ length: input.questionsPerArea }, (_, k) => ({
        areaId: driver.areaId,
        text: `${driver.name}: quanto spesso ti capita la situazione ${k + 1}?`,
        options: ['Mai', 'A volte', 'Spesso', 'Sempre'].map((label, i) => ({
          label,
          score: Math.round(minScore + step * i),
        })),
      })),
    ),
  };
}

const normalized = (text: string) => text.toLowerCase().replace(/\s+/g, ' ');

function clean(value: unknown, max: number) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && trimmed.length <= max ? trimmed : null;
}

/**
 * Una risposta serve alla stima di R solo se le opzioni hanno score tutti
 * diversi, in ordine crescente o decrescente, dal minimo al massimo della scala.
 */
function scoresSpanScale(
  options: { score: number }[],
  scale: InitialQuestionsInput['scale'],
) {
  const scores = options.map((o) => o.score);
  const steps = scores.slice(1).map((score, i) => score - scores[i]);
  const monotonic = steps.every((s) => s > 0) || steps.every((s) => s < 0);
  return (
    monotonic &&
    Math.min(...scores) === scale.minScore &&
    Math.max(...scores) === scale.maxScore
  );
}

/**
 * Contratto del lotto: esattamente N domande per ogni driver ricevuto, nessun
 * driver estraneo, testi unici, opzioni nella scala. Le domande tornano
 * nell'ordine dei driver ricevuti.
 */
export function validateInitialQuestions(
  raw: unknown,
  input: InitialQuestionsInput,
  problems: string[] = [],
): InitialQuestion[] | null {
  const items = (raw as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(items)) {
    problems.push('questions mancanti');
    return null;
  }
  const l = CALIBRATION_LIMITS;
  const drivers = new Set(input.drivers.map((d) => d.areaId));
  const seen = new Set<string>();
  const questions: InitialQuestion[] = [];
  items.forEach((item, index) => {
    const entry = item as Partial<Record<string, unknown>> | null;
    const areaId = typeof entry?.areaId === 'string' ? entry.areaId : '';
    if (!drivers.has(areaId)) {
      problems.push(`driver non richiesto: ${areaId || '?'}`);
      return;
    }
    const text = clean(entry?.text, l.question);
    if (!text) problems.push(`testo non valido (${index + 1})`);
    else if (seen.has(normalized(text)))
      problems.push(`domanda ripetuta (${index + 1})`);
    else seen.add(normalized(text));
    const multiple = entry?.multiple === true;
    const parsed = parseChoiceOptions(
      entry?.options,
      multiple,
      input.scale,
      index,
      problems,
    );
    // Le domande multiple non hanno un ordine di score: ogni opzione pesa da sé.
    if (!multiple && !scoresSpanScale(parsed, input.scale))
      problems.push(`score che non distinguono le opzioni (${index + 1})`);
    questions.push({
      areaId,
      text: text ?? '',
      options: parsed,
      ...(multiple ? { multiple: true as const } : {}),
    });
  });
  for (const driver of input.drivers) {
    const own = questions.filter((q) => q.areaId === driver.areaId);
    if (own.length !== input.questionsPerArea)
      problems.push(
        `${driver.name}: attese ${input.questionsPerArea} domande, ricevute ${own.length}`,
      );
    // Almeno un ancoraggio a scelta singola per driver.
    else if (own.every((q) => q.multiple))
      problems.push(
        `${driver.name}: serve almeno una domanda a scelta singola`,
      );
  }
  if (problems.length) return null;
  return input.drivers.flatMap((d) =>
    questions.filter((q) => q.areaId === d.areaId),
  );
}
