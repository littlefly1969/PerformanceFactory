/**
 * Regole della calibrazione gratuita (Blueprint A4.3, A4.6, A2.2), senza I/O.
 * I valori soglia arrivano da CalibrationConfig: A4-D01 è ancora aperto.
 */
export type CalibrationStatus =
  | 'FREE_CALIBRATING'
  | 'FREE_LEVEL_ESTIMATED'
  /** Posto assegnato alla lezione gratuita: R resta aperta fino al feedback del coach (A4.8). */
  | 'FREE_LESSON_VALIDATION'
  | 'CALIBRATION_COMPLETED'
  /** Orizzonte scelto dopo il reveal di P3/P6/P12: pronto per l'offerta. */
  | 'PAYWALL_READY';

/** Stati in cui la calibrazione è chiusa: niente più round né rivalutazioni. */
export const CLOSED_CALIBRATION_STATUSES = [
  'CALIBRATION_COMPLETED',
  'PAYWALL_READY',
] as const;

export const isCalibrationClosed = (status: string) =>
  (CLOSED_CALIBRATION_STATUSES as readonly string[]).includes(status);

export type CalibrationSettings = {
  confidenceThreshold: number;
  levelConfidenceThreshold: number;
  maxDays: number;
  closingDay: number;
  questionsPerDriver: number;
  driversPerRound: number;
  minHoursBetweenRounds: number;
  /** Decisione 13 aperta: il Blueprint (A4.6) non dà programmi prima del paywall. */
  programBeforePaywall: boolean;
};

export const DEFAULT_CALIBRATION_SETTINGS: CalibrationSettings = {
  confidenceThreshold: 70,
  levelConfidenceThreshold: 50,
  maxDays: 30,
  closingDay: 25,
  questionsPerDriver: 2,
  driversPerRound: 2,
  minHoursBetweenRounds: 20,
  programBeforePaywall: false,
};

export type EvaluatedDriver = {
  areaId: string;
  confidence: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const dayOf = (startedAt: Date, now: Date) =>
  Math.max(1, Math.floor((now.getTime() - startedAt.getTime()) / DAY_MS) + 1);

/** Dal giorno di chiusura in poi il prossimo round è l'assessment di chiusura. */
export function nextRoundKind(
  startedAt: Date,
  now: Date,
  settings: CalibrationSettings,
): 'ADAPTIVE' | 'CLOSING' {
  return dayOf(startedAt, now) >= settings.closingDay ? 'CLOSING' : 'ADAPTIVE';
}

/**
 * Driver da approfondire: sotto soglia, dal meno affidabile. Il round normale
 * ne prende pochi; quello di chiusura tutti quelli ancora sotto soglia.
 */
export function roundTargets<T extends EvaluatedDriver>(
  drivers: T[],
  kind: 'ADAPTIVE' | 'CLOSING',
  settings: CalibrationSettings,
): T[] {
  const below = drivers
    .filter((d) => d.confidence < settings.confidenceThreshold)
    .sort((a, b) => a.confidence - b.confidence);
  return kind === 'CLOSING' ? below : below.slice(0, settings.driversPerRound);
}

/** Momento dal quale si può aprire il prossimo round. */
export function nextRoundAt(
  lastRoundAt: Date | null,
  settings: CalibrationSettings,
) {
  return lastRoundAt
    ? new Date(
        lastRoundAt.getTime() + settings.minHoursBetweenRounds * 60 * 60 * 1000,
      )
    : null;
}

/**
 * Stato dopo una valutazione. Si chiude quando tutti i driver raggiungono la
 * soglia, oppure con l'assessment di chiusura anche se la soglia manca: in
 * quel caso R resta con la sua confidence reale, nessun valore viene inventato.
 * Con la lezione gratuita in attesa (posto assegnato o feedback del coach non
 * ancora valutato) la soglia non chiude: il coach deve poter pesare su R.
 * L'assessment di chiusura e la scadenza restano il tetto.
 */
export function statusAfterEvaluation(
  current: CalibrationStatus,
  evaluation: { levelConfidence: number | null; drivers: EvaluatedDriver[] },
  settings: CalibrationSettings,
  roundKind: 'INITIAL' | 'ADAPTIVE' | 'CLOSING',
  lessonPending = false,
): {
  status: CalibrationStatus;
  completionReason?: 'CONFIDENCE_REACHED' | 'CLOSING_ASSESSMENT';
  levelEstimated: boolean;
} {
  if (isCalibrationClosed(current))
    return { status: current, levelEstimated: false };
  const levelEstimated =
    current === 'FREE_CALIBRATING' &&
    (evaluation.levelConfidence ?? 0) >= settings.levelConfidenceThreshold;
  const reached =
    evaluation.drivers.length > 0 &&
    evaluation.drivers.every(
      (d) => d.confidence >= settings.confidenceThreshold,
    );
  if (reached && !lessonPending)
    return {
      status: 'CALIBRATION_COMPLETED',
      completionReason: 'CONFIDENCE_REACHED',
      levelEstimated,
    };
  if (roundKind === 'CLOSING')
    return {
      status: 'CALIBRATION_COMPLETED',
      completionReason: 'CLOSING_ASSESSMENT',
      levelEstimated,
    };
  return {
    status: openStatus(current, levelEstimated, lessonPending),
    levelEstimated,
  };
}

/** Stato aperto: la validazione della lezione prevale, poi il livello stimato. */
export function openStatus(
  current: CalibrationStatus,
  levelEstimated: boolean,
  lessonPending: boolean,
): CalibrationStatus {
  if (lessonPending) return 'FREE_LESSON_VALIDATION';
  if (levelEstimated || current === 'FREE_LESSON_VALIDATION')
    return 'FREE_LEVEL_ESTIMATED';
  return current;
}

/** Parametri coerenti: chiusura prima della scadenza, soglie in 0-100. */
export function settingsProblems(s: CalibrationSettings) {
  const problems: string[] = [];
  if (s.closingDay > s.maxDays)
    problems.push('Il giorno di chiusura non può superare la durata massima');
  return problems;
}
