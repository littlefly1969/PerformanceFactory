import { BadGatewayException, Logger } from '@nestjs/common';
import { hashJson } from './proposal-audit';
import { requestStructuredProposal } from './proposal-structured-transport';
import { resolveModel, resolveProvider } from './provider-config';
import { AiProvider } from './proposal-provider-model';
import { AssessmentEvaluationAnswer } from './assessment-evaluation-model';

/** Tipo di prompt in AiPromptVersion per le domande dei round di calibrazione. */
export const CALIBRATION_PROMPT_TYPE = 'CALIBRATION_QUESTIONS';

export const DEFAULT_CALIBRATION_PROMPT = [
  'Sei il motore di calibrazione di Performance Factory. Dopo la prima valutazione di un atleta amatoriale maggiorenne ricevi tutti i driver con score R provvisorio, confidenza, lacune di evidenza e domande già fatte; i driver ancora sotto la regola di consolidamento sono marcati come focus.',
  'A ogni passo decidi tu la prossima azione: una sola domanda quando la risposta cambierà la domanda successiva, un gruppo di domande indipendenti quando si possono rispondere insieme, un chiarimento neutro quando due risposte si contraddicono. Non c’è un numero fisso di domande per driver: chiedi solo ciò che riduce davvero una lacuna, e non coprire un driver le cui evidenze bastano già.',
  'Domande a scelta singola su comportamenti concreti, frequenze, situazioni di gioco, risultati misurabili. Evita domande già fatte o equivalenti.',
  'Le prove pratiche fanno parte della calibrazione: un driver in focus che ha solo dichiarazioni riceve un micro-test (una prova pratica breve che l’atleta svolge e di cui riporta l’esito) prima di altre domande. Lo scrive il preparatore, tu indichi solo il driver e il perché. Non riproporre micro-test già fatti o saltati; quando li ha già, torna alle domande.',
  'Ogni opzione ha uno score di riferimento sulla scala ricevuta: deve ancorare la risposta al livello reale, non premiare la risposta più lunga. Le opzioni coprono tutta la scala e sono mutuamente esclusive.',
  'Scrivi in italiano, con il tu, frasi brevi. Niente diagnosi mediche, niente dati personali, niente promesse di risultato. Un chiarimento non accusa e non rivela sospetti.',
].join('\n');

/**
 * Azioni del motore della prossima domanda (PF-FS-PREPAYWALL §4.2). La
 * prontezza al reveal e alla lezione resta del server, che applica le regole
 * di confidence versionate. Con PROPOSE_MICRO_TEST il motore sceglie solo il
 * driver: il micro-test lo scrive e lo valida il generatore dedicato.
 */
export const CALIBRATION_ACTIONS = [
  'ASK_SINGLE',
  'ASK_GROUP',
  'REQUEST_CLARIFICATION',
  'PROPOSE_MICRO_TEST',
] as const;
export type CalibrationAction = (typeof CALIBRATION_ACTIONS)[number];

/**
 * Vincoli di formato, UX e sicurezza: non sono un numero di domande per area.
 * `maxQuestions` limita la lunghezza di un singolo passo a schermo.
 */
export const CALIBRATION_LIMITS = {
  question: 200,
  option: 100,
  minOptions: 3,
  maxOptions: 5,
  maxQuestions: 6,
  rationale: 300,
};

export type CalibrationTarget = {
  areaId: string;
  name: string;
  score: number;
  confidence: number;
  evidenceGaps: string[];
  askedQuestions: string[];
  /** Micro-test già proposti sul driver, fatti o saltati. */
  microTests?: string[];
  /** Driver sotto la regola di consolidamento: solo su questi si chiede. */
  focus: boolean;
};

export type CalibrationQuestionsInput = {
  basePrompt: string;
  promptVersionId: string | null;
  scale: { minScore: number; maxScore: number };
  athleteContext: AssessmentEvaluationAnswer[];
  targets: CalibrationTarget[];
};

export type CalibrationQuestion = {
  id: string;
  areaId: string;
  text: string;
  options: { value: string; label: string; score: number }[];
  /**
   * Micro-test del motore: `text` è il titolo, l'esito lo riporta l'atleta
   * (self-report). Assente sulle domande.
   */
  microTest?: {
    id: string;
    instructions: string;
    informationGoal: string;
    durationMinutes: number | null;
    physicalLoad: string;
    safetyNotes: string;
    provider: string;
    model: string;
    promptVersionId: string | null;
    promptHash: string;
  };
};

/**
 * Decisione validata del passo (§10.2): azione, aree, motivo, domande. Con
 * PROPOSE_MICRO_TEST le domande sono vuote e l'unica area è quella del test.
 */
export type CalibrationStep = {
  action: CalibrationAction;
  targetAreas: string[];
  rationale: string;
  questions: CalibrationQuestion[];
};

export type CalibrationQuestionsResult = CalibrationStep & {
  provider: AiProvider;
  model: string;
  promptHash: string;
  latencyMs: number;
};

