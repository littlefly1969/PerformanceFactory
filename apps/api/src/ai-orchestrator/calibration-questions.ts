import { recordAiValidationFailure } from '../common/ai-telemetry';
import type { MicroTestFormat, VideoChoice } from './micro-test-situations';
import type { PracticalSetting } from './micro-test-practical';
import { BadGatewayException, Logger } from '@nestjs/common';
import { hashJson } from './proposal-audit';
import { requestStructuredProposal } from './proposal-structured-transport';
import { resolveModel, resolveProvider } from './provider-config';
import { AiProvider } from './proposal-provider-model';
import { AssessmentEvaluationAnswer } from './assessment-evaluation-model';
import { FIT_RANKING_RULE, FitRankingContext } from './fit-ranking-context';
import { PADEL_SPORT_RULE } from './padel-context';

/** Tipo di prompt in AiPromptVersion per le domande dei round di calibrazione. */
export const CALIBRATION_PROMPT_TYPE = 'CALIBRATION_QUESTIONS';

export const DEFAULT_CALIBRATION_PROMPT = [
  'Sei il motore di calibrazione di Performance Factory, la piattaforma di allenamento al padel. Lo sport è il padel: ogni domanda, situazione di gioco e termine tecnico è di padel, mai di tennis o di altri sport di racchetta. Dopo la prima valutazione di un atleta amatoriale maggiorenne ricevi tutti i driver con score R provvisorio, confidenza, lacune di evidenza e domande già fatte; i driver ancora sotto la regola di consolidamento sono marcati come focus.',
  'La calibrazione procede a blocchi: di norma ogni passo è una coppia di domande indipendenti, anche su due driver diversi. Una sola domanda solo quando la risposta cambierà la domanda successiva o resta un solo aspetto da chiarire; un chiarimento neutro quando due risposte si contraddicono. Non c’è un numero fisso di domande per driver: chiedi solo ciò che riduce davvero una lacuna, e non coprire un driver le cui evidenze bastano già.',
  'Tieni conto della classifica FIT dichiarata (padel e tennis, attuale e migliore di sempre): tara difficoltà, situazioni di gioco e lessico sul livello che indica, e chiedi conferma quando le risposte non tornano con la classifica. Una classifica di tennis dice da dove viene l’atleta, non di che sport parlare: le domande restano di padel.',
  'Domande su comportamenti concreti, frequenze, situazioni di gioco, risultati misurabili: di norma a scelta singola, a scelta multipla solo quando l’atleta può riconoscersi in più opzioni insieme. Evita domande già fatte o equivalenti.',
  'Ogni opzione ha uno score di riferimento sulla scala ricevuta: deve ancorare la risposta al livello reale, non premiare la risposta più lunga. Nelle domande a scelta singola le opzioni coprono tutta la scala e sono mutuamente esclusive.',
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
 * Azioni che il motore può scegliere nel ciclo di calibrazione: coppie di
 * domande (ASK_GROUP), una domanda o un chiarimento. Il micro-test non fa
 * parte del ciclo; PROPOSE_MICRO_TEST resta solo per i round già salvati.
 */
export const CALIBRATION_STEP_ACTIONS = [
  'ASK_GROUP',
  'ASK_SINGLE',
  'REQUEST_CLARIFICATION',
] as const satisfies readonly CalibrationAction[];

/** Un blocco di calibrazione: la coppia di domande, come nella demo PF10. */
export const PAIR = 2;

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
  /** Classifica FIT dichiarata in vigore; null se non dichiarata. */
  fitRanking?: FitRankingContext;
  targets: CalibrationTarget[];
  /** Conteggi della calibrazione e indicazione del back office (0 = nessuna). */
  microTestBalance?: MicroTestBalance;
};

export type MicroTestBalance = {
  questionsPerMicroTest: number;
  microTestsDone: number;
  microTestsSkipped: number;
  questionsAnswered: number;
};

/** Opzione di una domanda scritta dall'AI; `exclusive` solo nelle multiple. */
export type ChoiceOption = {
  value: string;
  label: string;
  score: number;
  exclusive?: true;
};

/**
 * Regola fissa delle domande a scelta multipla, comune alle domande iniziali
 * e ai round di calibrazione: prevale sul prompt modificabile.
 */
