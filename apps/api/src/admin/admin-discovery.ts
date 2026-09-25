import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertDiscoveryGraph } from '../discovery/discovery-conditions';
import {
  assertDiscoveryStructure,
  discoverySportMode,
  discoveryTarget,
  DiscoverySportMode,
} from '../discovery/discovery-structure';
import {
  deleteOnboardingTemplate,
  upsertOnboardingTemplate,
} from './admin-onboarding';
import {
  CreateDiscoveryTemplateDto,
  UpdateDiscoveryTemplateDto,
} from './dto/discovery-template.dto';

export type DiscoveryAdminStats = {
  configured: number;
  active: number;
  inactive: number;
  conditional: number;
  unconditional: number;
  activePathCount: number;
};

type AdminTemplate = {
  id: string;
  key: string;
  orderIndex: number;
  isActive: boolean;
  optionsJson: unknown;
};

/**
 * Numeri derivati dai template, mai salvati: descrivono la configurazione.
 * activePathCount conta le domande attive del percorso pubblico, condizionali
 * comprese, anche quando rami alternativi si escludono. Quante domande vede un
 * atleta dipende dal ramo e lo mostra l'anteprima.
 */
export function discoveryAdminStats(
  templates: AdminTemplate[],
  mode: DiscoverySportMode = discoverySportMode(),
): DiscoveryAdminStats {
  const active = templates.filter((t) => t.isActive);
  // Con sport fisso sport e specializzazione non entrano nel percorso pubblico.
  const path = active.filter(
    (t) =>
      mode === 'user_choice' ||
      !['sportId', 'specializationId'].includes(discoveryTarget(t) ?? ''),
  );
  const conditional = path.filter(
    (t) =>
      (t.optionsJson as { visibleWhen?: unknown } | null)?.visibleWhen !==
      undefined,
  ).length;
  return {
    configured: templates.length,
    active: active.length,
    inactive: templates.length - active.length,
    conditional,
    unconditional: path.length - conditional,
    activePathCount: path.length,
  };
}

export async function listDiscoveryTemplates(prisma: PrismaService) {
  const templates = await prisma.onboardingQuestionTemplate.findMany({
    where: { scope: 'DISCOVERY' },
    orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      key: true,
      label: true,
      helpText: true,
      inputType: true,
      optionsJson: true,
      required: true,
      orderIndex: true,
      isActive: true,
      updatedAt: true,
    },
  });
  const sportMode = discoverySportMode();
  return {
    sportMode,
    templates,
    stats: discoveryAdminStats(templates, sportMode),
  };
}

async function findDiscoveryTemplate(prisma: PrismaService, id: string) {
  const template = await prisma.onboardingQuestionTemplate.findFirst({
    where: { id, scope: 'DISCOVERY' },
  });
  if (!template) throw new NotFoundException('Domanda discovery non trovata');
  return template;
}

export async function createDiscoveryTemplate(
  prisma: PrismaService,
  body: CreateDiscoveryTemplateDto,
  actorId: string,
) {
  const key = body.key.trim();
  if (
    await prisma.onboardingQuestionTemplate.findUnique({
      where: { key },
      select: { id: true },
    })
  )
    throw new ConflictException(`Il codice ${key} è già usato`);
  // Senza posizione esplicita la nuova domanda chiude il percorso.
  const last = await prisma.onboardingQuestionTemplate.aggregate({
    where: { scope: 'DISCOVERY' },
    _max: { orderIndex: true },
  });
  return upsertOnboardingTemplate(
    prisma,
    {
      ...body,
      key,
      scope: 'DISCOVERY',
      orderIndex: body.orderIndex ?? (last._max.orderIndex ?? 0) + 10,
    },
    actorId,
  );
}

/** Modifica parziale: i campi assenti restano quelli salvati; il codice non cambia. */
export async function updateDiscoveryTemplate(
  prisma: PrismaService,
  id: string,
  patch: UpdateDiscoveryTemplateDto,
  actorId: string,
) {
  const existing = await findDiscoveryTemplate(prisma, id);
  return upsertOnboardingTemplate(
    prisma,
    {
      id,
      key: existing.key,
      scope: 'DISCOVERY',
      label: patch.label ?? existing.label,
      helpText:
        patch.helpText !== undefined ? patch.helpText : existing.helpText,
      inputType: patch.inputType ?? existing.inputType,
      optionsJson:
        patch.optionsJson !== undefined
          ? patch.optionsJson
          : existing.optionsJson,
      required: patch.required ?? existing.required,
      orderIndex: patch.orderIndex ?? existing.orderIndex,
      isActive: patch.isActive ?? existing.isActive,
    },
    actorId,
  );
}

export async function deleteDiscoveryTemplate(
  prisma: PrismaService,
  id: string,
) {
  await findDiscoveryTemplate(prisma, id);
  return deleteOnboardingTemplate(prisma, id);
}

/**
 * Assegna l'ordine 10, 20, 30… e valida grafo e struttura sul risultato, prima
 * di qualunque scrittura.
 */
export function planDiscoveryReorder<T extends AdminTemplate>(
  templates: T[],
  ids: string[],
  mode: DiscoverySportMode = discoverySportMode(),
) {
  const byId = new Map(templates.map((t) => [t.id, t]));
  if (
    ids.length !== templates.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !byId.has(id))
  )
    throw new BadRequestException(
      'Il nuovo ordine deve elencare una sola volta ogni domanda discovery',
    );
  const reordered = ids.map((id, index) => ({
    ...byId.get(id)!,
    orderIndex: (index + 1) * 10,
  }));
  assertDiscoveryGraph(reordered);
  assertDiscoveryStructure(reordered, mode);
  return reordered;
}

/** Tutto o niente: un ordine che romperebbe una dipendenza non scrive nulla. */
export async function reorderDiscoveryTemplates(
  prisma: PrismaService,
  ids: string[],
  actorId: string,
) {
  await prisma.$transaction(async (tx) => {
    const templates = await tx.onboardingQuestionTemplate.findMany({
      where: { scope: 'DISCOVERY' },
    });
    const current = new Map(templates.map((t) => [t.id, t.orderIndex]));
    for (const template of planDiscoveryReorder(templates, ids))
      if (current.get(template.id) !== template.orderIndex)
        await tx.onboardingQuestionTemplate.update({
          where: { id: template.id },
          data: { orderIndex: template.orderIndex, updatedById: actorId },
        });
  });
  return listDiscoveryTemplates(prisma);
}
