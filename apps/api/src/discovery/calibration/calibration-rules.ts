import {
  DEFAULT_UNSAFE_MICRO_TEST_TERMS,
  unsafeTermsProblems,
} from '../../ai-orchestrator/micro-test-safety';
import { ConfidenceRule, checkRule } from './confidence-policy';

/**
 * Regole della calibrazione gratuita (Blueprint A4.3, A4.6, A2.2), senza I/O.
 * La soglia di consolidamento è la regola versionata R_CONSOLIDATION; i
 * parametri dei round arrivano da CalibrationConfig. A4-D01 è ancora aperto.
 */
export type CalibrationStatus =
  | 'FREE_CALIBRATING'
  | 'FREE_LEVEL_ESTIMATED'
  /** Lezione richiesta o assegnata: la calibrazione resta aperta fino al feedback del coach. */
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
  /** Durata della fase gratuita: alla scadenza la calibrazione si chiude comunque. */
  maxDays: number;
  /** Decisione 13 aperta: il Blueprint (A4.6) non dà programmi prima del paywall. */
  programBeforePaywall: boolean;
  /**
   * Indicazione al motore: una micro-prova ogni N domande. L'AI ne tiene conto
   * ma decide passo per passo; 0 significa nessuna indicazione.
   */
  questionsPerMicroTest: number;
  /** Domande conoscitive iniziali per driver, scritte dall'AI dopo la classifica FIT. */
  initialQuestionsPerArea: number;
  /** Parole o frasi vietate nei micro-test generati dall'AI. */
  unsafeMicroTestTerms: string[];
  /** Parole o frasi vietate negli allenamenti generati dall'AI; vuota = nessun controllo. */
  unsafeTrainingTerms: string[];
};

export const DEFAULT_CALIBRATION_SETTINGS: CalibrationSettings = {
  levelConfidenceThreshold: 50,
  maxDays: 30,
  programBeforePaywall: false,
  questionsPerMicroTest: 0,
  initialQuestionsPerArea: 2,
  unsafeMicroTestTerms: DEFAULT_UNSAFE_MICRO_TEST_TERMS,
  unsafeTrainingTerms: [],
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
 * Come la lezione gratuita pesa sulla chiusura della calibrazione. `pending`:
 * posto richiesto o assegnato, o feedback del coach da valutare. `available`:
 * la lezione si può ancora fare (flag attivo, regola di eleggibilità
 * soddisfatta, un circolo che la offre, nessun posto già usato o ritirato,
 * nessuna rinuncia). `done`: il feedback del coach è entrato in una
 * valutazione. Solo la lezione svolta chiude da sola la calibrazione, insieme
 * a R consolidata; altrimenti la chiude l'atleta o la scadenza.
 */
export type LessonGate = {
  pending: boolean;
  available: boolean;
  done: boolean;
};

export const NO_LESSON: LessonGate = {
  pending: false,
  available: false,
  done: false,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const dayOf = (startedAt: Date, now: Date) =>
  Math.max(1, Math.floor((now.getTime() - startedAt.getTime()) / DAY_MS) + 1);

/**
 * Driver in focus per il prossimo passo: quelli sotto la soglia per area
 * della regola di consolidamento, dal meno affidabile. Se la regola manca solo
 * per la confidence complessiva (o non ha soglia per area) sono in focus tutti.
 * Con la regola soddisfatta la calibrazione resta aperta e si approfondisce
 * ancora: sono in focus tutti, dal meno affidabile. Quanti e quali approfondire
 * lo decide l'AI (§4.2).
 */
export function focusDrivers<T extends EvaluatedDriver>(
  evaluation: { overallConfidence: number; drivers: T[] },
  rule: ConfidenceRule,
): T[] {
  const check = checkRule(rule, evaluation);
  const byConfidence = [...evaluation.drivers].sort(
    (a, b) => a.confidence - b.confidence,
  );
  if (check.met) return byConfidence;
  const below = byConfidence.filter((d) => check.belowAreas.includes(d.areaId));
  return below.length ? below : byConfidence;
}

/**
 * Stato dopo una valutazione. R è consolidata quando la regola di
 * consolidamento in vigore è soddisfatta, ma la calibrazione resta aperta:
 * l'atleta può continuare a rispondere. Si chiude da sola solo con la lezione
 * gratuita svolta (feedback del coach valutato) e R consolidata; senza lezione
 * la chiude l'atleta quando sceglie gli scenari (`finishProblem`), oppure la
 * scadenza. Il livello stimato segue la sua soglia di back office.
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
  if (checkRule(rule, evaluation).met && lesson.done && !lesson.pending)
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

/**
 * Perché l'atleta non può ancora chiudere la calibrazione e andare agli
 * scenari: R non consolidata, lezione in attesa del feedback del coach,
 * lezione disponibile da richiedere o rifiutare. Null se può.
 */
export function finishProblem(ruleMet: boolean, lesson: LessonGate) {
  if (!ruleMet) return 'CALIBRATION_NOT_READY' as const;
  if (lesson.pending) return 'CALIBRATION_WAITING_LESSON' as const;
  if (lesson.available) return 'CALIBRATION_LESSON_CHOICE' as const;
  return null;
}

/** Scadenza della fase gratuita raggiunta: la calibrazione si chiude comunque. */
export const deadlineReached = (deadlineAt: Date, now: Date) =>
  deadlineAt.getTime() <= now.getTime();

/** Giorni interi che mancano alla scadenza, zero se è passata. */
export const daysLeft = (deadlineAt: Date, now: Date) =>
  Math.max(0, Math.ceil((deadlineAt.getTime() - now.getTime()) / DAY_MS));

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
  if (s.questionsPerMicroTest < 0 || s.questionsPerMicroTest > 50)
    problems.push('Le domande per micro-prova vanno da 0 a 50');
  if (s.initialQuestionsPerArea < 1 || s.initialQuestionsPerArea > 4)
    problems.push('Le domande iniziali per driver vanno da 1 a 4');
  if (!s.unsafeMicroTestTerms.length)
    problems.push('Serve almeno una parola vietata nei micro-test');
  problems.push(...unsafeTermsProblems(s.unsafeMicroTestTerms));
  problems.push(
    ...unsafeTermsProblems(s.unsafeTrainingTerms, 'negli allenamenti'),
  );
  return problems;
}