export const MULTIPLE_CHOICE_RULE =
  '- multiple: true solo quando l’atleta può riconoscersi in più opzioni insieme (per esempio dove sente fastidio o quali routine segue), altrimenti false. In una domanda multipla ogni opzione ha comunque il suo score di riferimento e al massimo un’opzione, come «Nessuna», ha exclusive true; in tutte le altre opzioni exclusive è false. Questa regola prevale sulle istruzioni sopra.';

export const CHOICE_OPTIONS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['label', 'score', 'exclusive'],
    properties: {
      label: { type: 'string' },
      score: { type: 'number' },
      exclusive: { type: 'boolean' },
    },
  },
};

/**
 * Opzioni di una domanda dell'AI: numero, etichette uniche, score nella
 * scala. `exclusive` vale solo nelle domande multiple e si scarta altrove.
 */
export function parseChoiceOptions(
  raw: unknown,
  multiple: boolean,
  scale: { minScore: number; maxScore: number },
  index: number,
  problems: string[],
): ChoiceOption[] {
  const l = CALIBRATION_LIMITS;
  const options = Array.isArray(raw) ? raw : [];
  if (options.length < l.minOptions || options.length > l.maxOptions)
    problems.push(`numero di opzioni non valido (${index + 1})`);
  const parsed = options.map((option, k) => {
    const o = option as Partial<Record<string, unknown>> | null;
    const label = clean(o?.label, l.option);
    const score = o?.score;
    if (
      !label ||
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      score < scale.minScore ||
      score > scale.maxScore
    )
      problems.push(`opzione non valida (${index + 1}.${k + 1})`);
    return {
      value: String(k),
      label: label ?? '',
      score: Number(score),
      ...(multiple && o?.exclusive === true
        ? { exclusive: true as const }
        : {}),
    };
  });
  if (new Set(parsed.map((o) => o.label)).size !== parsed.length)
    problems.push(`opzioni duplicate (${index + 1})`);
  if (parsed.filter((o) => o.exclusive).length > 1)
    problems.push(`più di un'opzione esclusiva (${index + 1})`);
  return parsed;
}

