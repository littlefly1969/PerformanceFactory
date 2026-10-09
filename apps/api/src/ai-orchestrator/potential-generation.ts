import { BadGatewayException, Logger } from '@nestjs/common';
import { ProgramHorizon } from '@prisma/client';
import { hashJson } from './proposal-audit';
import { requestStructuredProposal } from './proposal-structured-transport';
import { resolveModel, resolveProvider } from './provider-config';

/** Tipo di prompt in AiPromptVersion per gli scenari P3/P6/P12. */
export const POTENTIAL_PROMPT_TYPE = 'POTENTIAL';

export const DEFAULT_POTENTIAL_PROMPT = [
  'Sei il Performance Engine di Performance Factory. Ricevi la R consolidata di un atleta amatoriale maggiorenne, driver per driver, con confidenza, commitment, motivazione della valutazione e lacune residue, più livello e giorni a settimana dichiarati.',
  'Scopo: stimare dove può arrivare ogni driver in 3, 6 e 12 mesi di percorso guidato (P3, P6, P12), in modo onesto e motivato. Il potenziale cresce più in fretta all’inizio e poi rallenta: non proiettare una crescita lineare.',
  'Usa ciò che sai: un commitment alto e più giorni disponibili giustificano progressi maggiori; un driver già vicino al tetto del livello cresce poco o resta dov’è; lacune di evidenza ampie riducono la confidenza, non il potenziale.',
  'Ogni driver ha limiti per orizzonte (valore massimo e confidenza massima) calcolati da criteri versionati: restaci dentro. Se non c’è margine, P resta uguale a R.',
  'Per ogni stima scrivi una motivazione breve e concreta, con il tu, senza promesse di risultato né dati personali.',
].join('\n');

const LEVEL_CEILING: Record<string, number> = {
  BEGINNER: 0.7,
  INTERMEDIATE: 0.8,
  ADVANCED: 0.88,
  COMPETITIVE: 0.94,
  PRO: 0.98,
};

/**
 * Criteri versionati entro cui l'AI formula P (PF-FS-PREPAYWALL §7.1,
 * OP-03). Valori provvisori da approvare nella Parte C: finché `approved` è
 * false gli scenari restano marcati come stima provvisoria. Cambiare un
 * valore richiede una nuova versione.
 */
export const POTENTIAL_CRITERIA = {
  key: 'potential-criteria',
  version: '1',
  approved: false,
  /** Tetto per livello, in quota della scala: P non lo supera. */
  levelCeiling: LEVEL_CEILING,
  defaultCeiling: 0.8,
  /** Quota massima del margine R→tetto colmabile in ciascun orizzonte. */
  maxMarginShare: { PROGRAM_3M: 0.5, PROGRAM_6M: 0.75, PROGRAM_12M: 0.95 },
  /** Confidenza massima rispetto a quella del driver: più lontano, meno certo. */
  maxConfidenceShare: { PROGRAM_3M: 0.9, PROGRAM_6M: 0.75, PROGRAM_12M: 0.6 },
  rationaleMax: 300,
} as const satisfies {
  key: string;
  version: string;
  approved: boolean;
  levelCeiling: Record<string, number>;
  defaultCeiling: number;
  maxMarginShare: Record<ProgramHorizon, number>;
  maxConfidenceShare: Record<ProgramHorizon, number>;
  rationaleMax: number;
};

export const POTENTIAL_HORIZONS: ProgramHorizon[] = [
  'PROGRAM_3M',
  'PROGRAM_6M',
  'PROGRAM_12M',
];

export type PotentialDriver = {
  areaId: string;
  name: string;
  /** R consolidata, nella scala della valutazione. */
  score: number;
  confidence: number;
  commitment: string | null;
  rationale: string;
  evidenceGaps: string[];
};

export type PotentialBounds = Record<
  ProgramHorizon,
  { maxValue: number; maxConfidence: number }
>;

export type PotentialGenerationInput = {
  basePrompt: string;
  promptVersionId: string | null;
  scale: { min: number; max: number };
  level: string | null;
  levelConfidence: number | null;
  daysPerWeek: number | null;
  drivers: PotentialDriver[];
};

