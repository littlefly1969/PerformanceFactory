import { assertDiscoveryMetadata } from '../discovery/discovery-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OnboardingQuestionScope, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertOnboardingTemplateDto } from './dto/upsert-onboarding-template.dto';

export async function upsertOnboardingTemplate(
  prisma: PrismaService,
  body: UpsertOnboardingTemplateDto,
  actorId: string,
) {
  const key = body.key?.trim();
  const label = body.label?.trim();
  if (!actorId || !key || !label || !body.scope || !body.inputType) {
    throw new BadRequestException('Dati template onboarding mancanti');
  }

  if (body.scope === OnboardingQuestionScope.AREA && !body.areaId) {
    throw new BadRequestException('Le domande area richiedono un area');
  }
  if (body.areaId) {
    const area = await prisma.area.findUnique({
      where: { id: body.areaId },
      select: { id: true },
    });
    if (!area) {
      throw new BadRequestException('Area non valida');
    }
  }

  if (body.scope === OnboardingQuestionScope.DISCOVERY) {
    assertDiscoveryMetadata(body.optionsJson, body.required ?? true);
  }

  const data = {
    key,
    scope: body.scope,
    areaId:
      body.scope === OnboardingQuestionScope.AREA
        ? (body.areaId ?? null)
        : null,
    label,
    helpText: body.helpText?.trim() || null,
    inputType: body.inputType,
    optionsJson:
      body.optionsJson === undefined
        ? Prisma.JsonNull
        : (body.optionsJson as Prisma.InputJsonValue),
    required: body.required ?? true,
    orderIndex: Number(body.orderIndex) || 0,
    isActive: body.isActive ?? true,
    updatedById: actorId,
  };

  if (body.id) {
    const existing = await prisma.onboardingQuestionTemplate.findUnique({
      where: { id: body.id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Template onboarding non trovato');
    }
    return prisma.onboardingQuestionTemplate.update({
      where: { id: body.id },
      data,
    });
  }

  return prisma.onboardingQuestionTemplate.create({
    data: {
      ...data,
      createdById: actorId,
    },
  });
}

export async function deleteOnboardingTemplate(
  prisma: PrismaService,
  id: string,
) {
  const existing = await prisma.onboardingQuestionTemplate.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundException('Template onboarding non trovato');
  }
  await prisma.onboardingQuestionTemplate.delete({ where: { id } });
  return { id, deleted: true };
}
