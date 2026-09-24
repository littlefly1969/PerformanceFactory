import { Prisma } from '@prisma/client';

export function goalPromptVersionContent(config: {
  name: string;
  basePrompt: string;
  isActive: boolean;
}): Prisma.InputJsonObject {
  return {
    name: config.name,
    basePrompt: config.basePrompt,
    isActive: config.isActive,
  };
}

export function areaGenerationVersionContent(config: {
  areaId: string;
  initialContext: string;
  responseFormatPrompt: string;
  questionnaireLayoutJson: unknown;
}): Prisma.InputJsonObject {
  return {
    areaId: config.areaId,
    initialContext: config.initialContext,
    responseFormatPrompt: config.responseFormatPrompt,
    questionnaireLayoutJson:
      config.questionnaireLayoutJson as Prisma.InputJsonValue,
  };
}

export function sportAreaPromptVersionContent(prompt: {
  specializationId: string;
  areaId: string;
  basePrompt: string;
  isEnabledDriver: boolean;
  isScheduled: boolean;
  isActive: boolean;
}): Prisma.InputJsonObject {
  return {
    specializationId: prompt.specializationId,
    areaId: prompt.areaId,
    basePrompt: prompt.basePrompt,
    isEnabledDriver: prompt.isEnabledDriver,
    isScheduled: prompt.isScheduled,
    isActive: prompt.isActive,
  };
}

export function trainingPromptVersionContent(specialization: {
  id: string;
  trainingPrompt: string | null;
  trainingPromptActive: boolean;
}): Prisma.InputJsonObject {
  return {
    specializationId: specialization.id,
    trainingPrompt: specialization.trainingPrompt,
    trainingPromptActive: specialization.trainingPromptActive,
  };
}

export async function createGoalPromptVersion(
  tx: Prisma.TransactionClient,
  config: {
    id: string;
    name: string;
    basePrompt: string;
    version: number;
    isActive: boolean;
  },
  actorId: string | null,
) {
  const version = await tx.aiPromptVersion.create({
    data: {
      promptType: 'GOAL',
      version: config.version,
      contentJson: goalPromptVersionContent(config),
      goalPromptConfigId: config.id,
      createdById: actorId,
    },
    select: { id: true },
  });
  return tx.aiGoalPromptConfig.update({
    where: { id: config.id },
    data: { activePromptVersionId: version.id },
  });
}

export async function createAreaGenerationPromptVersion(
  tx: Prisma.TransactionClient,
  config: {
    id: string;
    areaId: string;
    initialContext: string;
    responseFormatPrompt: string;
    questionnaireLayoutJson: unknown;
    version: number;
  },
  actorId: string | null,
) {
  const version = await tx.aiPromptVersion.create({
    data: {
      promptType: 'AREA_GENERATION',
      version: config.version,
      contentJson: areaGenerationVersionContent(config),
      areaGenerationConfigId: config.id,
      createdById: actorId,
    },
    select: { id: true },
  });
  return tx.aiAreaGenerationConfig.update({
    where: { id: config.id },
    data: { activePromptVersionId: version.id },
  });
}

export async function createSportAreaPromptVersion(
  tx: Prisma.TransactionClient,
  prompt: {
    id: string;
    specializationId: string;
    areaId: string;
    basePrompt: string;
    version: number;
    isEnabledDriver: boolean;
    isScheduled: boolean;
    isActive: boolean;
  },
  actorId: string | null,
) {
  const version = await tx.aiPromptVersion.create({
    data: {
      promptType: 'SPORT_AREA',
      version: prompt.version,
      contentJson: sportAreaPromptVersionContent(prompt),
      sportSpecializationAreaPromptId: prompt.id,
      createdById: actorId,
    },
    select: { id: true },
  });
  return tx.sportSpecializationAreaPrompt.update({
    where: { id: prompt.id },
    data: { activePromptVersionId: version.id },
  });
}

export async function createTrainingPromptVersion(
  tx: Prisma.TransactionClient,
  specialization: {
    id: string;
    trainingPrompt: string | null;
    trainingPromptVersion: number;
    trainingPromptActive: boolean;
  },
  actorId: string | null,
) {
  if (!specialization.trainingPrompt) {
    return specialization;
  }
  const version = await tx.aiPromptVersion.create({
    data: {
      promptType: 'TRAINING',
      version: specialization.trainingPromptVersion,
      contentJson: trainingPromptVersionContent(specialization),
      sportSpecializationId: specialization.id,
      createdById: actorId,
    },
    select: { id: true },
  });
  return tx.sportSpecialization.update({
    where: { id: specialization.id },
    data: { activeTrainingPromptVersionId: version.id },
  });
}
