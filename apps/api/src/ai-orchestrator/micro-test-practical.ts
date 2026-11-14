import type { MicroTestInput } from './micro-test-generation';
import type { MicroTestFormat } from './micro-test-situations';

/**
 * Filtri del micro-test della home (demo V10): Teorici sono le situazioni di
 * gioco, Pratici la prova da svolgere, sul campo o fuori dal campo (casa o
 * palestra). Il filtro lo sceglie l'atleta, l'AI scrive il test di quel tipo.
 */
export const MICRO_TEST_FILTERS = ['THEORY', 'ON_COURT', 'OFF_COURT'] as const;
export type MicroTestFilter = (typeof MICRO_TEST_FILTERS)[number];

/** Luogo della prova pratica. */
export const PRACTICAL_SETTINGS = ['ON_COURT', 'OFF_COURT'] as const;
export type PracticalSetting = (typeof PRACTICAL_SETTINGS)[number];

export const isMicroTestFilter = (value: unknown): value is MicroTestFilter =>
  MICRO_TEST_FILTERS.includes(value as MicroTestFilter);

/** Forma e luogo che il filtro impone al test. */
export const filterShape = (filter: MicroTestFilter) =>
  filter === 'THEORY'
    ? { format: 'SITUATIONAL' as const, setting: null }
    : { format: 'PRACTICAL' as const, setting: filter };

/** Filtro di un test già scritto: le situazioni sono teoriche. */
export const filterOf = (test: {
  format?: MicroTestFormat | null;
  setting?: PracticalSetting | null;
}): MicroTestFilter =>
  test.format === 'SITUATIONAL'
    ? 'THEORY'
    : // I test pratici scritti prima dei filtri non hanno un luogo.
      (test.setting ?? 'ON_COURT');

export const PRACTICAL_LIMITS = {
  minSteps: 2,
  maxSteps: 5,
  step: 140,
  question: 120,
  minTimerSeconds: 10,
  maxTimerSeconds: 600,
};

/** Campi della prova pratica nello schema di risposta dell'AI. */
export const PRACTICAL_SCHEMA = {
  setting: { type: ['string', 'null'] },
  steps: { type: 'array', items: { type: 'string' } },
  timerSeconds: { type: ['integer', 'null'] },
  question: { type: 'string' },
};

export type PracticalFields = {
  /** Sul campo o fuori dal campo; nullo nelle situazioni di gioco. */
  setting: PracticalSetting | null;
  /** Passaggi numerati; vuoto nelle situazioni di gioco. */
  steps: string[];
  /** Secondi del timer; nullo se la prova non ha un tempo da tenere. */
  timerSeconds: number | null;
  /** Domanda dell'esito («Quante volée di fila?»); vuota nelle situazioni. */
  question: string;
};

const FILTER_TEXT: Record<MicroTestFilter, string> = {
  THEORY:
    'teorico: format SITUATIONAL, situazioni di gioco reali a cui l’atleta risponde senza muoversi',
  ON_COURT:
    'pratico sul campo: format PRACTICAL e setting ON_COURT, una prova da fare su un campo da padel con pala e palline',
  OFF_COURT:
    'pratico fuori dal campo: format PRACTICAL e setting OFF_COURT, una prova da fare a casa o in palestra, senza campo, con il corpo libero o con oggetti di casa',
};

/** Regole fisse della prova pratica e del filtro scelto dall'atleta. */
export function practicalRules(input: MicroTestInput) {
  const l = PRACTICAL_LIMITS;
  return [
    `- con PRACTICAL: setting ON_COURT (sul campo) oppure OFF_COURT (fuori dal campo: casa o palestra); steps da ${l.minSteps} a ${l.maxSteps} passaggi brevi in ordine, ciascuno di massimo ${l.step} caratteri, che l’atleta segue mentre fa la prova; question: la domanda sull’esito in massimo ${l.question} caratteri (per esempio «Quante volée di fila, nel tentativo migliore?» oppure «Com’è andata?»); timerSeconds: i secondi da tenere con il timer, da ${l.minTimerSeconds} a ${l.maxTimerSeconds}, solo se la prova è a tempo (per esempio una tenuta di 45 secondi), altrimenti null. instructions resta il riassunto della prova.`,
    '- con SITUATIONAL: setting null, steps vuoto, timerSeconds null, question stringa vuota.',
    ...(input.filter
      ? [
          `- FILTRO SCELTO DALL’ATLETA: il micro-test è ${FILTER_TEXT[input.filter]}. Questa regola prevale sulla scelta della forma.`,
        ]
      : []),
  ].join('\n');
}

