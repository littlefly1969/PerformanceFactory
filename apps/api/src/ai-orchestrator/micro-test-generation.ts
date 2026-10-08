import { BadGatewayException, Logger } from '@nestjs/common';
import { hashJson } from './proposal-audit';
import { requestStructuredProposal } from './proposal-structured-transport';
import { resolveModel, resolveProvider } from './provider-config';
import { AiProvider } from './proposal-provider-model';
import { AssessmentEvaluationAnswer } from './assessment-evaluation-model';

/** Tipo di prompt in AiPromptVersion per i micro-test su misura. */
export const MICRO_TEST_PROMPT_TYPE = 'MICRO_TESTS';

export const DEFAULT_MICRO_TEST_PROMPT = [
  'Sei il preparatore di Performance Factory e scrivi micro-test pratici per un atleta amatoriale maggiorenne nel periodo di prova. Ricevi il suo profilo, la scala dei punteggi, i driver su cui la valutazione è meno affidabile (score R provvisorio, confidenza, lacune di evidenza e risposte già date, ciascuna con la sua fonte) e i micro-test già proposti.',
  'Scopo: ogni micro-test produce l’evidenza che manca alla valutazione di quel driver. Parti dalle lacune indicate e dalle risposte già date; verifica con un esercizio ciò che l’atleta ha dichiarato e che la valutazione non sa ancora confermare. Non chiedere di nuovo ciò che è già chiaro.',
  'Forma: un esercizio da 5-10 minuti che l’atleta svolge da solo o con un compagno, in campo o a casa, con un risultato che può contare (quante riuscite su 10, quanti secondi, quante volte di fila, quanti punti su 5 scambi). Per i driver non tecnici (preparazione, mental, nutrizione) usa una prova osservabile o un diario di un giorno con un conteggio preciso, non un’autovalutazione generica.',
  'Su misura: adatta difficoltà, contesto e soglie a ciò che sai dell’atleta (esperienza, frequenza di gioco, obiettivo, limiti dichiarati). Un principiante non riceve esercizi da agonista; chi gioca spesso riceve soglie più alte. Se il profilo segnala dolori o limitazioni, scegli un test tecnico a basso impatto.',
  'Istruzioni: cosa preparare, cosa fare passo per passo, cosa contare. Solo racchetta, palline, un muro o un campo, un cronometro: niente attrezzi particolari, niente salti ripetuti, carichi, sprint massimali o altri rischi.',
  'Esiti: fasce del risultato contato, mutuamente esclusive, in ordine crescente, che coprono tutti i casi. Lo score di ogni esito è il livello reale che quella fascia indica sulla scala ricevuta, dal più basso al più alto: non premiare l’esito descritto meglio.',
  'Non ripetere micro-test già proposti né esercizi equivalenti.',
  'Scrivi in italiano, con il tu, frasi brevi e concrete. Niente diagnosi mediche, niente dati personali, niente promesse di risultato.',
].join('\n');

export const MICRO_TEST_LIMITS = {
  title: 80,
  instructions: 500,
  option: 100,
  minOptions: 3,
  maxOptions: 5,
};

export type MicroTestTarget = {
  areaId: string;
  name: string;
  score: number;
  confidence: number;
  evidenceGaps: string[];
  evidence: Array<AssessmentEvaluationAnswer & { source: string }>;
};

export type MicroTestInput = {
  basePrompt: string;
  promptVersionId: string | null;
  scale: { minScore: number; maxScore: number };
  athleteContext: AssessmentEvaluationAnswer[];
  targets: MicroTestTarget[];
  proposedTitles: string[];
};

export type GeneratedMicroTest = {
  areaId: string;
  title: string;
  instructions: string;
  options: { value: string; label: string; score: number }[];
};

export type MicroTestResult = {
  provider: AiProvider;
  model: string;
  promptHash: string;
  tests: GeneratedMicroTest[];
  latencyMs: number;
};

