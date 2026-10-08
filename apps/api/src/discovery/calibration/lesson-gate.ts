import { Prisma } from '@prisma/client';
import { isFeatureEnabled } from '../../features/feature-flags';
import { PrismaService } from '../../prisma/prisma.service';
import { completeCalibration } from './calibration-completion';
import {
  LessonGate,
  NO_LESSON,
  isCalibrationClosed,
} from './calibration-rules';
import { checkRule, loadActivePolicy } from './confidence-policy';
import { isLessonPending } from './lesson-evidence';

type Db = PrismaService | Prisma.TransactionClient;

/** Flag `free_lesson` per l'atleta, letto senza il servizio dei flag. */
export async function freeLessonEnabledFor(db: Db, userId: string) {
  const [flag, user] = await Promise.all([
    db.featureFlag.findUnique({ where: { key: 'free_lesson' } }),
    db.user.findUnique({
      where: { id: userId },
      select: { id: true, isBetaTester: true },
    }),
  ]);
  if (!flag || !user) return false;
  return isFeatureEnabled(flag, {
    userId: user.id,
    isBetaTester: user.isBetaTester,
  });
}

/** Il territorio offre la lezione: almeno un circolo attivo che la eroga. */
export const lessonClubs = (db: Db) =>
  db.partner.findMany({
    where: { isActive: true, freeLessonsEnabled: true },
    select: { id: true, name: true, city: true },
    orderBy: { name: 'asc' },
  });

/**
 * Stato della lezione per il consolidamento di R sulla valutazione indicata
 * (vedi `LessonGate`).
 */
export async function lessonGate(
  db: Db,
  userId: string,
  evaluation: Parameters<typeof checkRule>[1],
): Promise<LessonGate> {
  if (await isLessonPending(db, userId))
    return { pending: true, available: false };
  if (!(await freeLessonEnabledFor(db, userId))) return NO_LESSON;
  const [calibration, seat, clubs, rule] = await Promise.all([
    db.athleteCalibration.findUnique({
      where: { userId },
      select: { lessonDeclinedAt: true },
    }),
    db.freeLessonSeat.findUnique({
      where: { userId },
      select: { status: true },
    }),
    lessonClubs(db),
    loadActivePolicy(db, 'LESSON_ELIGIBILITY'),
  ]);
  const available =
    !calibration?.lessonDeclinedAt &&
    !seat &&
    clubs.length > 0 &&
    checkRule(rule, evaluation).met;
  return { pending: false, available };
}

/**
 * Riesamina la calibrazione aperta sull'ultima valutazione quando cambia solo
 * la lezione (rinuncia, ritiro, round richiesto a regola già soddisfatta):
 * se la regola di consolidamento è soddisfatta e la lezione non trattiene R,
 * chiude e consolida. Restituisce lo stato della lezione e se ha chiuso. Va
 * chiamata con la riga della calibrazione sotto lock.
 */
export async function settleCalibration(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
) {
  const [calibration, latest, policy] = await Promise.all([
    tx.athleteCalibration.findUnique({
      where: { userId },
      select: { status: true },
    }),
    tx.assessmentEvaluation.findFirst({
      where: { userId },
      orderBy: { sequence: 'desc' },
      select: {
        overallConfidence: true,
        areas: { select: { areaId: true, confidence: true } },
      },
    }),
    loadActivePolicy(tx, 'R_CONSOLIDATION'),
  ]);
  if (!calibration || !latest || isCalibrationClosed(calibration.status))
    return { gate: NO_LESSON, completed: false };
  const evaluation = {
    overallConfidence: latest.overallConfidence,
    drivers: latest.areas,
  };
  const gate = await lessonGate(tx, userId, evaluation);
  const held =
    gate.pending ||
    (gate.available && calibration.status !== 'FREE_CALIBRATING');
  if (held || !checkRule(policy, evaluation).met)
    return { gate, completed: false };
  await completeCalibration(tx, userId, 'CONFIDENCE_REACHED', now, policy.id);
  return { gate, completed: true };
}
