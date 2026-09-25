import { assertDiscoveryGraph } from '../discovery/discovery-conditions';
import { assertDiscoveryMetadata } from '../discovery/discovery-metadata';
import { assertDiscoveryStructure } from '../discovery/discovery-structure';
import { DiscoveryCondition } from '../discovery/discovery.types';
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

  const discoveryTemplates = await prisma.onboardingQuestionTemplate.findMany({
    where: { scope: 'DISCOVERY' },
  });
  const next = [
    ...discoveryTemplates.filter((t) => t.id !== body.id),
    ...(body.scope === OnboardingQuestionScope.DISCOVERY ? [data] : []),
  ];
  assertDiscoveryGraph(next);
  // Le altre aree non devono pagare una discovery gia incoerente.
  if (
    body.scope === OnboardingQuestionScope.DISCOVERY ||
    discoveryTemplates.some((t) => t.id === body.id)
  )
    assertDiscoveryStructure(next);

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
    select: { id: true, key: true, label: true, scope: true },
  });
  if (!existing) {
    throw new NotFoundException('Template onboarding non trovato');
  }
  const discoveryTemplates = await prisma.onboardingQuestionTemplate.findMany({
    where: { scope: 'DISCOVERY' },
  });
  const remaining = discoveryTemplates.filter((t) => t.id !== id);
  if (existing.scope === OnboardingQuestionScope.DISCOVERY) {
    // Anche una domanda disattivata che la usa tornerebbe invalida alla riattivazione.
    const dependent = remaining.find((t) =>
      (
        t.optionsJson as { visibleWhen?: DiscoveryCondition } | null
      )?.visibleWhen?.rules.some((r) => r.question === existing.key),
    );
    if (dependent)
      throw new BadRequestException(
        `Impossibile eliminare «${existing.label}»: la usa la condizione di «${dependent.label}»`,
      );
  }
  assertDiscoveryGraph(remaining);
  if (existing.scope === OnboardingQuestionScope.DISCOVERY)
    assertDiscoveryStructure(remaining);
  await prisma.onboardingQuestionTemplate.delete({ where: { id } });
  return { id, deleted: true };
}
