/**
 * Regole della calibrazione gratuita (Blueprint A4.3, A4.6, A2.2), senza I/O.
 * I valori soglia arrivano da CalibrationConfig: A4-D01 è ancora aperto.
 */
export type CalibrationStatus =
  | 'FREE_CALIBRATING'
  | 'FREE_LEVEL_ESTIMATED'
  | 'CALIBRATION_COMPLETED';

export type CalibrationSettings = {
  confidenceThreshold: number;
  levelConfidenceThreshold: number;
  maxDays: number;
  closingDay: number;
  questionsPerDriver: number;
  driversPerRound: number;
  minHoursBetweenRounds: number;
};

export const DEFAULT_CALIBRATION_SETTINGS: CalibrationSettings = {
  confidenceThreshold: 70,
  levelConfidenceThreshold: 50,
  maxDays: 30,
  closingDay: 25,
  questionsPerDriver: 2,
  driversPerRound: 2,
  minHoursBetweenRounds: 20,
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
 */
export function statusAfterEvaluation(
  current: CalibrationStatus,
  evaluation: { levelConfidence: number | null; drivers: EvaluatedDriver[] },
  settings: CalibrationSettings,
  roundKind: 'INITIAL' | 'ADAPTIVE' | 'CLOSING',
): {
  status: CalibrationStatus;
  completionReason?: 'CONFIDENCE_REACHED' | 'CLOSING_ASSESSMENT';
  levelEstimated: boolean;
} {
  if (current === 'CALIBRATION_COMPLETED')
    return { status: current, levelEstimated: false };
  const levelEstimated =
    current === 'FREE_CALIBRATING' &&
    (evaluation.levelConfidence ?? 0) >= settings.levelConfidenceThreshold;
  const reached =
    evaluation.drivers.length > 0 &&
    evaluation.drivers.every(
      (d) => d.confidence >= settings.confidenceThreshold,
    );
  if (reached)
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
    status: levelEstimated ? 'FREE_LEVEL_ESTIMATED' : current,
    levelEstimated,
  };
}

/** Parametri coerenti: chiusura prima della scadenza, soglie in 0-100. */
export function settingsProblems(s: CalibrationSettings) {
  const problems: string[] = [];
  if (s.closingDay > s.maxDays)
    problems.push('Il giorno di chiusura non può superare la durata massima');
  return problems;
}
