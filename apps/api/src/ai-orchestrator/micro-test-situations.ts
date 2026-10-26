import type { MicroTestInput } from './micro-test-generation';

/**
 * Due forme di micro-test: la prova pratica con l'esito riportato
 * dall'atleta, e le situazioni di gioco con una risposta corretta e la
 * spiegazione del coach per ogni risposta. Le sceglie l'AI per il driver.
 */
export const MICRO_TEST_FORMATS = ['PRACTICAL', 'SITUATIONAL'] as const;
export type MicroTestFormat = (typeof MICRO_TEST_FORMATS)[number];

export const SITUATION_LIMITS = {
  minSituations: 2,
  maxSituations: 4,
  label: 40,
  question: 160,
  context: 200,
  option: 100,
  feedback: 240,
  minOptions: 2,
  maxOptions: 4,
  videoTitle: 120,
};

/** Video scelto dall'AI: dall'archivio, o solo il titolo del video ideale. */
export type VideoChoice = { videoId: string | null; title: string };

export type MicroTestSituation = {
  label: string;
  question: string;
  context: string;
  options: {
    value: string;
    label: string;
    score: number;
    correct: boolean;
    feedback: string;
  }[];
  /** Video da proporre se l'atleta sbaglia questa situazione. */
  video: VideoChoice | null;
};

const VIDEO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['videoId', 'title'],
  properties: {
    videoId: { type: ['string', 'null'] },
    title: { type: 'string' },
  },
};

export const SITUATIONS_SCHEMA = {
  format: { type: 'string', enum: [...MICRO_TEST_FORMATS] },
  video: VIDEO_SCHEMA,
  situations: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['label', 'question', 'context', 'options', 'video'],
      properties: {
        label: { type: 'string' },
        question: { type: 'string' },
        context: { type: 'string' },
        video: VIDEO_SCHEMA,
        options: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'correct', 'feedback', 'score'],
            properties: {
              label: { type: 'string' },
              correct: { type: 'boolean' },
              feedback: { type: 'string' },
              score: { type: 'number' },
            },
          },
        },
      },
    },
  },
};

export function situationRules(input: MicroTestInput) {
  const l = SITUATION_LIMITS;
  return [
    '- format: PRACTICAL per una prova da svolgere con un risultato da contare; SITUATIONAL per situazioni di gioco reali in cui l’atleta sceglie cosa farebbe in campo (lettura del gioco, posizionamento, scelte tattiche, gestione mentale). Scegli la forma che chiude meglio la lacuna del driver.',
    `- con PRACTICAL: options come sotto e situations vuoto. Con SITUATIONAL: options vuoto, physicalLoad NONE, safetyNotes vuoto, e situations da ${l.minSituations} a ${l.maxSituations} (di solito 3).`,
    `- ogni situazione: label breve della fase di gioco (massimo ${l.label} caratteri, per esempio «Uscita dal fondo»), question in massimo ${l.question} caratteri, context in massimo ${l.context} caratteri (dove sei, dove sono gli avversari).`,
    `- options della situazione: da ${l.minOptions} a ${l.maxOptions} risposte plausibili, label di massimo ${l.option} caratteri, esattamente una con correct true e score più alto delle altre; score tra ${input.scale.minScore} e ${input.scale.maxScore}; feedback di massimo ${l.feedback} caratteri: per la corretta perché funziona, per le altre cosa succede in campo e perché il coach farebbe diversamente.`,
    `- video: scegli dall’archivio ricevuto (videos) il video che l’atleta dovrebbe guardare dopo il test e indica il suo id; se nessuno è adatto metti videoId null e nel title descrivi in massimo ${l.videoTitle} caratteri il video ideale. Nelle situazioni il video è quello da proporre se l’atleta sbaglia quella situazione, con la stessa regola. Non inventare id.`,
  ].join('\n');
}

const normalize = (text: string) => text.trim().toLowerCase();

function clean(value: unknown, max: number) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && trimmed.length <= max ? trimmed : null;
}

/** Video dell'AI: id dell'archivio o nullo, titolo sempre presente. */
export function validateVideo(
  raw: unknown,
  catalog: Set<string>,
  problems: string[],
  where: string,
): VideoChoice | null {
  if (raw === undefined || raw === null) return null;
  const video = raw as Partial<Record<string, unknown>>;
  const title = clean(video.title, SITUATION_LIMITS.videoTitle);
  const videoId =
    typeof video.videoId === 'string' && video.videoId ? video.videoId : null;
  if (!title) problems.push(`titolo del video non valido (${where})`);
  if (videoId && !catalog.has(videoId))
    problems.push(`video fuori archivio (${where})`);
  return title
    ? { videoId: videoId && catalog.has(videoId) ? videoId : null, title }
    : null;
}