export type GeneratedPotential = {
  areaId: string;
  horizon: ProgramHorizon;
  value: number;
  confidence: number;
  rationale: string;
};

export type PotentialGenerationResult = {
  provider: string;
  model: string;
  promptHash: string;
  criteria: string;
  scenarios: GeneratedPotential[];
  latencyMs: number;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Limiti per driver e orizzonte derivati dai criteri versionati. */
export function potentialBounds(
  input: Pick<PotentialGenerationInput, 'scale' | 'level' | 'levelConfidence'>,
  driver: Pick<PotentialDriver, 'score' | 'confidence'>,
): PotentialBounds {
  const c = POTENTIAL_CRITERIA;
  const span = input.scale.max - input.scale.min;
  const share =
    (input.level && c.levelCeiling[input.level]) || c.defaultCeiling;
  const ceiling = input.scale.min + span * share;
  const margin = Math.max(0, ceiling - driver.score);
  const confidence = Math.min(
    driver.confidence,
    input.levelConfidence ?? driver.confidence,
  );
  return Object.fromEntries(
    POTENTIAL_HORIZONS.map((h) => [
      h,
      {
        maxValue: round1(
          Math.min(
            input.scale.max,
            driver.score + margin * c.maxMarginShare[h],
          ),
        ),
        maxConfidence: Math.floor(confidence * c.maxConfidenceShare[h]),
      },
    ]),
  ) as PotentialBounds;
}

function formatRules(input: PotentialGenerationInput) {
  return [
    'FORMATO DI RISPOSTA (fisso): rispondi solo con JSON conforme allo schema.',
    `- scenarios: esattamente uno per ogni driver ricevuto e per ciascun orizzonte (${POTENTIAL_HORIZONS.join(', ')}), ${input.drivers.length * 3} in tutto, con lo stesso areaId.`,
    '- value: tra la R del driver e il maxValue del suo orizzonte, mai in calo da P3 a P6 a P12.',
    '- confidence: intero da 0 al maxConfidence dell’orizzonte, mai in crescita da P3 a P6 a P12.',
    `- rationale: massimo ${POTENTIAL_CRITERIA.rationaleMax} caratteri.`,
    'Questi limiti prevalgono sulle istruzioni sopra.',
  ].join('\n');
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['scenarios'],
  properties: {
    scenarios: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['areaId', 'horizon', 'value', 'confidence', 'rationale'],
        properties: {
          areaId: { type: 'string' },
          horizon: { type: 'string', enum: POTENTIAL_HORIZONS },
          value: { type: 'number' },
          confidence: { type: 'integer' },
          rationale: { type: 'string' },
        },
      },
    },
  },
};

export function buildPotentialPrompt(input: PotentialGenerationInput) {
  return {
    system: `${input.basePrompt.trim()}\n\n${formatRules(input)}`,
    user: {
      task: 'P3, P6 e P12 per ogni driver, entro i limiti indicati.',
      criteria: `${POTENTIAL_CRITERIA.key}@${POTENTIAL_CRITERIA.version}`,
      scale: input.scale,
      level: input.level,
      levelConfidence: input.levelConfidence,
      daysPerWeek: input.daysPerWeek,
      drivers: input.drivers.map((d) => ({
        ...d,
        bounds: potentialBounds(input, d),
      })),
    },
  };
}

export async function generatePotential(
  logger: Logger,
  input: PotentialGenerationInput,
): Promise<PotentialGenerationResult> {
  const startedAt = Date.now();
  const provider = resolveProvider();
  const model = resolveModel(provider);
  const prompt = buildPotentialPrompt(input);
  const inputJson = { promptVersionId: input.promptVersionId, prompt };
  let raw: unknown;
  if (provider === 'stub') {
    raw = stubPotential(input);
  } else {
    const result = await requestStructuredProposal(
      logger,
      provider,
      model,
      inputJson,
      { ...prompt, schema },
      'potential_scenarios',
    );
    try {
      raw = JSON.parse(result.outputText);
    } catch {
      raw = null;
    }
  }
  const problems: string[] = [];
  const scenarios = validatePotential(raw, input, problems);
  if (!scenarios) {
    logger.warn(
      `INVALID_POTENTIAL ${provider}/${model}: ${problems.join('; ')}`,
    );
    throw new BadGatewayException({
      code: 'INVALID_POTENTIAL',
      message: 'Non siamo riusciti a preparare i tuoi scenari. Riprova.',
    });
  }
  return {
    provider,
    model,
    promptHash: hashJson(inputJson),
    criteria: `${POTENTIAL_CRITERIA.key}@${POTENTIAL_CRITERIA.version}`,
    scenarios,
    latencyMs: Date.now() - startedAt,
  };
}

