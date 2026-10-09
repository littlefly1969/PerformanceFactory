import { PrismaClient, ProgramHorizon } from '@prisma/client';

/**
 * Atleta arrivato al paywall: reveal visto (ACTIVATED) e orizzonte scelto,
 * calibrazione in PAYWALL_READY. Il checkout accetta solo questo stato (#14).
 */
export async function paywallReady(
  prisma: Pick<PrismaClient, 'athleteCalibration' | 'athleteDiscovery'>,
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
}
