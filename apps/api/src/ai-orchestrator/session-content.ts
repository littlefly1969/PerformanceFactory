/**
 * Contenuto eseguibile di una sessione scritto dall'AI: esercizi in ordine, con
 * prescrizione, indicazione tecnica e descrizione del video dimostrativo che
 * l'atleta vedrà prima di eseguirli. Finché l'archivio video non esiste, la
 * descrizione è il segnaposto mostrato al posto del video.
 *
 * Tutti i campi sono facoltativi per le sessioni già pubblicate: chi legge
 * ripiega su titolo e testo della sessione.
 */
export const SESSION_MODES = ['SOLO', 'PARTNER', 'COACH'] as const;
export type SessionMode = (typeof SESSION_MODES)[number];
export const OBJECTIVE_SOURCES = [
  'CHECK_IN_TEST',
  'COACH_EVALUATION',
  'ATHLETE_ANSWERS',
] as const;
export type ObjectiveSource = (typeof OBJECTIVE_SOURCES)[number];
export const MAX_EXERCISES = 12;
export const MAX_OBJECTIVES = 4;
const MAX_TIMER_SECONDS = 900;

export type SessionExercise = {
  name: string;
  prescription: string;
  cue: string;
  demo: string;
  workSeconds: number | null;
  restSeconds: number | null;
};
export type SessionContent = {
  mode: SessionMode | null;
  goal: string | null;
  prerequisites: string | null;
  exercises: SessionExercise[];
};
export type MeasurableObjective = {
  area: string;
  title: string;
  unit: string | null;
  baseline: number | null;
  current: number | null;
  target: number | null;
  /** Bersaglio non numerico, ad esempio "Valutazione del coach". */
  targetLabel: string | null;
  deadline: string;
  source: ObjectiveSource;
};

const nullableText = { type: ['string', 'null'] };
const nullableSeconds = {
  type: ['integer', 'null'],
  minimum: 0,
  maximum: MAX_TIMER_SECONDS,
};

function ordered<T extends Record<string, unknown>>(
  properties: T,
  includePropertyOrdering?: boolean,
) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
    ...(includePropertyOrdering
      ? { propertyOrdering: Object.keys(properties) }
      : {}),
  };
}

/** Proprietà aggiunte a ogni sessione proposta (sport e aree). */
export function sessionContentSchemaProperties(options?: {
  includePropertyOrdering?: boolean;
}) {
  return {
    mode: { type: 'string', enum: [...SESSION_MODES] },
    goal: nullableText,
    prerequisites: nullableText,
    exercises: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_EXERCISES,
      items: ordered(
        {
          name: { type: 'string' },
          prescription: { type: 'string' },
          cue: { type: 'string' },
          demo: { type: 'string' },
          workSeconds: nullableSeconds,
          restSeconds: nullableSeconds,
        },
        options?.includePropertyOrdering,
      ),
    },
  };
}

export function objectivesSchema(options?: {
  includePropertyOrdering?: boolean;
}) {
  return {
    type: 'array',
    minItems: 0,
    maxItems: MAX_OBJECTIVES,
    items: ordered(
      {
        area: { type: 'string' },
        title: { type: 'string' },
        unit: nullableText,
        baseline: { type: ['number', 'null'] },
        current: { type: ['number', 'null'] },
        target: { type: ['number', 'null'] },
        targetLabel: nullableText,
        deadline: { type: 'string' },
        source: { type: 'string', enum: [...OBJECTIVE_SOURCES] },
      },
      options?.includePropertyOrdering,
    ),
  };
}

export const SESSION_CONTENT_RULES = [
  'Ogni sessione elenca gli esercizi in ordine di esecuzione (riscaldamento compreso): nome, prescrizione breve (es. "2 × 40 sec", "12 per lato"), indicazione tecnica di una o due frasi e la descrizione del video dimostrativo da mostrare prima dell\'esercizio.',
  "workSeconds solo per gli esercizi a tempo (durata di una serie), altrimenti null; restSeconds è il recupero dopo l'esercizio. La somma deve stare nella durata della sessione.",
  'mode: SOLO, PARTNER (serve un compagno) o COACH; goal e prerequisites in una riga, null se non servono.',
];
export const OBJECTIVE_RULES = [
  "objectives: da zero a quattro obiettivi misurabili del blocco, solo se il contesto contiene un dato di partenza (test del check-in, valutazione del coach o risposte dell'atleta). Non inventare valori: baseline, current e target null quando manca il dato, con targetLabel che dice come si misura.",
  'current è l\'ultimo valore noto (uguale a baseline all\'inizio); deadline è breve ("Entro fine blocco", "Entro 6 settimane").',
];

