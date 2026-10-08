import { ProgramHorizon } from '@prisma/client';

/**
 * Motore del potenziale P3/P6/P12 (Blueprint A3.9, A4.4). L'interfaccia è
 * unica: il motore definitivo della Parte C sostituirà quello provvisorio
 * senza toccare servizio, API e interfaccia. Ogni scenario salva motore e
 * versione, quindi i calcoli dei due motori restano distinguibili.
 */
export type PotentialDriverInput = {
  areaId: string;
  /** R consolidata del driver, nella scala della valutazione. */
  score: number;
  confidence: number;
  commitment: string | null;
};

export type PotentialInput = {
  scale: { min: number; max: number };
  level: string | null;
  levelConfidence: number | null;
  /** Giorni a settimana dichiarati nell'assessment; null se mancano. */
  daysPerWeek: number | null;
  drivers: PotentialDriverInput[];
};

export type PotentialScenarioOutput = {
  horizon: ProgramHorizon;
  areaId: string;
  current: number;
  value: number;
  confidence: number;
  assumptions: Record<string, string | number | boolean | null>;
};

export interface PotentialEngine {
  readonly key: string;
  readonly version: string;
  /** true finché non è il motore approvato della Parte C. */
  readonly provisional: boolean;
  compute(input: PotentialInput): PotentialScenarioOutput[];
}

export const HORIZON_MONTHS: Record<ProgramHorizon, number> = {
  PROGRAM_3M: 3,
  PROGRAM_6M: 6,
  PROGRAM_12M: 12,
};

const HORIZONS = Object.keys(HORIZON_MONTHS) as ProgramHorizon[];

/** Tetto raggiungibile per livello, in percentuale della scala. */
const LEVEL_CEILING: Record<string, number> = {
  BEGINNER: 0.7,
  INTERMEDIATE: 0.8,
  ADVANCED: 0.88,
  COMPETITIVE: 0.94,
  PRO: 0.98,
};
const DEFAULT_CEILING = 0.8;

/** Quota mensile del margine verso il tetto colmata con commitment medio. */
const BASE_MONTHLY_RATE = 0.1;
const COMMITMENT_FACTOR: Record<string, number> = {
  LOW: 0.5,
  MEDIUM: 1,
  HIGH: 1.4,
  UNKNOWN: 0.8,
};
/** Più l'orizzonte è lontano, meno la stima è affidabile. */
const HORIZON_CONFIDENCE: Record<ProgramHorizon, number> = {
  PROGRAM_3M: 0.9,
  PROGRAM_6M: 0.75,
  PROGRAM_12M: 0.6,
};

function availabilityFactor(daysPerWeek: number | null) {
  if (daysPerWeek === null) return 0.85;
  if (daysPerWeek <= 1) return 0.6;
  if (daysPerWeek === 2) return 0.85;
  if (daysPerWeek === 3) return 1;
  return 1.15;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Motore provvisorio, da approvare: niente crescita lineare. Ogni mese colma
 * una quota del margine tra R e il tetto del livello, quindi la curva rallenta
 * e si appiattisce (plateau). La quota dipende da commitment e disponibilità.
 * Chi è già al tetto resta dov'è: nessun valore inventato.
 *
 *   P(h) = R + (tetto - R) · (1 - (1 - quota)^h)
 *   quota = 0,10 · commitment · disponibilità (massimo 0,5)
 *   confidence(h) = min(confidence driver, confidence livello) · fattore orizzonte
 */
export const provisionalPotentialEngine: PotentialEngine = {
  key: 'provisional-plateau',
  version: '1',
  provisional: true,
  compute(input) {
    const span = input.scale.max - input.scale.min;
    const ceilingShare =
      (input.level && LEVEL_CEILING[input.level]) || DEFAULT_CEILING;
    const ceiling = input.scale.min + span * ceilingShare;
    const availability = availabilityFactor(input.daysPerWeek);
    return input.drivers.flatMap((driver) => {
      const commitment = driver.commitment ?? 'UNKNOWN';
      const rate = Math.min(
        0.5,
        BASE_MONTHLY_RATE *
          (COMMITMENT_FACTOR[commitment] ?? 0.8) *
          availability,
      );
      const margin = Math.max(0, ceiling - driver.score);
      const baseConfidence = Math.min(
        driver.confidence,
        input.levelConfidence ?? driver.confidence,
      );
      return HORIZONS.map((horizon) => {
        const months = HORIZON_MONTHS[horizon];
        const value = driver.score + margin * (1 - (1 - rate) ** months);
        return {
          horizon,
          areaId: driver.areaId,
          current: driver.score,
          value: round1(Math.min(input.scale.max, value)),
          confidence: Math.round(baseConfidence * HORIZON_CONFIDENCE[horizon]),
          assumptions: {
            months,
            level: input.level,
            ceiling: round1(ceiling),
            commitment,
            daysPerWeek: input.daysPerWeek,
            monthlyRate: Math.round(rate * 1000) / 1000,
            plateau: margin === 0,
          },
        };
      });
    });
  },
};

/** Motore in uso: cambiarlo qui (o con la Parte C) non tocca il resto. */
export const ACTIVE_POTENTIAL_ENGINE: PotentialEngine =
  provisionalPotentialEngine;