export type CalibrationQuestion = {
  id: string;
  areaId: string;
  text: string;
  options: ChoiceOption[];
  /** Più opzioni insieme; assente sulle domande a scelta singola. */
  multiple?: true;
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
    /** Titolo del test; assente nei test storici, dove è `text`. */
    title?: string;
    /** Prova pratica (storica) o situazioni di gioco. */
    format?: MicroTestFormat;
    /** Video da guardare dopo il test, scelto dall'AI. */
    video?: VideoChoice | null;
    /** Frase e consiglio per livello del risultato; assenti nei test storici. */
    results?: { verdict: string; takeaway: string }[];
    /** Prova pratica: luogo, passaggi, timer e domanda dell'esito; assenti nei test storici. */
    setting?: PracticalSetting | null;
    steps?: string[];
    timerSeconds?: number | null;
    question?: string;
    /** Solo nelle situazioni di gioco: una voce per situazione. */
    situation?: {
      index: number;
      total: number;
      label: string;
      context: string;
      /** Risposta corretta e spiegazione del coach, mostrate dopo la scelta. */
      options: { value: string; correct: boolean; feedback: string }[];
      /** Video da proporre se l'atleta sbaglia la situazione. */
      video: VideoChoice | null;
    };
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

function formatRules() {
  const l = CALIBRATION_LIMITS;
  return [
    'FORMATO DI RISPOSTA (fisso): rispondi solo con JSON conforme allo schema.',
    `- action: ASK_GROUP (la coppia, esattamente ${PAIR} domande indipendenti: è la scelta di norma), ASK_SINGLE (esattamente 1 domanda) oppure REQUEST_CLARIFICATION (esattamente 1 domanda neutra su una contraddizione).`,
    '- questions: solo sui driver con focus true, con il loro areaId; non serve coprirli tutti.',
    '- microTestAreaId: sempre null.',
    `- rationale: perché questo passo, in una frase di massimo ${l.rationale} caratteri, senza dati personali.`,
    `- text: massimo ${l.question} caratteri.`,
    '- le domande sono solo su comportamenti, frequenze e situazioni di gioco già vissute: niente micro-test, esercizi o prove da svolgere dentro una domanda. Questa regola prevale sulle istruzioni sopra.',
    `- options: da ${l.minOptions} a ${l.maxOptions}, label di massimo ${l.option} caratteri, score tra la scala minima e massima ricevute.`,
    MULTIPLE_CHOICE_RULE,
    '- un chiarimento (REQUEST_CLARIFICATION) è sempre a scelta singola.',
    FIT_RANKING_RULE,
    PADEL_SPORT_RULE,
  ].join('\n');
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'rationale', 'microTestAreaId', 'questions'],
  properties: {
    action: { type: 'string', enum: [...CALIBRATION_STEP_ACTIONS] },
    rationale: { type: 'string' },
    microTestAreaId: { type: ['string', 'null'] },
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

export function buildCalibrationPrompt(input: CalibrationQuestionsInput) {
  return {
    system: `${input.basePrompt.trim()}\n\n${formatRules()}`,
    user: {
      task: 'Decidi il prossimo blocco sui driver con focus: di norma una coppia di domande, altrimenti una domanda o un chiarimento.',
      scale: input.scale,
      athleteContext: input.athleteContext,
      fitRanking: input.fitRanking ?? null,
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
    recordAiValidationFailure(problems);
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
 * Stub deterministico per sviluppo e test: una coppia di domande sui primi
 * driver in focus (due sullo stesso driver se in focus ce n'è uno solo).
 */
export function stubCalibrationQuestions(input: CalibrationQuestionsInput) {
  const { minScore, maxScore } = input.scale;
  const step = (maxScore - minScore) / 3;
  const focus = input.targets.filter((t) => t.focus);
  const pair = focus.length
    ? Array.from({ length: PAIR }, (_, k) => ({
        target: focus[k % focus.length],
        n: Math.floor(k / focus.length),
      }))
    : [];
  return {
    action: 'ASK_GROUP',
    rationale: 'Domande sui driver ancora sotto la regola di consolidamento.',
    microTestAreaId: null,
    questions: pair.map(({ target, n }) => ({
      areaId: target.areaId,
      text: `${target.name}: quanto spesso ti capita la situazione ${target.askedQuestions.length + 1 + n}?`,
      options: ['Mai', 'A volte', 'Spesso', 'Sempre'].map((label, k) => ({
        label,
        score: Math.round(minScore + step * k),
      })),
    })),
  };
}

const QUESTION_COUNT: Record<CalibrationAction, [number, number]> = {
  ASK_SINGLE: [1, 1],
  ASK_GROUP: [PAIR, PAIR],
  REQUEST_CLARIFICATION: [1, 1],
  PROPOSE_MICRO_TEST: [0, 0],
};

const normalized = (text: string) => text.toLowerCase().replace(/\s+/g, ' ');

/**
 * Contratto del passo: azione ammessa, numero di domande coerente con
 * l'azione (mai per area), solo driver in focus, opzioni nella scala, nessuna
 * domanda già fatta. Le aree del passo si ricavano dalle domande. Un
 * micro-test proposto dal motore scarta il passo: non fa parte del ciclo.
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
  // Un micro-test proposto dal motore non è più un passo valido del ciclo.
  const action = CALIBRATION_STEP_ACTIONS.find((a) => a === body?.action);
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
  if (typeof body?.microTestAreaId === 'string' && body.microTestAreaId)
    problems.push('micro-test fuori dal ciclo di calibrazione');
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
    const multiple = entry.multiple === true;
    if (multiple && action === 'REQUEST_CLARIFICATION')
      problems.push(`chiarimento a scelta multipla (${index + 1})`);
    const parsed = parseChoiceOptions(
      entry.options,
      multiple,
      input.scale,
      index,
      problems,
    );
    questions.push({
      id: `q${index + 1}`,
      areaId,
      text: text ?? '',
      options: parsed,
      ...(multiple ? { multiple: true as const } : {}),
    });
  });
  if (problems.length || !action || !rationale) return null;
  return {
    action,
    rationale,
    targetAreas: [...new Set(questions.map((q) => q.areaId))],
    questions,
  };
}

function clean(value: unknown, max: number) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && trimmed.length <= max ? trimmed : null;
}