/** Stub deterministico: quattro quinti del limite, confidenza al massimo. */
export function stubPotential(input: PotentialGenerationInput) {
  return {
    scenarios: input.drivers.flatMap((d) => {
      const bounds = potentialBounds(input, d);
      return POTENTIAL_HORIZONS.map((horizon) => ({
        areaId: d.areaId,
        horizon,
        value: round1(d.score + (bounds[horizon].maxValue - d.score) * 0.8),
        confidence: bounds[horizon].maxConfidence,
        rationale: `Stima di ${d.name.toLowerCase()} con il tuo impegno attuale.`,
      }));
    }),
  };
}

/**
 * Contratto rigido: uno scenario per driver e orizzonte, P fra R e il limite
 * dei criteri, mai in calo con l'orizzonte, confidenza entro il limite e mai
 * in crescita, motivazione breve. Un output fuori criteri non arriva
 * all'atleta.
 */
export function validatePotential(
  raw: unknown,
  input: PotentialGenerationInput,
  problems: string[] = [],
): GeneratedPotential[] | null {
  const items = (raw as { scenarios?: unknown } | null)?.scenarios;
  if (!Array.isArray(items)) {
    problems.push('scenarios mancanti');
    return null;
  }
  const drivers = new Map(input.drivers.map((d) => [d.areaId, d]));
  const byKey = new Map<string, GeneratedPotential>();
  for (const item of items) {
    const e = item as Partial<Record<string, unknown>>;
    const areaId = typeof e?.areaId === 'string' ? e.areaId : '';
    const horizon = POTENTIAL_HORIZONS.find((h) => h === e?.horizon);
    const key = `${areaId}:${horizon}`;
    if (!drivers.has(areaId) || !horizon || byKey.has(key)) {
      problems.push(`scenario inatteso o ripetuto: ${key}`);
      continue;
    }
    const rationale = typeof e.rationale === 'string' ? e.rationale.trim() : '';
    if (!rationale || rationale.length > POTENTIAL_CRITERIA.rationaleMax)
      problems.push(`motivazione non valida: ${key}`);
    const value = e.value;
    const confidence = e.confidence;
    if (typeof value !== 'number' || !Number.isFinite(value))
      problems.push(`valore non valido: ${key}`);
    if (
      typeof confidence !== 'number' ||
      !Number.isInteger(confidence) ||
      confidence < 0
    )
      problems.push(`confidenza non valida: ${key}`);
    byKey.set(key, {
      areaId,
      horizon,
      value: round1(Number(value)),
      confidence: Number(confidence),
      rationale,
    });
  }
  for (const driver of input.drivers) {
    const bounds = potentialBounds(input, driver);
    const own = POTENTIAL_HORIZONS.map((h) =>
      byKey.get(`${driver.areaId}:${h}`),
    );
    if (own.some((s) => !s)) {
      problems.push(`scenari mancanti per ${driver.areaId}`);
      continue;
    }
    own.forEach((s, k) => {
      const h = POTENTIAL_HORIZONS[k];
      if (s!.value < round1(driver.score) || s!.value > bounds[h].maxValue)
        problems.push(`valore fuori criteri: ${driver.areaId}:${h}`);
      if (s!.confidence > bounds[h].maxConfidence)
        problems.push(`confidenza fuori criteri: ${driver.areaId}:${h}`);
      if (k > 0 && s!.value < own[k - 1]!.value)
        problems.push(`potenziale in calo: ${driver.areaId}:${h}`);
      if (k > 0 && s!.confidence > own[k - 1]!.confidence)
        problems.push(`confidenza in crescita: ${driver.areaId}:${h}`);
    });
  }
  return problems.length ? null : [...byKey.values()];
}
