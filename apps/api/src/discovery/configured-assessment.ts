import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireSportContext } from '../onboarding/onboarding-sports';

/** Copy active configured questions into the existing per-athlete question bank. */
export async function configuredAssessment(
  prisma: PrismaService,
  userId: string,
) {
  const { selection, areas } = await requireSportContext(prisma, userId);
  const templates = await prisma.onboardingQuestionTemplate.findMany({
    where: {
      scope: 'AREA',
      isActive: true,
      areaId: { in: areas.map((a) => a.id) },
      optionsJson: { path: ['sportKey'], equals: selection.sportKey },
    },
    orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
  });
  if (!templates.length) return false;
  if (areas.some((area) => !templates.some((t) => t.areaId === area.id)))
    throw new Error('Configura almeno una domanda per ogni driver attivo');
  await prisma.$transaction(async (tx) => {
    await tx.userOnboardingQuestion.deleteMany({ where: { userId } });
    for (const t of templates) {
      const metadata = t.optionsJson as { options?: Prisma.InputJsonValue };
      if (!Array.isArray(metadata.options) || !metadata.options.length)
        throw new Error('Opzioni assessment non configurate');
      await tx.userOnboardingQuestion.create({
        data: {
          userId,
          areaId: t.areaId!,
          text: t.label,
          orderIndex: t.orderIndex,
          inputType: t.inputType,
          optionsJson: metadata.options,
          provider: 'configuration',
          model: 'pf4',
          promptVersion: t.updatedAt.toISOString(),
          promptHash: t.id,
          inputJson: { templateId: t.id, sportKey: selection.sportKey },
        },
      });
    }
  });
  return true;
}
