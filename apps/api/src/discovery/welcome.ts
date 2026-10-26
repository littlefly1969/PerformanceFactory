import { PrismaService } from '../prisma/prisma.service';

/**
 * Fine della sequenza di benvenuto (foto, Spider, regalo, app). Vive sul
 * server perché su iOS l'app installata non condivide lo storage con Safari:
 * riaperta dalla Home deve andare dritta alla home. Il primo istante resta.
 */
export async function markWelcomeCompleted(
  prisma: PrismaService,
  userId: string,
) {
  await prisma.athleteDiscovery.updateMany({
    where: { userId, welcomeCompletedAt: null },
    data: { welcomeCompletedAt: new Date() },
  });
}
