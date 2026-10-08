import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreditEntry,
  DEFAULT_FREE_LESSON_SETTINGS,
  FreeLessonSettings,
  creditEntries,
  freeLessonSettingsProblems,
} from './free-lesson-rules';

const ID = 'default';
const select = {
  creditsToUnlock: true,
  creditsInitialAssessment: true,
  creditsCalibrationRound: true,
  creditsMicroTest: true,
} as const;

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Parametri correnti; la riga nasce con i valori di default alla prima lettura.
 * Un upsert fallirebbe con due prime letture parallele: l'inserimento ignora il
 * doppione e poi si legge la riga.
 */
export async function loadFreeLessonSettings(
  prisma: Db,
): Promise<FreeLessonSettings> {
  await prisma.freeLessonConfig.createMany({
    data: [{ id: ID, ...DEFAULT_FREE_LESSON_SETTINGS }],
    skipDuplicates: true,
  });
  return prisma.freeLessonConfig.findUniqueOrThrow({
    where: { id: ID },
    select,
  });
}

export async function updateFreeLessonSettings(
  prisma: PrismaService,
  change: Partial<FreeLessonSettings>,
  actorId: string,
) {
  const next = { ...(await loadFreeLessonSettings(prisma)), ...change };
  const problems = freeLessonSettingsProblems(next);
  if (problems.length) throw new BadRequestException(problems.join('. '));
  return prisma.freeLessonConfig.update({
    where: { id: ID },
    data: { ...change, updatedById: actorId },
    select,
  });
}

/**
 * Allinea il ledger agli eventi che danno crediti. Idempotente anche con
 * richieste concorrenti: la chiave unica (utente, evento) scarta i doppioni.
 */
export async function syncCredits(
  prisma: Db,
  userId: string,
  settings: FreeLessonSettings,
) {
  const [initial, rounds, tests] = await Promise.all([
    prisma.assessmentEvaluation.findUnique({
      where: { userId_sequence: { userId, sequence: 1 } },
      select: { id: true },
    }),
    prisma.calibrationRound.findMany({
      where: { userId, status: 'EVALUATED' },
      select: { id: true },
    }),
    prisma.microTestCompletion.findMany({
      where: { userId },
      select: { id: true },
    }),
  ]);
  const entries: CreditEntry[] = creditEntries(
    {
      initialEvaluationId: initial?.id ?? null,
      evaluatedRoundIds: rounds.map((r) => r.id),
      microTestCompletionIds: tests.map((t) => t.id),
    },
    settings,
  );
  if (entries.length)
    await prisma.interactionCreditEntry.createMany({
      data: entries.map((entry) => ({ userId, ...entry })),
      skipDuplicates: true,
    });
  const total = await prisma.interactionCreditEntry.aggregate({
    where: { userId },
    _sum: { points: true },
  });
  return total._sum.points ?? 0;
}
