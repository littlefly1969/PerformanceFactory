import { Prisma, PrismaClient, ProgramHorizon } from '@prisma/client';

/**
 * Atleta arrivato al paywall: reveal visto (ACTIVATED) e orizzonte scelto,
 * calibrazione in PAYWALL_READY, giorni e durata nel profilo. Il checkout
 * accetta solo questo stato (#14).
 */
export async function paywallReady(
  prisma: Pick<
    PrismaClient,
    'athleteCalibration' | 'athleteDiscovery' | 'userOnboardingAssessment'
  >,
  userId: string,
  horizon: ProgramHorizon,
) {
  const now = new Date();
  await prisma.athleteCalibration.upsert({
    where: { userId },
    create: {
      userId,
      status: 'PAYWALL_READY',
      startedAt: now,
      deadlineAt: now,
      completedAt: now,
    },
    update: { status: 'PAYWALL_READY' },
  });
  await prisma.athleteDiscovery.upsert({
    where: { userId },
    create: {
      userId,
      version: 1n,
      draft: {},
      configuration: {},
      programHorizon: horizon,
      horizonSelectedAt: now,
      activatedAt: now,
    },
    update: { programHorizon: horizon, horizonSelectedAt: now },
  });
  await withAvailability(prisma, userId);
}

/** Giorni e durata compilati nel profilo, come dal passo «disponibilità». */
export async function withAvailability(
  prisma: Pick<PrismaClient, 'userOnboardingAssessment'>,
  userId: string,
  days = 3,
  minutes = 60,
) {
  const current = await prisma.userOnboardingAssessment.findUnique({
    where: { userId },
    select: { profileJson: true },
  });
  const profileJson = {
    ...((current?.profileJson as Prisma.JsonObject | null) ?? {}),
    training_days_available: { label: 'Giorni', value: days },
    training_session_duration: { label: 'Minuti', value: minutes },
  };
  await prisma.userOnboardingAssessment.upsert({
    where: { userId },
    update: { profileJson },
    create: { userId, profileJson },
  });
}
