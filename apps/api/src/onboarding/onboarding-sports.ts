import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  FormattedSportSelection,
  SportSelectionPayload,
} from './onboarding-model';

export async function loadConfiguredAreas(prisma: PrismaService) {
  return prisma.area.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export async function loadActiveSports(prisma: PrismaService) {
  return prisma.sport.findMany({
    where: {
      isActive: true,
      specializations: { some: { isActive: true } },
    },
    select: {
      id: true,
      key: true,
      label: true,
      specializations: {
        where: { isActive: true },
        select: { id: true, key: true, label: true },
        orderBy: { label: 'asc' },
      },
    },
    orderBy: { label: 'asc' },
  });
}

export async function validateSportSelection(
  prisma: PrismaService,
  input: SportSelectionPayload,
): Promise<FormattedSportSelection> {
  const sportId = input.sportId?.trim();
  const specializationId = input.specializationId?.trim();
  if (!sportId || !specializationId) {
    throw new BadRequestException('Seleziona sport e specializzazione');
  }
  const specialization = await prisma.sportSpecialization.findFirst({
    where: {
      id: specializationId,
      sportId,
      isActive: true,
      sport: { isActive: true },
    },
    select: {
      id: true,
      key: true,
      label: true,
      sport: { select: { id: true, key: true, label: true } },
    },
  });
  if (!specialization) {
    throw new BadRequestException('Sport o specializzazione non configurati');
  }
  return {
    sportId: specialization.sport.id,
    sportKey: specialization.sport.key,
    sportLabel: specialization.sport.label,
    specializationId: specialization.id,
    specializationKey: specialization.key,
    specializationLabel: specialization.label,
    label: `${specialization.sport.label} - ${specialization.label}`,
  };
}

export async function loadUserSportSelection(
  prisma: PrismaService,
  userId: string,
) {
  const selection = await prisma.userSportSelection.findUnique({
    where: { userId },
    select: {
      sport: { select: { id: true, key: true, label: true } },
      specialization: { select: { id: true, key: true, label: true } },
    },
  });
  if (!selection) {
    return null;
  }
  return {
    sportId: selection.sport.id,
    sportKey: selection.sport.key,
    sportLabel: selection.sport.label,
    specializationId: selection.specialization.id,
    specializationKey: selection.specialization.key,
    specializationLabel: selection.specialization.label,
    label: `${selection.sport.label} - ${selection.specialization.label}`,
  };
}

export async function requireSportContext(
  prisma: PrismaService,
  userId: string,
) {
  const selection = await loadUserSportSelection(prisma, userId);
  if (!selection) {
    throw new BadRequestException(
      'Seleziona prima uno o due sport per personalizzare il percorso',
    );
  }
  const areas = await loadEnabledDriverAreasForSelection(prisma, selection);
  const instructions = await loadSportAreaPromptInstructions(
    prisma,
    selection,
    areas,
  );
  return { selection, instructions, areas };
}

export async function loadEnabledDriverAreasForSelection(
  prisma: PrismaService,
  selection: FormattedSportSelection,
) {
  const prompts = await prisma.sportSpecializationAreaPrompt.findMany({
    where: {
      specializationId: selection.specializationId,
      isActive: true,
      isEnabledDriver: true,
    },
    select: { area: { select: { id: true, name: true } } },
    orderBy: { area: { name: 'asc' } },
  });
  return prompts.length
    ? prompts.map((prompt) => prompt.area)
    : loadConfiguredAreas(prisma);
}

export async function loadSportAreaPromptInstructions(
  prisma: PrismaService,
  selection: FormattedSportSelection,
  areas: Array<{ id: string; name: string }>,
) {
  const areaIds = areas.map((area) => area.id);
  const prompts = await prisma.sportSpecializationAreaPrompt.findMany({
    where: {
      isActive: true,
      isEnabledDriver: true,
      areaId: { in: areaIds },
      specializationId: selection.specializationId,
    },
    select: {
      specializationId: true,
      areaId: true,
      basePrompt: true,
      version: true,
      area: { select: { name: true } },
      specialization: {
        select: {
          key: true,
          label: true,
          sport: { select: { key: true, label: true } },
        },
      },
    },
  });
  return prompts.map((prompt) => ({
    sportKey: prompt.specialization.sport.key,
    specializationKey: prompt.specialization.key,
    specializationId: prompt.specializationId,
    sportLabel: `${prompt.specialization.sport.label} - ${prompt.specialization.label}`,
    areaId: prompt.areaId,
    areaName: prompt.area.name,
    basePrompt: prompt.basePrompt,
    version: prompt.version,
  }));
}
