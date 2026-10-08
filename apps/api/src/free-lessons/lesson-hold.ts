import { Prisma } from '@prisma/client';
import { isLessonPending } from '../discovery/calibration/lesson-evidence';

/**
 * Posto assegnato: la calibrazione passa a FREE_LESSON_VALIDATION e R non si
 * chiude per soglia finché il coach non ha dato il suo feedback. Va chiamata
 * con la riga della calibrazione sotto lock.
 */
export function holdCalibration(tx: Prisma.TransactionClient, userId: string) {
  return tx.athleteCalibration.updateMany({
    where: { userId, status: 'FREE_LEVEL_ESTIMATED' },
    data: { status: 'FREE_LESSON_VALIDATION' },
  });
}

/**
 * Il posto non è più in attesa (rilasciato, annullato, assenza): si torna al
 * livello stimato, salvo che resti feedback del coach da valutare. Va
 * chiamata con la riga della calibrazione sotto lock.
 */
export async function releaseCalibration(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  if (await isLessonPending(tx, userId)) return;
  await tx.athleteCalibration.updateMany({
    where: { userId, status: 'FREE_LESSON_VALIDATION' },
    data: { status: 'FREE_LEVEL_ESTIMATED' },
  });
}

/** Lock della lezione: capienza e stato dei posti si decidono uno alla volta. */
export async function lockLesson(
  tx: Prisma.TransactionClient,
  lessonId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`free-lesson:${lessonId}`}))`;
}