function formatRules(input: MicroTestInput) {
  const l = MICRO_TEST_LIMITS;
  return [
    'FORMATO DI RISPOSTA (fisso): rispondi solo con JSON conforme allo schema.',
    `- tests: esattamente un micro-test per ciascuno dei ${input.targets.length} driver ricevuti, con lo stesso areaId.`,
    `- title: massimo ${l.title} caratteri, diverso dai micro-test già proposti.`,
    `- instructions: massimo ${l.instructions} caratteri.`,
    `- options: da ${l.minOptions} a ${l.maxOptions} esiti in ordine crescente, label di massimo ${l.option} caratteri, score crescenti tra ${input.scale.minScore} e ${input.scale.maxScore}.`,
  ].join('\n');
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['tests'],
  properties: {
    tests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['areaId', 'title', 'instructions', 'options'],
        properties: {
          areaId: { type: 'string' },
          title: { type: 'string' },
          instructions: { type: 'string' },
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

export function buildMicroTestPrompt(input: MicroTestInput) {
  return {
    system: `${input.basePrompt.trim()}\n\n${formatRules(input)}`,
    user: {
      task: 'Un micro-test su misura per ciascun driver ricevuto.',
      scale: input.scale,
      athleteContext: input.athleteContext,
      drivers: input.targets,
      proposedTitles: input.proposedTitles,
    },
  };
}

export async function generateMicroTests(
  logger: Logger,
  input: MicroTestInput,
): Promise<MicroTestResult> {
  const startedAt = Date.now();
  const provider = resolveProvider();
  const model = resolveModel(provider);
  const prompt = buildMicroTestPrompt(input);
  const inputJson = { promptVersionId: input.promptVersionId, prompt };
  let raw: unknown;
  if (provider === 'stub') {
    raw = stubMicroTests(input);
  } else {
    const result = await requestStructuredProposal(
      logger,
      provider,
      model,
      inputJson,
      { ...prompt, schema },
      'micro_tests',
    );
    try {
      raw = JSON.parse(result.outputText);
    } catch {
      raw = null;
    }
  }
  const problems: string[] = [];
  const tests = validateMicroTests(raw, input, problems);
  if (!tests) {
    logger.warn(
      `INVALID_MICRO_TESTS ${provider}/${model}: ${problems.join('; ')}`,
    );
    throw new BadGatewayException({
      code: 'INVALID_MICRO_TESTS',
      message: 'Non siamo riusciti a preparare i micro-test. Riprova.',
    });
  }
  return {
    provider,
    model,
    promptHash: hashJson(inputJson),
    tests,
    latencyMs: Date.now() - startedAt,
  };
}

/** Stub deterministico per sviluppo e test: un conteggio su 10 per driver. */
export function stubMicroTests(input: MicroTestInput) {
  const { minScore, maxScore } = input.scale;
  const step = (maxScore - minScore) / 3;
  return {
    tests: input.targets.map((target) => ({
      areaId: target.areaId,
      title: `${target.name}: prova ${input.proposedTitles.length + 1}`,
      instructions: `Ripeti 10 volte l'esercizio su ${target.name.toLowerCase()} e conta quante riescono.`,
      options: ['0-3', '4-6', '7-8', '9-10'].map((label, k) => ({
        label: `${label} su 10`,
        score: Math.round(minScore + step * k),
      })),
    })),
  };
}

/**
 * Contratto rigido: un test per driver, testi entro i limiti, esiti distinti
 * con score crescenti nella scala, titoli nuovi. Un output che non lo rispetta
 * non arriva all'atleta.
 */
export function validateMicroTests(
  raw: unknown,
  input: MicroTestInput,
  problems: string[] = [],
): GeneratedMicroTest[] | null {
  const items = (raw as { tests?: unknown } | null)?.tests;
  if (!Array.isArray(items)) {
    problems.push('tests mancanti');
    return null;
  }
  const l = MICRO_TEST_LIMITS;
  const targets = new Set(input.targets.map((t) => t.areaId));
  const seen = new Set<string>();
  const titles = new Set(input.proposedTitles.map(normalize));
  const tests: GeneratedMicroTest[] = [];
  items.forEach((item, index) => {
    const n = index + 1;
    const entry = item as Partial<Record<string, unknown>>;
    const areaId = typeof entry?.areaId === 'string' ? entry.areaId : '';
    if (!targets.has(areaId) || seen.has(areaId)) {
      problems.push(`driver inatteso o ripetuto: ${areaId || '?'}`);
      return;
    }
    seen.add(areaId);
    const title = clean(entry.title, l.title);
    const instructions = clean(entry.instructions, l.instructions);
    if (!title) problems.push(`titolo non valido (${n})`);
    else if (titles.has(normalize(title)))
      problems.push(`micro-test già proposto (${n})`);
    if (!instructions) problems.push(`istruzioni non valide (${n})`);
    const options = Array.isArray(entry.options) ? entry.options : [];
    if (options.length < l.minOptions || options.length > l.maxOptions)
      problems.push(`numero di esiti non valido (${n})`);
    const parsed = options.map((option, k) => {
      const o = option as Partial<Record<string, unknown>>;
      const label = clean(o?.label, l.option);
      const score = o?.score;
      if (
        !label ||
        typeof score !== 'number' ||
        !Number.isFinite(score) ||
        score < input.scale.minScore ||
        score > input.scale.maxScore
      )
        problems.push(`esito non valido (${n}.${k + 1})`);
      return { value: `o${k + 1}`, label: label ?? '', score: Number(score) };
    });
    if (new Set(parsed.map((o) => normalize(o.label))).size !== parsed.length)
      problems.push(`esiti duplicati (${n})`);
    if (parsed.some((o, k) => k > 0 && o.score <= parsed[k - 1].score))
      problems.push(`score non crescenti (${n})`);
    tests.push({
      areaId,
      title: title ?? '',
      instructions: instructions ?? '',
      options: parsed,
    });
  });
  for (const areaId of targets)
    if (!seen.has(areaId)) problems.push(`micro-test mancante per ${areaId}`);
  return problems.length ? null : tests;
}

const normalize = (text: string) => text.trim().toLowerCase();

function clean(value: unknown, max: number) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && trimmed.length <= max ? trimmed : null;
}