function text(value: unknown, max = 400) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}
/** Zero resta un valore: un recupero di 0 secondi è un'istruzione, non un dato mancante. */
function seconds(value: unknown, min: number) {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= MAX_TIMER_SECONDS
    ? value
    : null;
}
function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Tiene solo esercizi completi: un esercizio malformato non invalida il piano. */
export function normalizeSessionContent(value: unknown): SessionContent {
  const item = record(value) ?? {};
  const exercises = (Array.isArray(item.exercises) ? item.exercises : [])
    .map((raw): SessionExercise | null => {
      const e = record(raw);
      const name = text(e?.name, 120);
      const prescription = text(e?.prescription, 80);
      if (!e || !name || !prescription) return null;
      return {
        name,
        prescription,
        cue: text(e.cue) ?? '',
        demo: text(e.demo) ?? '',
        workSeconds: seconds(e.workSeconds, 1),
        restSeconds: seconds(e.restSeconds, 0),
      };
    })
    .filter((e): e is SessionExercise => e !== null)
    .slice(0, MAX_EXERCISES);
  return {
    mode: SESSION_MODES.includes(item.mode as SessionMode)
      ? (item.mode as SessionMode)
      : null,
    goal: text(item.goal, 160),
    prerequisites: text(item.prerequisites, 160),
    exercises,
  };
}

/** Campi da salvare nei metadata dell'attività, solo quando presenti. */
export function sessionContentMetadata(content: SessionContent) {
  return {
    ...(content.mode ? { mode: content.mode } : {}),
    ...(content.goal ? { goal: content.goal } : {}),
    ...(content.prerequisites ? { prerequisites: content.prerequisites } : {}),
    ...(content.exercises.length ? { exercises: content.exercises } : {}),
  };
}

export function normalizeObjectives(value: unknown): MeasurableObjective[] {
  return (Array.isArray(value) ? value : [])
    .map((raw): MeasurableObjective | null => {
      const o = record(raw);
      const area = text(o?.area, 80);
      const title = text(o?.title, 120);
      const source = o?.source as ObjectiveSource;
      if (!o || !area || !title || !OBJECTIVE_SOURCES.includes(source))
        return null;
      const baseline = finite(o.baseline);
      const target = finite(o.target);
      const targetLabel = text(o.targetLabel, 120);
      if (target === null && !targetLabel) return null;
      return {
        area,
        title,
        unit: text(o.unit, 24),
        baseline,
        current: finite(o.current) ?? baseline,
        target,
        targetLabel,
        deadline: text(o.deadline, 60) ?? 'Entro fine blocco',
        source,
      };
    })
    .filter((o): o is MeasurableObjective => o !== null)
    .slice(0, MAX_OBJECTIVES);
}

/** Esempio deterministico per il provider stub (sviluppo e test). */
export function stubSessionContent(
  title: string,
  durationMinutes: number,
): SessionContent {
  const exercises: SessionExercise[] = [
    {
      name: 'Riscaldamento dinamico',
      prescription: '3 min',
      cue: 'Corsa leggera, skip e circonduzioni delle braccia.',
      demo: 'Sequenza di riscaldamento dinamico a bordo campo.',
      workSeconds: 180,
      restSeconds: 30,
    },
    {
      name: 'Skip laterale',
      prescription: '2 × 40 sec',
      cue: "Busto alto, appoggi sull'avampiede, ginocchia attive.",
      demo: 'Skip laterale lungo la linea di fondo, vista frontale.',
      workSeconds: 40,
      restSeconds: 45,
    },
    {
      name: 'Affondi laterali',
      prescription: '12 per lato',
      cue: 'Ginocchio sopra il piede, petto alto. Spingi con il tallone per risalire.',
      demo: 'Affondo laterale con ritorno esplosivo, vista frontale e di profilo.',
      workSeconds: null,
      restSeconds: 45,
    },
    {
      name: 'Plank',
      prescription: '2 × 45 sec',
      cue: 'Bacino in linea con le spalle, respira senza trattenere.',
      demo: 'Plank sugli avambracci, vista di profilo.',
      workSeconds: 45,
      restSeconds: 30,
    },
  ];
  return {
    mode: 'SOLO',
    goal: title,
    prerequisites:
      durationMinutes > 30 ? null : 'Nessun dolore a caviglie e ginocchia',
    exercises,
  };
}