/**
 * Situazioni di gioco: testi entro i limiti, risposte distinte, una sola
 * corretta e con lo score più alto, spiegazione per ogni risposta.
 */
export function validateSituations(
  raw: unknown,
  input: MicroTestInput,
  catalog: Set<string>,
  problems: string[],
  n: number,
): MicroTestSituation[] {
  const l = SITUATION_LIMITS;
  const items = Array.isArray(raw) ? raw : [];
  if (items.length < l.minSituations || items.length > l.maxSituations)
    problems.push(`numero di situazioni non valido (${n})`);
  return items.map((item, s) => {
    const where = `${n}.${s + 1}`;
    const entry = item as Partial<Record<string, unknown>>;
    const label = clean(entry?.label, l.label);
    const question = clean(entry?.question, l.question);
    const context =
      typeof entry?.context === 'string' ? entry.context.trim() : '';
    if (!label) problems.push(`fase di gioco non valida (${where})`);
    if (!question) problems.push(`situazione non valida (${where})`);
    if (context.length > l.context)
      problems.push(`contesto troppo lungo (${where})`);
    const options = Array.isArray(entry?.options) ? entry.options : [];
    if (options.length < l.minOptions || options.length > l.maxOptions)
      problems.push(`numero di risposte non valido (${where})`);
    const parsed = options.map((option, k) => {
      const o = option as Partial<Record<string, unknown>>;
      const optionLabel = clean(o?.label, l.option);
      const feedback = clean(o?.feedback, l.feedback);
      const score = o?.score;
      if (
        !optionLabel ||
        !feedback ||
        typeof o?.correct !== 'boolean' ||
        typeof score !== 'number' ||
        !Number.isFinite(score) ||
        score < input.scale.minScore ||
        score > input.scale.maxScore
      )
        problems.push(`risposta non valida (${where}.${k + 1})`);
      return {
        value: `o${k + 1}`,
        label: optionLabel ?? '',
        score: Number(score),
        correct: o?.correct === true,
        feedback: feedback ?? '',
      };
    });
    if (new Set(parsed.map((o) => normalize(o.label))).size !== parsed.length)
      problems.push(`risposte duplicate (${where})`);
    const correct = parsed.filter((o) => o.correct);
    if (correct.length !== 1)
      problems.push(`serve una sola risposta corretta (${where})`);
    else if (parsed.some((o) => !o.correct && o.score >= correct[0].score))
      problems.push(`la risposta corretta deve valere di più (${where})`);
    return {
      label: label ?? '',
      question: question ?? '',
      context,
      options: parsed,
      video: validateVideo(entry?.video, catalog, problems, where),
    };
  });
}

/** Testo delle situazioni per il controllo dei contenuti non sicuri. */
export const situationsText = (situations: MicroTestSituation[]) =>
  situations
    .flatMap((s) => [
      s.question,
      s.context,
      ...s.options.flatMap((o) => [o.label, o.feedback]),
    ])
    .join(' ');

/** Stub: tre situazioni di gioco con una risposta corretta ciascuna. */
export function stubSituations(input: MicroTestInput, name: string) {
  const { minScore, maxScore } = input.scale;
  const mid = Math.round((minScore + maxScore) / 2);
  return ['Uscita dal fondo', 'Posizionamento', 'Risposta al servizio'].map(
    (label, i) => ({
      label,
      question: `${name}: situazione ${i + 1}, cosa fai?`,
      context: 'Siete entrambi a rete, la palla arriva alta.',
      options: [
        {
          label: 'Gioco d’anticipo',
          correct: false,
          feedback: 'Anticipare qui ti fa perdere il controllo della palla.',
          score: minScore,
        },
        {
          label: 'Aspetto e scelgo il colpo',
          correct: true,
          feedback: 'Esatto: aspettare ti dà tempo e scelta.',
          score: maxScore,
        },
        {
          label: 'Rimando al centro',
          correct: false,
          feedback: 'Il centro tiene il punto vivo ma non lo costruisce.',
          score: mid,
        },
      ],
      video: { videoId: null, title: `${label}: come lo gioca un coach` },
    }),
  );
}