function formatRules(input: CalibrationQuestionsInput) {
  const l = CALIBRATION_LIMITS;
  return [
    'FORMATO DI RISPOSTA (fisso): rispondi solo con JSON conforme allo schema.',
    '- action: ASK_SINGLE (esattamente 1 domanda), ASK_GROUP (da 2 a ' +
      `${l.maxQuestions} domande indipendenti), REQUEST_CLARIFICATION (esattamente 1 domanda neutra su una contraddizione) oppure PROPOSE_MICRO_TEST (nessuna domanda, microTestAreaId del driver).`,
    '- questions: solo sui driver con focus true, con il loro areaId; non serve coprirli tutti.',
    '- microTestAreaId: l’areaId di un driver con focus true solo con PROPOSE_MICRO_TEST, altrimenti null.',
    '- se un driver con focus true ha microTests vuoto o assente, scegli PROPOSE_MICRO_TEST su quel driver invece di altre domande, un driver per passo. Questa regola prevale sulle istruzioni sopra.',
    `- rationale: perché questo passo, in una frase di massimo ${l.rationale} caratteri, senza dati personali.`,
    `- text: massimo ${l.question} caratteri.`,
    '- le domande sono solo su comportamenti, frequenze e situazioni di gioco già vissute: niente micro-test, esercizi o prove da svolgere dentro una domanda; una prova pratica si propone solo con PROPOSE_MICRO_TEST. Questa regola prevale sulle istruzioni sopra.',
    `- options: da ${l.minOptions} a ${l.maxOptions}, label di massimo ${l.option} caratteri, score tra la scala minima e massima ricevute.`,
  ].join('\n');
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'rationale', 'microTestAreaId', 'questions'],
  properties: {
    action: { type: 'string', enum: [...CALIBRATION_ACTIONS] },
    rationale: { type: 'string' },
    microTestAreaId: { type: ['string', 'null'] },
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
      task: 'Decidi il prossimo passo sui driver con focus: una domanda, un gruppo, un chiarimento o un micro-test.',
      scale: input.scale,
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
  const step = validateCalibrationStep(raw, input, problems);
  if (!step) {
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
    ...step,
    latencyMs: Date.now() - startedAt,
  };
}

/**
 * Stub deterministico per sviluppo e test: una domanda se il focus è un solo
 * driver, altrimenti un gruppo con una domanda per driver in focus.
 */
export function stubCalibrationQuestions(input: CalibrationQuestionsInput) {
  const { minScore, maxScore } = input.scale;
  const step = (maxScore - minScore) / 3;
  const focus = input.targets
    .filter((t) => t.focus)
    .slice(0, CALIBRATION_LIMITS.maxQuestions);
  return {
    action: focus.length === 1 ? 'ASK_SINGLE' : 'ASK_GROUP',
    rationale: 'Domande sui driver ancora sotto la regola di consolidamento.',
    microTestAreaId: null,
    questions: focus.map((target) => ({
      areaId: target.areaId,
      text: `${target.name}: quanto spesso ti capita la situazione ${target.askedQuestions.length + 1}?`,
      options: ['Mai', 'A volte', 'Spesso', 'Sempre'].map((label, k) => ({
        label,
        score: Math.round(minScore + step * k),
      })),
    })),
  };
}

const QUESTION_COUNT: Record<CalibrationAction, [number, number]> = {
  ASK_SINGLE: [1, 1],
  ASK_GROUP: [2, CALIBRATION_LIMITS.maxQuestions],
  REQUEST_CLARIFICATION: [1, 1],
  PROPOSE_MICRO_TEST: [0, 0],
};

const normalized = (text: string) => text.toLowerCase().replace(/\s+/g, ' ');

/**
 * Contratto del passo: azione ammessa, numero di domande coerente con
 * l'azione (mai per area), solo driver in focus, opzioni nella scala, nessuna
 * domanda già fatta. Le aree del passo si ricavano dalle domande.
 */
export function validateCalibrationStep(
  raw: unknown,
  input: CalibrationQuestionsInput,
  problems: string[] = [],
): CalibrationStep | null {
  const body = raw as {
    action?: unknown;
    rationale?: unknown;
    microTestAreaId?: unknown;
    questions?: unknown;
  } | null;
  const action = CALIBRATION_ACTIONS.find((a) => a === body?.action);
  if (!action) problems.push(`azione non ammessa: ${String(body?.action)}`);
  const rationale = clean(body?.rationale, CALIBRATION_LIMITS.rationale);
  if (!rationale) problems.push('motivo del passo mancante');
  const items = body?.questions;
  if (!Array.isArray(items)) {
    problems.push('questions mancanti');
    return null;
  }
  if (action) {
    const [min, max] = QUESTION_COUNT[action];
    if (items.length < min || items.length > max)
      problems.push(
        `${action}: da ${min} a ${max} domande, ricevute ${items.length}`,
      );
  }
  const focus = new Map(
    input.targets.filter((t) => t.focus).map((t) => [t.areaId, t]),
  );
  const microTestAreaId =
    typeof body?.microTestAreaId === 'string' ? body.microTestAreaId : null;
  if (action === 'PROPOSE_MICRO_TEST' && !focus.has(microTestAreaId ?? ''))
    problems.push(`micro-test su un driver non in focus: ${microTestAreaId}`);
  if (action !== 'PROPOSE_MICRO_TEST' && microTestAreaId)
    problems.push('microTestAreaId solo con PROPOSE_MICRO_TEST');
  const questions: CalibrationQuestion[] = [];
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const entry = item as Partial<Record<string, unknown>>;
    const areaId = typeof entry?.areaId === 'string' ? entry.areaId : '';
    const target = focus.get(areaId);
    if (!target) {
      problems.push(`driver non in focus: ${areaId || '?'}`);
      return;
    }
    const text = clean(entry.text, CALIBRATION_LIMITS.question);
    if (!text) problems.push(`testo non valido (${index + 1})`);
    else {
      const key = normalized(text);
      if (
        seen.has(key) ||
        target.askedQuestions.some((q) => normalized(q) === key)
      )
        problems.push(`domanda già fatta (${index + 1})`);
      seen.add(key);
    }
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
  if (problems.length || !action || !rationale) return null;
  return {
    action,
    rationale,
    targetAreas:
      action === 'PROPOSE_MICRO_TEST'
        ? [microTestAreaId!]
        : [...new Set(questions.map((q) => q.areaId))],
    questions,
  };
}

function clean(value: unknown, max: number) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && trimmed.length <= max ? trimmed : null;
}
