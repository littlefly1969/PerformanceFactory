import { ConfidenceRule, checkRule } from './confidence-policy';

/**
 * Regole della calibrazione gratuita (Blueprint A4.3, A4.6, A2.2), senza I/O.
 * La soglia di consolidamento è la regola versionata R_CONSOLIDATION; i
 * parametri dei round arrivano da CalibrationConfig. A4-D01 è ancora aperto.
 */
export type CalibrationStatus =
  | 'FREE_CALIBRATING'
  | 'FREE_LEVEL_ESTIMATED'
  /** Posto assegnato alla lezione gratuita: solo informativo, non blocca il consolidamento. */
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
  levelConfidenceThreshold: number;
  /** Durata indicativa della fase gratuita: non chiude né consolida R. */
  maxDays: number;
  /** Decisione 13 aperta: il Blueprint (A4.6) non dà programmi prima del paywall. */
  programBeforePaywall: boolean;
};

export const DEFAULT_CALIBRATION_SETTINGS: CalibrationSettings = {
  levelConfidenceThreshold: 50,
  maxDays: 30,
  programBeforePaywall: false,
};

export type EvaluatedDriver = {
  areaId: string;
  confidence: number;
};

export type EvaluationConfidence = {
  overallConfidence: number;
  levelConfidence: number | null;
  drivers: EvaluatedDriver[];
};

/**
 * Come la lezione gratuita pesa sul consolidamento di R. `pending`: posto
 * richiesto o assegnato, o feedback del coach da valutare. `available`: la
 * lezione si può ancora fare (flag attivo, regola di eleggibilità
 * soddisfatta, un circolo che la offre, nessun posto già usato o ritirato,
 * nessuna rinuncia). Finché l'una o l'altra vale, è la lezione a chiudere R e
 * P e il paywall arriva dopo; senza lezione possibile basta la regola.
 */
export type LessonGate = { pending: boolean; available: boolean };

export const NO_LESSON: LessonGate = { pending: false, available: false };

const DAY_MS = 24 * 60 * 60 * 1000;

export const dayOf = (startedAt: Date, now: Date) =>
  Math.max(1, Math.floor((now.getTime() - startedAt.getTime()) / DAY_MS) + 1);

/**
 * Driver in focus per il prossimo passo: quelli sotto la soglia per area
 * della regola di consolidamento, dal meno affidabile. Se la regola manca solo
 * per la confidence complessiva (o non ha soglia per area) sono in focus tutti.
 * Quanti e quali approfondire lo decide l'AI (§4.2); regola soddisfatta:
 * nessun driver.
 */
export function focusDrivers<T extends EvaluatedDriver>(
  evaluation: { overallConfidence: number; drivers: T[] },
  rule: ConfidenceRule,
): T[] {
  const check = checkRule(rule, evaluation);
  if (check.met) return [];
  const byConfidence = [...evaluation.drivers].sort(
    (a, b) => a.confidence - b.confidence,
  );
  const below = byConfidence.filter((d) => check.belowAreas.includes(d.areaId));
  return below.length ? below : byConfidence;
}

/**
 * Stato dopo una valutazione. La calibrazione si chiude e R si consolida solo
 * quando la regola di consolidamento in vigore è soddisfatta e la lezione
 * gratuita non la trattiene: con una lezione in attesa o ancora possibile (a
 * livello stimato) è il feedback del coach a chiudere R e P. Tempo trascorso
 * e numero di round non contano (PF-FS-PREPAYWALL §6.4, §7.2). Il livello
 * stimato segue la sua soglia di back office.
 */
export function statusAfterEvaluation(
  current: CalibrationStatus,
  evaluation: EvaluationConfidence,
  settings: CalibrationSettings,
  rule: ConfidenceRule,
  lesson: LessonGate = NO_LESSON,
): {
  status: CalibrationStatus;
  completionReason?: 'CONFIDENCE_REACHED';
  levelEstimated: boolean;
} {
  if (isCalibrationClosed(current))
    return { status: current, levelEstimated: false };
  const levelEstimated =
    current === 'FREE_CALIBRATING' &&
    (evaluation.levelConfidence ?? 0) >= settings.levelConfidenceThreshold;
  const held =
    lesson.pending ||
    (lesson.available && (current !== 'FREE_CALIBRATING' || levelEstimated));
  if (checkRule(rule, evaluation).met && !held)
    return {
      status: 'CALIBRATION_COMPLETED',
      completionReason: 'CONFIDENCE_REACHED',
      levelEstimated,
    };
  return {
    status: openStatus(current, levelEstimated, lesson.pending),
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

/** Parametri coerenti: soglia del livello in 1-100, durata positiva. */
export function settingsProblems(s: CalibrationSettings) {
  const problems: string[] = [];
  if (s.levelConfidenceThreshold < 1 || s.levelConfidenceThreshold > 100)
    problems.push('La soglia del livello va da 1 a 100');
  if (s.maxDays < 1) problems.push('La durata deve essere positiva');
  return problems;
}
