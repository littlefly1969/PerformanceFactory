import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { completeCalibration } from './calibration-completion';
import { CalibrationQuestion } from '../../ai-orchestrator/calibration-questions';
import {
  daysLeft,
  finishProblem,
  isCalibrationClosed,
} from './calibration-rules';
import { checkRule, loadActivePolicy } from './confidence-policy';
import { lessonGate } from './lesson-gate';
import { lockCalibration } from './lesson-evidence';
import { publicMicroTest } from './micro-test-step';

type Db = PrismaService | Prisma.TransactionClient;

/** Perché l'atleta non può ancora andare agli scenari (`finishProblem`). */
const FINISH_PROBLEMS = {
  CALIBRATION_NOT_READY: {
    code: 'CALIBRATION_NOT_READY',
    message:
      'Ti conosciamo ancora troppo poco: continua la calibrazione per consolidare la tua R.',
  },
  CALIBRATION_WAITING_LESSON: {
    code: 'CALIBRATION_WAITING_LESSON',
    message:
      'La tua R si chiude dopo la lezione con il coach del circolo. Intanto puoi continuare la calibrazione.',
  },
  CALIBRATION_LESSON_CHOICE: {
    code: 'CALIBRATION_LESSON_CHOICE',
    message:
      'Hai sbloccato la lezione gratuita al circolo: richiedila, oppure dicci che preferisci non farla.',
  },
} as const;

/**
 * Confidence dell'ultima valutazione, regola di consolidamento in vigore e se
 * la soddisfa: R consolidata.
 */
export async function latestRule(db: Db, userId: string) {
  const [latest, policy] = await Promise.all([
    db.assessmentEvaluation.findFirstOrThrow({
      where: { userId },
      orderBy: { sequence: 'desc' },
      select: {
        overallConfidence: true,
        areas: { select: { areaId: true, confidence: true } },
      },
    }),
    loadActivePolicy(db, 'R_CONSOLIDATION'),
  ]);
  const evaluation = {
    overallConfidence: latest.overallConfidence,
    drivers: latest.areas,
  };
  return { evaluation, policy, met: checkRule(policy, evaluation).met };
}

/**
 * Chiude la calibrazione alla scadenza della fase gratuita, anche con R non
 * consolidata o la lezione ancora da fare: round aperti o in valutazione
 * scadono e l'evento registra se R era consolidata.
 */
export function expireCalibration(
  prisma: PrismaService,
  userId: string,
  now: Date,
) {
  return prisma.$transaction(async (tx) => {
    await lockCalibration(tx, userId);
    const current = await tx.athleteCalibration.findUniqueOrThrow({
      where: { userId },
    });
    if (isCalibrationClosed(current.status)) return;
    const { policy, met } = await latestRule(tx, userId);
    // Anche una valutazione rimasta a metà non conta più.
    await tx.calibrationRound.updateMany({
      where: { userId, status: 'EVALUATING' },
      data: { status: 'EXPIRED', evaluationToken: null },
    });
    await completeCalibration(
      tx,
      userId,
      'DEADLINE_REACHED',
      now,
      policy.id,
      met,
    );
  });
}

/**
 * L'atleta con R consolidata sceglie di vedere gli scenari: la calibrazione
 * si chiude. Non con una lezione in attesa o ancora da richiedere o
 * rifiutare, né con una valutazione in corso. Va chiamata sotto il lease
 * dell'atleta.
 */
export function finishCalibration(
  prisma: PrismaService,
  userId: string,
  now: Date,
) {
  return prisma.$transaction(async (tx) => {
    await lockCalibration(tx, userId);
    const current = await tx.athleteCalibration.findUniqueOrThrow({
      where: { userId },
    });
    if (isCalibrationClosed(current.status)) return;
    const evaluating = await tx.calibrationRound.count({
      where: { userId, status: 'EVALUATING' },
    });
    if (evaluating)
      throw new ConflictException(
        'Stiamo ancora valutando le tue ultime risposte: riprova tra poco.',
      );
    const { evaluation, policy, met } = await latestRule(tx, userId);
    const problem = finishProblem(
      met,
      await lessonGate(tx, userId, evaluation),
    );
    if (problem) throw new ConflictException(FINISH_PROBLEMS[problem]);
    await completeCalibration(tx, userId, 'CONFIDENCE_REACHED', now, policy.id);
  });
}

/**
 * Chiusura vista dall'atleta: R consolidata o no, se può già andare agli
 * scenari (nessuna valutazione in corso) e quanto manca alla scadenza.
 */
export async function closingView(
  db: Db,
  userId: string,
  calibration: { status: string; deadlineAt: Date },
  rule: Awaited<ReturnType<typeof latestRule>>,
  open: { status: string } | null,
  now: Date,
) {
  const canFinish =
    !isCalibrationClosed(calibration.status) &&
    open?.status !== 'EVALUATING' &&
    finishProblem(rule.met, await lessonGate(db, userId, rule.evaluation)) ===
      null;
  return {
    deadlineAt: calibration.deadlineAt,
    daysLeft: daysLeft(calibration.deadlineAt, now),
    /** L'ultima valutazione soddisfa la regola di consolidamento: R consolidata. */
    ruleMet: rule.met,
    /** L'atleta può chiudere la calibrazione e andare agli scenari. */
    canFinish,
  };
}

/** Round aperto per l'atleta: lo score delle opzioni resta sul server. */
export function publicRound(open: {
  id: string;
  kind: string;
  action: string | null;
  status: string;
  questionsJson: unknown;
  answersJson: unknown;
}) {
  return {
    id: open.id,
    kind: open.kind,
    // Una domanda, un gruppo o un chiarimento: il motivo resta interno.
    action: open.action,
    status: open.status,
    questions: (open.questionsJson as CalibrationQuestion[]).map((q) => ({
      id: q.id,
      areaId: q.areaId,
      text: q.text,
      multiple: q.multiple ?? false,
      options: q.options.map(({ value, label, exclusive }) => ({
        value,
        label,
        ...(exclusive ? { exclusive } : {}),
      })),
      ...publicMicroTest(q, open.answersJson),
    })),
    answers: open.answersJson as Record<string, string | string[]>,
  };
}
