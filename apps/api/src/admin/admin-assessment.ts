import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  OnboardingQuestionScope,
  OnboardingQuestionTemplate,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  areaOptionsOf,
  EXPECTED_AREA_QUESTIONS,
  loadPf4AssessmentConfiguration,
  semanticRoleOf,
} from '../discovery/assessment-configuration';
import {
  AssessmentOptionDto,
  CreateAssessmentTemplateDto,
  UpdateAssessmentTemplateDto,
} from './dto/assessment-template.dto';

const TOO_FEW = `Ogni driver attivo deve avere esattamente ${EXPECTED_AREA_QUESTIONS} domande. Disattiva il driver oppure configura una domanda sostitutiva.`;
const TOO_MANY = `Il driver può avere esattamente ${EXPECTED_AREA_QUESTIONS} domande attive.`;
const LOCKED =
  'Domanda di sistema: alimenta direttamente la programmazione degli allenamenti e non si modifica.';

const view = (t: OnboardingQuestionTemplate) => ({
  id: t.id,
  key: t.key,
  label: t.label,
  helpText: t.helpText,
  orderIndex: t.orderIndex,
  isActive: t.isActive,
  options: areaOptionsOf(t),
});

/**
 * Stato dell'editor: operative bloccate, driver attivi con tutte le loro
 * domande (anche disattivate) e i conteggi prodotti dal journey.
 */
export async function listAssessmentTemplates(prisma: PrismaService) {
  const config = await loadPf4AssessmentConfiguration(prisma);
  const [operational, areaTemplates] = await Promise.all([
    prisma.onboardingQuestionTemplate.findMany({
      where: { scope: OnboardingQuestionScope.GENERAL, isActive: true },
      orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
    }),
    prisma.onboardingQuestionTemplate.findMany({
      where: {
        scope: OnboardingQuestionScope.AREA,
        areaId: { in: config.areas.map((a) => a.id) },
        optionsJson: { path: ['sportKey'], equals: config.sportKey },
      },
      orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
    }),
  ]);
  return {
    sportKey: config.sportKey,
    expectedPerArea: EXPECTED_AREA_QUESTIONS,
    operational: operational
      .filter((t) => semanticRoleOf(t))
      .map((t) => ({ ...view(t), semanticRole: semanticRoleOf(t)! })),
    areas: config.areas.map((area) => ({
      id: area.id,
      name: area.name,
      templates: areaTemplates.filter((t) => t.areaId === area.id).map(view),
    })),
    stats: {
      fixedQuestionCount: config.fixedQuestionCount,
      areaQuestionCount: config.areaQuestionCount,
      count: config.count,
      estimatedMinutes: config.estimatedMinutes,
    },
    problems: config.problems,
  };
}

/** Opzioni con valore univoco e punteggio 0-100: servono al realR del driver. */
function assertOptions(options: AssessmentOptionDto[]) {
  const values = options.map((o) => o.value.trim());
  if (values.some((v) => !v) || new Set(values).size !== values.length)
    throw new BadRequestException('Ogni opzione ha un valore univoco');
  return options.map((o) => ({
    value: o.value.trim(),
    label: o.label.trim(),
    score: o.score,
  }));
}

/** Domanda di area della specializzazione PF4; le operative sono bloccate. */
async function editableTemplate(prisma: PrismaService, id: string) {
  const template = await prisma.onboardingQuestionTemplate.findUnique({
    where: { id },
  });
  if (template && semanticRoleOf(template))
    throw new ForbiddenException(LOCKED);
  const config = await loadPf4AssessmentConfiguration(prisma);
  const sportKey = (template?.optionsJson as { sportKey?: string } | null)
    ?.sportKey;
  if (
    !template ||
    template.scope !== OnboardingQuestionScope.AREA ||
    sportKey !== config.sportKey ||
    !config.areas.some((a) => a.id === template.areaId)
  )
    throw new NotFoundException('Domanda assessment non trovata');
  return { template, config };
}

/**
 * Nessuna operazione lascia un driver con un numero diverso di domande attive.
 * Se la configurazione e gia invalida, sono ammesse solo modifiche che la
 * avvicinano al numero previsto.
 */
