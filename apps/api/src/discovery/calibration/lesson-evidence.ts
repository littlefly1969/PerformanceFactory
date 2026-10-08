import { Prisma } from '@prisma/client';
import { AssessmentEvaluationInput } from '../../ai-orchestrator/assessment-evaluation-model';
import { PrismaService } from '../../prisma/prisma.service';

type Db = Pick<
  PrismaService,
  'freeLessonSeat' | 'coachLessonFeedback' | 'microTestCompletion'
>;

/**
 * Stati in cui la calibrazione è ancora aperta: tutto il resto (completata,
 * pronta per il paywall) ha R chiusa e non accetta più evidenze.
 */
export const OPEN_CALIBRATION_STATUSES = [
  'FREE_CALIBRATING',
  'FREE_LEVEL_ESTIMATED',
  'FREE_LESSON_VALIDATION',
] as const;

export const isCalibrationOpen = (status: string | null | undefined) =>
  !!status && (OPEN_CALIBRATION_STATUSES as readonly string[]).includes(status);

/** Scala del feedback del coach: 1-5 rispetto a un amatore dello stesso sport. */
export const COACH_RATINGS = [
  { value: 1, label: 'Base' },
  { value: 2, label: 'In sviluppo' },
  { value: 3, label: 'Solido' },
  { value: 4, label: 'Avanzato' },
  { value: 5, label: 'Eccellente' },
] as const;

/** Voto 1-5 portato nella scala della valutazione, estremi inclusi. */
export function ratingScore(
  rating: number,
  scale: { minScore: number; maxScore: number },
) {
  const step = (scale.maxScore - scale.minScore) / (COACH_RATINGS.length - 1);
  return Math.round((scale.minScore + (rating - 1) * step) * 10) / 10;
}

/**
 * Serializza le operazioni sullo stato della calibrazione dell'atleta: chiusura
 * dopo una valutazione, assegnazione e rilascio del posto alla lezione.
 */
export async function lockCalibration(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  await tx.$queryRaw`SELECT 1 FROM "AthleteCalibration" WHERE "userId" = ${userId} FOR UPDATE`;
}

/**
 * La lezione è in attesa finché il posto è richiesto o assegnato, o il
 * feedback del coach non è ancora entrato in una valutazione: in quel tempo R
 * non si consolida e il paywall resta chiuso, perché è la lezione a chiudere
 * R e P con affidabilità (A4.8, «R_NOT_FINAL»).
 */
export async function isLessonPending(db: Db, userId: string) {
  const [seats, unevaluated] = await Promise.all([
    db.freeLessonSeat.count({
      where: { userId, status: { in: ['REQUESTED', 'ASSIGNED'] } },
    }),
    db.coachLessonFeedback.count({ where: { userId, evaluationId: null } }),
  ]);
  return seats + unevaluated > 0;
}

/**
 * Aggiunge all'input della valutazione gli esiti dei micro-test e il feedback
 * del coach, ciascuno con la sua fonte: le risposte dell'atleta restano come
 * sono. Restituisce il feedback incluso, da collegare alla valutazione.
 */
export async function addLessonEvidence(
  db: Db,
  userId: string,
  input: AssessmentEvaluationInput,
) {
  const [tests, feedback] = await Promise.all([
    db.microTestCompletion.findMany({
      where: { userId },
      orderBy: { completedAt: 'asc' },
      include: { microTest: true },
    }),
    db.coachLessonFeedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  for (const done of tests) {
    const driver = input.drivers.find(
      (d) => d.areaId === done.microTest.areaId,
    );
    const options = done.microTest.optionsJson as Array<{
      value: string;
      label: string;
      score: number;
    }>;
    const option = options.find((o) => o.value === done.value);
    if (!driver || !option) continue;
    const scores = options.map((o) => o.score);
    driver.answers.push({
      question: `Micro-test «${done.microTest.title}»: ${done.microTest.instructions}`,
      answer: option.label,
      optionScore: option.score,
      optionScoreRange: { min: Math.min(...scores), max: Math.max(...scores) },
      source: 'MICRO_TEST',
    });
  }
  for (const item of feedback) {
    const driver = input.drivers.find((d) => d.areaId === item.areaId);
    if (!driver) continue;
    const label = COACH_RATINGS.find((r) => r.value === item.rating)!.label;
    driver.answers.push({
      question:
        'Valutazione del coach del circolo dopo la lezione di gruppo (1 Base - 5 Eccellente)',
      answer: item.note ? `${label}. Nota del coach: ${item.note}` : label,
      optionScore: ratingScore(item.rating, input.scale),
      optionScoreRange: {
        min: input.scale.minScore,
        max: input.scale.maxScore,
      },
      source: 'COACH_LESSON',
    });
  }
  return feedback.filter((f) => !f.evaluationId).map((f) => f.id);
}
