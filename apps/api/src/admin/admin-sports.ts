import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  defaultSportSpecializationAreaPrompt,
  defaultTrainingPrompt,
} from './admin-ai-settings';
import {
  createSportAreaPromptVersion,
  createTrainingPromptVersion,
} from './admin-prompt-versions';

export async function upsertSportCatalog(
  prisma: PrismaService,
  body: {
    id?: string;
    key?: string;
    label?: string;
    isActive?: boolean;
    specializations?: Array<{
      id?: string;
      key?: string;
      label?: string;
      trainingPrompt?: string;
      trainingPromptActive?: boolean;
      isActive?: boolean;
      prompts?: Array<{
        id?: string;
        areaId?: string;
        basePrompt?: string;
        isEnabledDriver?: boolean;
        isActive?: boolean;
      }>;
    }>;
  },
  actorId: string,
) {
  const key = body.key?.trim().toUpperCase();
  const label = body.label?.trim();
  if (!actorId || !key || !label) {
    throw new BadRequestException('Dati sport mancanti');
  }
  const specializations = body.specializations ?? [];
  if (!specializations.length) {
    throw new BadRequestException('Definisci almeno una specializzazione');
  }

  const areas = await prisma.area.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const areaIds = new Set(areas.map((area) => area.id));

  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.sport.findUnique({
      where: { key },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== body.id) {
      throw new BadRequestException('Codice sport gia esistente');
    }

    const sport = body.id
      ? await tx.sport.update({
          where: { id: body.id },
          data: { key, label, isActive: body.isActive ?? true },
          select: { id: true, label: true },
        })
      : await tx.sport.create({
          data: { key, label, isActive: body.isActive ?? true },
          select: { id: true, label: true },
        });

    const incomingSpecializationIds = specializations
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id));
    await tx.sportSpecialization.deleteMany({
      where: {
        sportId: sport.id,
        id: { notIn: incomingSpecializationIds },
      },
    });

    for (const specializationInput of specializations) {
      const specializationKey = specializationInput.key?.trim().toUpperCase();
      const specializationLabel = specializationInput.label?.trim();
      const hasTrainingPrompt =
        specializationInput.trainingPrompt !== undefined;
      const trainingPrompt = specializationInput.trainingPrompt?.trim() ?? null;
      if (!specializationKey || !specializationLabel) {
        throw new BadRequestException(
          'Ogni specializzazione richiede codice e nome',
        );
      }
      const specialization = specializationInput.id
        ? await tx.sportSpecialization.update({
            where: { id: specializationInput.id },
            data: {
              key: specializationKey,
              label: specializationLabel,
              ...(hasTrainingPrompt
                ? {
                    trainingPrompt: trainingPrompt || null,
                    trainingPromptVersion: { increment: 1 },
                  }
                : {}),
              trainingPromptActive:
                specializationInput.trainingPromptActive ?? true,
              isActive: specializationInput.isActive ?? true,
            },
            select: {
              id: true,
              label: true,
              trainingPrompt: true,
              trainingPromptVersion: true,
              trainingPromptActive: true,
            },
          })
        : await tx.sportSpecialization.create({
            data: {
              sportId: sport.id,
              key: specializationKey,
              label: specializationLabel,
              trainingPrompt:
                trainingPrompt ||
                defaultTrainingPrompt(
                  `${sport.label} - ${specializationLabel}`,
                ),
              trainingPromptActive:
                specializationInput.trainingPromptActive ?? true,
              isActive: specializationInput.isActive ?? true,
            },
            select: {
              id: true,
              label: true,
              trainingPrompt: true,
              trainingPromptVersion: true,
              trainingPromptActive: true,
            },
          });
      if (!specializationInput.id || hasTrainingPrompt) {
        await createTrainingPromptVersion(tx, specialization, actorId);
      }

      const prompts = specializationInput.prompts ?? [];
      for (const prompt of prompts) {
        const areaId = prompt.areaId?.trim();
        const basePrompt = prompt.basePrompt?.trim();
        if (!areaId || !areaIds.has(areaId) || !basePrompt) {
          continue;
        }
        const savedPrompt = await tx.sportSpecializationAreaPrompt.upsert({
          where: {
            specializationId_areaId: {
              specializationId: specialization.id,
              areaId,
            },
          },
          update: {
            basePrompt,
            isEnabledDriver: prompt.isEnabledDriver ?? true,
            isActive: prompt.isActive ?? true,
            version: { increment: 1 },
            updatedById: actorId,
          },
          create: {
            specializationId: specialization.id,
            areaId,
            basePrompt,
            isEnabledDriver: prompt.isEnabledDriver ?? true,
            isActive: prompt.isActive ?? true,
            createdById: actorId,
            updatedById: actorId,
          },
        });
        await createSportAreaPromptVersion(tx, savedPrompt, actorId);
      }

      for (const area of areas) {
        const savedPrompt = await tx.sportSpecializationAreaPrompt.upsert({
          where: {
            specializationId_areaId: {
              specializationId: specialization.id,
              areaId: area.id,
            },
          },
          update: {},
          create: {
            specializationId: specialization.id,
            areaId: area.id,
            basePrompt: defaultSportSpecializationAreaPrompt(
              `${sport.label} - ${specialization.label}`,
              area.name,
            ),
            isEnabledDriver: true,
            createdById: actorId,
            updatedById: actorId,
          },
        });
        if (!savedPrompt.activePromptVersionId) {
          await createSportAreaPromptVersion(tx, savedPrompt, actorId);
        }
      }
    }

    return tx.sport.findUnique({
      where: { id: sport.id },
      include: {
        specializations: {
          include: { prompts: { include: { area: true } } },
          orderBy: { label: 'asc' },
        },
      },
    });
  });
}

export async function deleteSport(prisma: PrismaService, sportId: string) {
  if (!sportId) {
    throw new BadRequestException('ID sport mancante');
  }
  const existing = await prisma.sport.findUnique({
    where: { id: sportId },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundException('Sport non trovato');
  }
  await prisma.sport.delete({ where: { id: sportId } });
  return { deleted: true };
}