async function assertActiveCount(
  prisma: PrismaService,
  sportKey: string,
  areaId: string,
  delta: number,
) {
  if (!delta) return;
  const active = await prisma.onboardingQuestionTemplate.count({
    where: {
      scope: OnboardingQuestionScope.AREA,
      areaId,
      isActive: true,
      optionsJson: { path: ['sportKey'], equals: sportKey },
    },
  });
  const after = active + delta;
  const distance = (n: number) => Math.abs(n - EXPECTED_AREA_QUESTIONS);
  if (after !== EXPECTED_AREA_QUESTIONS && distance(after) >= distance(active))
    throw new BadRequestException(
      after > EXPECTED_AREA_QUESTIONS ? TOO_MANY : TOO_FEW,
    );
}

export async function createAssessmentTemplate(
  prisma: PrismaService,
  body: CreateAssessmentTemplateDto,
  actorId: string,
) {
  const config = await loadPf4AssessmentConfiguration(prisma);
  if (!config.areas.some((a) => a.id === body.areaId))
    throw new BadRequestException('Il driver non è attivo per lo sport PF4');
  const isActive = body.isActive ?? true;
  if (isActive)
    await assertActiveCount(prisma, config.sportKey, body.areaId, 1);
  const last = await prisma.onboardingQuestionTemplate.aggregate({
    where: {
      scope: OnboardingQuestionScope.AREA,
      areaId: body.areaId,
      optionsJson: { path: ['sportKey'], equals: config.sportKey },
    },
    _max: { orderIndex: true },
  });
  return view(
    await prisma.onboardingQuestionTemplate.create({
      data: {
        key: `assessment_${config.sportKey.toLowerCase()}_${randomUUID()}`,
        scope: OnboardingQuestionScope.AREA,
        areaId: body.areaId,
        label: body.label.trim(),
        helpText: body.helpText?.trim() || null,
        inputType: 'SELECT',
        optionsJson: {
          sportKey: config.sportKey,
          options: assertOptions(body.options),
        },
        required: true,
        orderIndex: (last._max.orderIndex ?? 0) + 1,
        isActive,
        createdById: actorId,
        updatedById: actorId,
      },
    }),
  );
}

export async function updateAssessmentTemplate(
  prisma: PrismaService,
  id: string,
  body: UpdateAssessmentTemplateDto,
  actorId: string,
) {
  const { template, config } = await editableTemplate(prisma, id);
  if (body.isActive !== undefined && body.isActive !== template.isActive)
    await assertActiveCount(
      prisma,
      config.sportKey,
      template.areaId!,
      body.isActive ? 1 : -1,
    );
  return view(
    await prisma.onboardingQuestionTemplate.update({
      where: { id },
      data: {
        ...(body.label !== undefined ? { label: body.label.trim() } : {}),
        ...(body.helpText !== undefined
          ? { helpText: body.helpText?.trim() || null }
          : {}),
        ...(body.options
          ? {
              // Area, sport e tipo SELECT a punteggio non cambiano.
              optionsJson: {
                ...(template.optionsJson as Prisma.JsonObject),
                options: assertOptions(body.options),
              },
            }
          : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        updatedById: actorId,
      },
    }),
  );
}

export async function deleteAssessmentTemplate(
  prisma: PrismaService,
  id: string,
) {
  const { template, config } = await editableTemplate(prisma, id);
  if (template.isActive)
    await assertActiveCount(prisma, config.sportKey, template.areaId!, -1);
  await prisma.onboardingQuestionTemplate.delete({ where: { id } });
  return { id, deleted: true };
}

/**
 * Ordine interno a un driver: le domande si scambiano gli indici gia usati dal
 * driver, cosi la posizione del driver nel percorso non cambia.
 */
export async function reorderAssessmentTemplates(
  prisma: PrismaService,
  areaId: string,
  ids: string[],
  actorId: string,
) {
  const config = await loadPf4AssessmentConfiguration(prisma);
  if (!config.areas.some((a) => a.id === areaId))
    throw new BadRequestException('Il driver non è attivo per lo sport PF4');
  await prisma.$transaction(async (tx) => {
    const templates = await tx.onboardingQuestionTemplate.findMany({
      where: {
        scope: OnboardingQuestionScope.AREA,
        areaId,
        optionsJson: { path: ['sportKey'], equals: config.sportKey },
      },
      orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
    });
    if (
      ids.length !== templates.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !templates.some((t) => t.id === id))
    )
      throw new BadRequestException(
        'Il nuovo ordine deve elencare una sola volta ogni domanda del driver',
      );
    const slots = templates.map((t) => t.orderIndex);
    for (const [index, id] of ids.entries())
      await tx.onboardingQuestionTemplate.update({
        where: { id },
        data: { orderIndex: slots[index], updatedById: actorId },
      });
  });
  return listAssessmentTemplates(prisma);
}
