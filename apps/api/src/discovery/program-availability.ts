import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeOptions } from '../onboarding/onboarding-answers';
import type {
  OnboardingAnswer,
  TemplateRecord,
} from '../onboarding/onboarding-model';
import { PrismaService } from '../prisma/prisma.service';
import {
  loadOperationalTemplates,
  saveOperationalAnswer,
} from './assessment-configuration';
import { assertProgramAllowed } from './calibration/calibration-config';
import { baselineValue, chosenOptions } from './choice-answers';

/**
 * Giorni e durata per il programma. Non sono più domande dell'assessment: si
 * compilano nel profilo (`profileJson`, chiave del ruolo operativo), anche dal
 * checkout prima del pagamento. Il profilo è la fonte corrente; le risposte del
 * vecchio assessment valgono solo se il profilo non ha un valore valido.
 */

type Db = Pick<
  PrismaService,
  'onboardingQuestionTemplate' | 'userOnboardingAssessment' | 'athleteDiscovery'
>;

type Option = { value: string | number; label?: string };

const AVAILABILITY_MESSAGE =
  'Prima del programma indica quanti giorni e quanto tempo hai per allenarti.';

export const availabilityRequired = () =>
  new ConflictException({
    code: 'AVAILABILITY_REQUIRED',
    message: AVAILABILITY_MESSAGE,
  });

const optionsOf = (q: TemplateRecord) =>
  normalizeOptions(q.optionsJson) as Option[];

const validFor = (q: TemplateRecord, value: unknown) =>
  value !== undefined &&
  chosenOptions(optionsOf(q), value, q.multiple) !== null;

/** Valore corrente di ogni domanda operativa: prima il profilo, poi lo storico. */
async function currentValues(
  db: Db,
  userId: string,
  stored?: Record<string, unknown>,
) {
  const [operational, assessment, discovery] = await Promise.all([
    loadOperationalTemplates(db),
    db.userOnboardingAssessment.findUnique({
      where: { userId },
      select: { profileJson: true },
    }),
    stored
      ? null
      : db.athleteDiscovery.findUnique({
          where: { userId },
          select: { assessmentAnswers: true },
        }),
  ]);
  const profile = (assessment?.profileJson ?? {}) as Record<
    string,
    { value?: unknown } | undefined
  >;
  const history = (stored ?? discovery?.assessmentAnswers ?? {}) as Record<
    string,
    unknown
  >;
  return operational.map((q) => ({
    q,
    value: [profile[q.key]?.value, history[q.id]].find((v) => validFor(q, v)),
  }));
}

/** Risposte operative per la baseline del programma, o AVAILABILITY_REQUIRED. */
export async function programAvailability(
  prisma: PrismaService,
  userId: string,
  stored: Record<string, unknown>,
): Promise<OnboardingAnswer[]> {
  const values = await currentValues(prisma, userId, stored);
  if (values.every((v) => v.value !== undefined))
    return values.map(({ q, value }) => ({
      questionId: q.id,
      value: baselineValue(q, value),
    }));
  await assertProgramAllowed(prisma, userId);
  throw availabilityRequired();
}

/** Prima del checkout: senza giorni e durata non si paga. */
export async function assertAvailability(db: Db, userId: string) {
  const values = await currentValues(db, userId);
  if (values.some((v) => v.value === undefined)) throw availabilityRequired();
}

/** Domande e valori attuali, per il passo «La tua disponibilità». */
export async function availabilityForm(prisma: PrismaService, userId: string) {
  const values = await currentValues(prisma, userId);
  return {
    ready: values.every((v) => v.value !== undefined),
    questions: values.map(({ q, value }) => ({
      key: q.key,
      label: q.label,
      options: optionsOf(q).map((o) => ({
        value: o.value,
        label: o.label ?? String(o.value),
      })),
      value: value ?? null,
    })),
  };
}

/** Salva giorni e durata nel profilo; valori validati sulle opzioni attive. */
export async function saveAvailability(
  prisma: PrismaService,
  userId: string,
  answers: Record<string, unknown>,
) {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Stesso lock del salvataggio dal profilo: nessuna voce persa.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`training-profile:${userId}`}))`;
    const discovery = await tx.athleteDiscovery.findUnique({
      where: { userId },
      select: { userId: true },
    });
    if (!discovery)
      throw new BadRequestException('Inizia prima il tuo percorso');
    const operational = await loadOperationalTemplates(tx);
    for (const q of operational)
      if (answers[q.key] !== undefined && !validFor(q, answers[q.key]))
        throw new BadRequestException(`Risposta non valida per ${q.label}`);
    for (const q of operational)
      if (answers[q.key] !== undefined)
        await saveOperationalAnswer(tx, userId, q, answers[q.key]);
  });
  return availabilityForm(prisma, userId);
}
