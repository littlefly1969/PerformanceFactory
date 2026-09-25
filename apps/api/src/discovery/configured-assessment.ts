import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  areaOptionsOf,
  assessmentConfigurationError,
  loadAssessmentConfiguration,
} from './assessment-configuration';

/**
 * Copia le domande di area configurate nella banca per atleta. Una
 * configurazione invalida ferma l'assessment: nessun fallback AI nel journey PF5.
 * Le domande operative non entrano nella banca, che richiede un'area.
 */
export async function configuredAssessment(
  prisma: PrismaService,
  userId: string,
) {
  const config = await loadAssessmentConfiguration(prisma, userId);
  if (config.problems.length)
    throw assessmentConfigurationError(config.problems);
  await prisma.$transaction(async (tx) => {
    await tx.userOnboardingQuestion.deleteMany({ where: { userId } });
    // La posizione nella sequenza tiene uniti i driver anche se gli indici dei
    // template si intrecciano dopo modifiche dall'editor.
    let position = 0;
    for (const area of config.areas)
      for (const t of area.templates)
        await tx.userOnboardingQuestion.create({
          data: {
            userId,
            areaId: t.areaId!,
            text: t.label,
            orderIndex: ++position,
            inputType: t.inputType,
            optionsJson: areaOptionsOf(t) as Prisma.InputJsonValue,
            provider: 'configuration',
            model: 'pf4',
            promptVersion: t.updatedAt.toISOString(),
            promptHash: t.id,
            inputJson: { templateId: t.id, sportKey: config.sportKey },
          },
        });
  });
  return config;
}
