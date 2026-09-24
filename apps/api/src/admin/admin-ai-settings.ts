import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  OnboardingInputType,
  OnboardingQuestionScope,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_GOAL_PROMPT,
  DEFAULT_INITIAL_CONTEXT,
  DEFAULT_QUESTIONNAIRE_LAYOUT_JSON,
  DEFAULT_RESPONSE_FORMAT_PROMPT,
  RUNNING_ROAD_TRAINING_PROMPT,
} from './admin-model';
import {
  createAreaGenerationPromptVersion,
  createGoalPromptVersion,
  createSportAreaPromptVersion,
  createTrainingPromptVersion,
} from './admin-prompt-versions';
import { UpsertAiAreaGenerationConfigDto } from './dto/upsert-ai-area-generation-config.dto';
import { UpsertGoalPromptConfigDto } from './dto/upsert-goal-prompt-config.dto';

export async function getAiSettings(prisma: PrismaService) {
  const areas = await prisma.area.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  await ensureAreaGenerationConfigs(
    prisma,
    areas.map((area) => area.id),
  );
  await ensureGoalPromptConfig(prisma);
  await ensureSportPromptCoverage(prisma, areas);

  const [
    goalPromptConfig,
    goalPromptConfigs,
    areaGenerationConfigs,
    sports,
    onboardingTemplates,
  ] = await Promise.all([
    prisma.aiGoalPromptConfig.findFirst({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        basePrompt: true,
        version: true,
        isActive: true,
        activePromptVersionId: true,
        activePromptVersion: {
          select: { id: true, version: true, createdAt: true },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.aiGoalPromptConfig.findMany({
      select: {
        id: true,
        name: true,
        basePrompt: true,
        version: true,
        isActive: true,
        activePromptVersionId: true,
        activePromptVersion: {
          select: { id: true, version: true, createdAt: true },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.aiAreaGenerationConfig.findMany({
      select: {
        id: true,
        areaId: true,
        initialContext: true,
        responseFormatPrompt: true,
        questionnaireLayoutJson: true,
        version: true,
        activePromptVersionId: true,
        activePromptVersion: {
          select: { id: true, version: true, createdAt: true },
        },
        updatedAt: true,
        area: { select: { id: true, name: true } },
      },
      orderBy: [{ area: { name: 'asc' } }],
    }),
    prisma.sport.findMany({
      select: {
        id: true,
        key: true,
        label: true,
        isActive: true,
        specializations: {
          select: {
            id: true,
            key: true,
            label: true,
            trainingPrompt: true,
            trainingPromptVersion: true,
            trainingPromptActive: true,
            activeTrainingPromptVersionId: true,
            activeTrainingPromptVersion: {
              select: { id: true, version: true, createdAt: true },
            },
            isActive: true,
            updatedAt: true,
            prompts: {
              select: {
                id: true,
                areaId: true,
                basePrompt: true,
                isEnabledDriver: true,
                isScheduled: true,
                version: true,
                isActive: true,
                activePromptVersionId: true,
                activePromptVersion: {
                  select: { id: true, version: true, createdAt: true },
                },
                updatedAt: true,
                area: { select: { id: true, name: true } },
              },
              orderBy: [{ area: { name: 'asc' } }],
            },
          },
          orderBy: { label: 'asc' },
        },
      },
      orderBy: { label: 'asc' },
    }),
    prisma.onboardingQuestionTemplate.findMany({
      select: {
        id: true,
        key: true,
        scope: true,
        areaId: true,
        label: true,
        helpText: true,
        inputType: true,
        optionsJson: true,
        required: true,
        orderIndex: true,
        isActive: true,
        updatedAt: true,
        area: { select: { id: true, name: true } },
      },
      orderBy: [{ scope: 'asc' }, { areaId: 'asc' }, { orderIndex: 'asc' }],
    }),
  ]);

  return {
    areas,
    sports,
    goalPromptConfig,
    goalPromptConfigs,
    areaGenerationConfigs,
    onboardingTemplates,
    inputTypes: Object.values(OnboardingInputType),
    scopes: Object.values(OnboardingQuestionScope),
  };
}

export async function ensureAreaGenerationConfigs(
  prisma: PrismaService,
  areaIds: string[],
) {
  if (!areaIds.length) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const areaId of areaIds) {
      const existing = await tx.aiAreaGenerationConfig.findUnique({
        where: { areaId },
        select: { id: true, activePromptVersionId: true },
      });
      if (existing) {
        continue;
      }
      const config = await tx.aiAreaGenerationConfig.create({
        data: {
          id: `area-generation-config-${areaId}`,
          areaId,
          initialContext: DEFAULT_INITIAL_CONTEXT,
          responseFormatPrompt: DEFAULT_RESPONSE_FORMAT_PROMPT,
          questionnaireLayoutJson: DEFAULT_QUESTIONNAIRE_LAYOUT_JSON,
        },
      });
      await createAreaGenerationPromptVersion(tx, config, null);
    }

    const missingHistory = await tx.aiAreaGenerationConfig.findMany({
      where: {
        areaId: { in: areaIds },
        activePromptVersionId: null,
      },
    });
    for (const config of missingHistory) {
      await createAreaGenerationPromptVersion(tx, config, null);
    }
  });
}

export async function ensureGoalPromptConfig(prisma: PrismaService) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.aiGoalPromptConfig.findUnique({
      where: { id: 'goal-prompt-default' },
    });
    const config =
      existing ??
      (await tx.aiGoalPromptConfig.create({
        data: {
          id: 'goal-prompt-default',
          name: 'obiettivo',
          basePrompt: DEFAULT_GOAL_PROMPT,
          isActive: true,
        },
      }));
    if (!config.activePromptVersionId) {
      await createGoalPromptVersion(tx, config, null);
    }
  });
}

export async function ensureSportPromptCoverage(
  prisma: PrismaService,
  areas: Array<{ id: string; name: string }>,
) {
  if (!areas.length) {
    return;
  }

  const specializations = await prisma.sportSpecialization.findMany({
    select: {
      id: true,
      label: true,
      sport: { select: { label: true } },
    },
  });
  for (const specialization of specializations) {
    await prisma.sportSpecialization.updateMany({
      where: { id: specialization.id, trainingPrompt: null },
      data: {
        trainingPrompt: defaultTrainingPrompt(
          `${specialization.sport.label} - ${specialization.label}`,
        ),
      },
    });
    await prisma.sportSpecializationAreaPrompt.createMany({
      data: areas.map((area) => ({
        specializationId: specialization.id,
        areaId: area.id,
        basePrompt: defaultSportSpecializationAreaPrompt(
          `${specialization.sport.label} - ${specialization.label}`,
          area.name,
        ),
      })),
      skipDuplicates: true,
    });
  }
  await prisma.$transaction(async (tx) => {
    const trainingPrompts = await tx.sportSpecialization.findMany({
      where: {
        trainingPrompt: { not: null },
        activeTrainingPromptVersionId: null,
      },
      select: {
        id: true,
        trainingPrompt: true,
        trainingPromptVersion: true,
        trainingPromptActive: true,
      },
    });
    for (const specialization of trainingPrompts) {
      await createTrainingPromptVersion(tx, specialization, null);
    }

    const areaPrompts = await tx.sportSpecializationAreaPrompt.findMany({
      where: { activePromptVersionId: null },
    });
    for (const prompt of areaPrompts) {
      await createSportAreaPromptVersion(tx, prompt, null);
    }
  });
}

export function defaultSportSpecializationAreaPrompt(
  sportLabel: string,
  areaName: string,
) {
  return [
    `Adatta l area ${areaName} allo scenario sportivo ${sportLabel}.`,
    'Usa questa scelta come vincolo prioritario quando interpreti obiettivo, anamnesi e domande specialistiche.',
    'Mantieni il lavoro specifico per il contesto scelto, pratico, misurabile, progressivo e revisionabile da un professionista.',
  ].join(' ');
}

export function defaultTrainingPrompt(sportLabel: string) {
  const normalized = sportLabel.toLowerCase();
  if (
    (normalized.includes('corsa') || normalized.includes('running')) &&
    (normalized.includes('strada') || normalized.includes('road'))
  ) {
    return RUNNING_ROAD_TRAINING_PROMPT;
  }
  return [
    `Genera l allenamento specifico per ${sportLabel}.`,
    'Usa obiettivo, anamnesi, storico, carico e segnali di recupero.',
    'Produci un lavoro pratico, progressivo, misurabile e revisionabile da un professionista.',
  ].join(' ');
}

export async function upsertGoalPromptConfig(
  prisma: PrismaService,
  body: UpsertGoalPromptConfigDto,
  actorId: string,
) {
  const name = body.name?.trim() || 'obiettivo';
  const basePrompt = body.basePrompt?.trim();
  const isActive = body.isActive ?? true;
  if (!actorId || !name || !basePrompt) {
    throw new BadRequestException('Dati prompt obiettivo mancanti');
  }

  if (body.id) {
    const existing = await prisma.aiGoalPromptConfig.findUnique({
      where: { id: body.id },
      select: { id: true, name: true },
    });
    if (!existing) {
      throw new NotFoundException(
        'Configurazione prompt obiettivo non trovata',
      );
    }

    return prisma.$transaction(async (tx) => {
      if (isActive) {
        const activeConfigs = await tx.aiGoalPromptConfig.findMany({
          where: { isActive: true, id: { not: body.id } },
        });
        for (const activeConfig of activeConfigs) {
          const deactivated = await tx.aiGoalPromptConfig.update({
            where: { id: activeConfig.id },
            data: {
              isActive: false,
              version: { increment: 1 },
              updatedById: actorId,
            },
          });
          await createGoalPromptVersion(tx, deactivated, actorId);
        }
      }
      const updated = await tx.aiGoalPromptConfig.update({
        where: { id: body.id },
        data: {
          name,
          basePrompt,
          isActive,
          version: { increment: 1 },
          updatedById: actorId,
        },
      });
      return createGoalPromptVersion(tx, updated, actorId);
    });
  }

  return prisma.$transaction(async (tx) => {
    if (isActive) {
      const activeConfigs = await tx.aiGoalPromptConfig.findMany({
        where: { isActive: true },
      });
      for (const activeConfig of activeConfigs) {
        const deactivated = await tx.aiGoalPromptConfig.update({
          where: { id: activeConfig.id },
          data: {
            isActive: false,
            version: { increment: 1 },
            updatedById: actorId,
          },
        });
        await createGoalPromptVersion(tx, deactivated, actorId);
      }
    }
    const created = await tx.aiGoalPromptConfig.create({
      data: {
        name,
        basePrompt,
        isActive,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    return createGoalPromptVersion(tx, created, actorId);
  });
}

export async function upsertAiAreaGenerationConfig(
  prisma: PrismaService,
  body: UpsertAiAreaGenerationConfigDto,
  actorId: string,
) {
  const areaId = body.areaId?.trim();
  const initialContext = body.initialContext?.trim();
  const responseFormatPrompt = body.responseFormatPrompt?.trim();

  if (!actorId || !areaId || !initialContext || !responseFormatPrompt) {
    throw new BadRequestException('Dati configurazione AI area mancanti');
  }
  if (
    body.questionnaireLayoutJson === undefined ||
    body.questionnaireLayoutJson === null ||
    Array.isArray(body.questionnaireLayoutJson) ||
    typeof body.questionnaireLayoutJson !== 'object'
  ) {
    throw new BadRequestException(
      'Il layout questionario deve essere un oggetto JSON',
    );
  }

  const area = await prisma.area.findUnique({
    where: { id: areaId },
    select: { id: true },
  });
  if (!area) {
    throw new BadRequestException('Area non valida');
  }

  if (body.id) {
    const existing = await prisma.aiAreaGenerationConfig.findUnique({
      where: { id: body.id },
      select: { id: true, areaId: true },
    });
    if (!existing) {
      throw new NotFoundException('Configurazione AI area non trovata');
    }
    if (existing.areaId !== areaId) {
      throw new BadRequestException(
        'Area cannot be changed for this configuration',
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const config = await tx.aiAreaGenerationConfig.upsert({
      where: { areaId },
      update: {
        initialContext,
        responseFormatPrompt,
        questionnaireLayoutJson:
          body.questionnaireLayoutJson as Prisma.InputJsonValue,
        version: { increment: 1 },
        updatedById: actorId,
      },
      create: {
        areaId,
        initialContext,
        responseFormatPrompt,
        questionnaireLayoutJson:
          body.questionnaireLayoutJson as Prisma.InputJsonValue,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    return createAreaGenerationPromptVersion(tx, config, actorId);
  });
}
