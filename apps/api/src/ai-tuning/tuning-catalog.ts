import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiCycleContext } from '../ai-orchestrator/proposal-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertGoldenContextDto } from './dto/upsert-golden-context.dto';

export async function listAreas(prisma: PrismaService) {
  return prisma.area.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

export async function listAreaConfigs(prisma: PrismaService) {
  return prisma.aiAreaGenerationConfig.findMany({
    include: { area: { select: { id: true, name: true } } },
    orderBy: { area: { name: 'asc' } },
  });
}

export async function listPromptVersions(
  prisma: PrismaService,
  params: { type?: string; ownerId?: string },
) {
  const promptType = params.type?.trim().toUpperCase();
  const ownerId = params.ownerId?.trim();
  const where: Prisma.AiPromptVersionWhereInput = {};
  if (promptType) {
    where.promptType = promptType;
  }
  if (ownerId) {
    if (promptType === 'GOAL') {
      where.goalPromptConfigId = ownerId;
    } else if (promptType === 'AREA_GENERATION') {
      where.areaGenerationConfigId = ownerId;
    } else if (promptType === 'SPORT_AREA') {
      where.sportSpecializationAreaPromptId = ownerId;
    } else if (promptType === 'TRAINING') {
      where.sportSpecializationId = ownerId;
    } else {
      where.OR = [
        { goalPromptConfigId: ownerId },
        { areaGenerationConfigId: ownerId },
        { sportSpecializationAreaPromptId: ownerId },
        { sportSpecializationId: ownerId },
      ];
    }
  }

  return prisma.aiPromptVersion.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { version: 'desc' }],
    select: {
      id: true,
      promptType: true,
      version: true,
      contentJson: true,
      createdAt: true,
      createdById: true,
      goalPromptConfigId: true,
      areaGenerationConfigId: true,
      sportSpecializationAreaPromptId: true,
      sportSpecializationId: true,
    },
  });
}

export async function listGoldenContexts(
  prisma: PrismaService,
  areaId?: string,
) {
  return prisma.aiGoldenContext.findMany({
    where: areaId ? { areaId } : {},
    orderBy: { createdAt: 'desc' },
    include: { area: { select: { id: true, name: true } } },
  });
}

export async function createGoldenContext(
  prisma: PrismaService,
  actorId: string,
  dto: UpsertGoldenContextDto,
) {
  return prisma.aiGoldenContext.create({
    data: {
      label: dto.label,
      description: dto.description ?? null,
      areaId: dto.areaId,
      athleteLevel: dto.athleteLevel ?? null,
      contextJson: dto.contextJson as Prisma.InputJsonValue,
      isActive: dto.isActive ?? true,
      createdById: actorId,
    },
  });
}

export async function updateGoldenContext(
  prisma: PrismaService,
  id: string,
  dto: UpsertGoldenContextDto,
) {
  return prisma.aiGoldenContext.update({
    where: { id },
    data: {
      label: dto.label,
      description: dto.description ?? null,
      areaId: dto.areaId,
      athleteLevel: dto.athleteLevel ?? null,
      contextJson: dto.contextJson as Prisma.InputJsonValue,
      isActive: dto.isActive ?? true,
    },
  });
}

export async function deleteGoldenContext(prisma: PrismaService, id: string) {
  await prisma.aiGoldenContext.delete({ where: { id } });
  return { ok: true };
}

export async function createGoldenContextFromAudit(
  prisma: PrismaService,
  actorId: string,
  auditId: string,
  label: string,
) {
  const audit = await prisma.aiProposalAudit.findUnique({
    where: { id: auditId },
    include: {
      planRelease: { select: { areaId: true } },
    },
  });
  if (!audit) {
    throw new NotFoundException(`Audit ${auditId} non trovato`);
  }
  const inputJson = audit.inputJson as Prisma.JsonObject;
  const promptBlock = (inputJson?.prompt ?? {}) as Prisma.JsonObject;
  const userBlock = (promptBlock?.user ?? {}) as Prisma.JsonObject;
  const context = userBlock?.context as AiCycleContext | undefined;
  if (!context || !audit.planRelease?.areaId) {
    throw new BadRequestException(
      'Audit non utilizzabile come golden (manca contesto o area)',
    );
  }
  return prisma.aiGoldenContext.create({
    data: {
      label,
      description: `Da audit ${audit.id}`,
      areaId: audit.planRelease.areaId,
      athleteLevel: context.athlete?.areaLevel ?? null,
      contextJson: context as unknown as Prisma.InputJsonValue,
      isActive: true,
      createdById: actorId,
    },
  });
}