function clean(value: unknown, max: number) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && trimmed.length <= max ? trimmed : null;
}

/**
 * Luogo, passaggi, timer e domanda dell'esito: obbligatori e nei limiti nella
 * prova pratica, assenti nelle situazioni. Con un filtro, forma e luogo devono
 * essere quelli del filtro.
 */
export function validatePractical(
  entry: Partial<Record<string, unknown>>,
  format: MicroTestFormat,
  input: MicroTestInput,
  problems: string[],
  n: number,
): PracticalFields {
  const l = PRACTICAL_LIMITS;
  if (input.filter) {
    const shape = filterShape(input.filter);
    if (format !== shape.format)
      problems.push(`forma diversa dal filtro ${input.filter} (${n})`);
    else if (shape.setting && entry.setting !== shape.setting)
      problems.push(`luogo diverso dal filtro ${input.filter} (${n})`);
  }
  if (format === 'SITUATIONAL') {
    const steps = Array.isArray(entry.steps) ? entry.steps : [];
    if (entry.setting || steps.length || entry.timerSeconds)
      problems.push(`le situazioni non hanno luogo, passaggi o timer (${n})`);
    return { setting: null, steps: [], timerSeconds: null, question: '' };
  }
  // Senza filtro il luogo può mancare, come nei test storici.
  const setting =
    PRACTICAL_SETTINGS.find((s) => s === entry.setting) ??
    ((entry.setting ?? null) === null && !input.filter ? null : undefined);
  if (setting === undefined) problems.push(`luogo non valido (${n})`);
  const rawSteps = Array.isArray(entry.steps) ? entry.steps : null;
  const steps = (rawSteps ?? []).map((s) => clean(s, l.step));
  if (
    rawSteps === null
      ? !!input.filter
      : steps.length < l.minSteps ||
        steps.length > l.maxSteps ||
        steps.some((s) => !s)
  )
    problems.push(`passaggi non validi (${n})`);
  const timer = entry.timerSeconds ?? null;
  if (
    timer !== null &&
    (typeof timer !== 'number' ||
      !Number.isInteger(timer) ||
      timer < l.minTimerSeconds ||
      timer > l.maxTimerSeconds)
  )
    problems.push(`timer non valido (${n})`);
  const question =
    entry.question === undefined && !input.filter
      ? ''
      : clean(entry.question, l.question);
  if (question === null) problems.push(`domanda dell'esito non valida (${n})`);
  return {
    setting: setting ?? null,
    steps: steps.filter((s): s is string => !!s),
    timerSeconds: typeof timer === 'number' ? timer : null,
    question: question ?? '',
  };
}

/** Stub: passaggi e timer coerenti con il filtro. */
export function stubPractical(filter: MicroTestFilter | undefined) {
  const offCourt = filter === 'OFF_COURT';
  return {
    setting: filter ? (offCourt ? 'OFF_COURT' : 'ON_COURT') : null,
    steps: offCourt
      ? [
          'Avambracci a terra, gomiti sotto le spalle.',
          'Corpo dritto dalla testa ai talloni.',
          'Tieni senza far scendere il bacino.',
        ]
      : [
          'Mettiti a due metri dalla parete laterale.',
          'Colpisci di volée senza far cadere la palla.',
          'Fai tre tentativi e tieni il migliore.',
        ],
    timerSeconds: offCourt ? 45 : null,
    question: offCourt ? 'Com’è andata?' : 'Quante ne hai fatte, su 10?',
  };
}
