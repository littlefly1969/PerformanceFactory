/**
 * Stati di engagement (PF-FS-PREPAYWALL §8.2). Contano solo il tempo dalla
 * ultima interazione significativa: nessuna cadenza imposta all'atleta.
 */
export const ENGAGEMENT_STATES = [
  'ACTIVE_RECENT',
  'SLEEPY',
  'DORMANT',
  'REACTIVATED',
] as const;
export type EngagementState = (typeof ENGAGEMENT_STATES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
/** Oltre 7 × 24 ore di inattività: sonnolente. */
export const SLEEPY_AFTER_MS = 7 * DAY_MS;
/** Al compimento di 10 × 24 ore: dormiente (soglia inclusa, §8.2). */
export const DORMANT_AFTER_MS = 10 * DAY_MS;

/** Fasce di inattività: ACTIVE fino a 7 giorni, SLEEPY oltre, DORMANT a 10. */
export function inactivityBand(lastMeaningfulAt: Date, now: Date) {
  const idle = now.getTime() - lastMeaningfulAt.getTime();
  if (idle >= DORMANT_AFTER_MS) return 'DORMANT' as const;
  if (idle > SLEEPY_AFTER_MS) return 'SLEEPY' as const;
  return 'ACTIVE' as const;
}

/** Limiti temporali usati dal job per selezionare le transizioni. */
export function thresholds(now: Date) {
  return {
    sleepyBefore: new Date(now.getTime() - SLEEPY_AFTER_MS),
    dormantAtOrBefore: new Date(now.getTime() - DORMANT_AFTER_MS),
  };
}

/**
 * Fonti di un'interazione significativa (§8.3): risposte che aggiungono
 * evidenza reale. Login, refresh, aperture e salti di un micro-test non
 * compaiono qui e non azzerano mai l'inattività (AT-24).
 */
export const MEANINGFUL_SOURCES = [
  'ASSESSMENT_ANSWER',
  'ASSESSMENT_SUBMITTED',
  'CALIBRATION_ROUND',
  'COACH_FEEDBACK',
] as const;
export type MeaningfulSource = (typeof MEANINGFUL_SOURCES)[number];
