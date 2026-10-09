import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ASSESSMENT_PROMPT_TYPE,
  DEFAULT_ASSESSMENT_PROMPT,
} from './assessment-evaluation-model';
import {
  CALIBRATION_PROMPT_TYPE,
  DEFAULT_CALIBRATION_PROMPT,
} from './calibration-questions';
import {
  DEFAULT_MICRO_TEST_PROMPT,
  MICRO_TEST_PROMPT_TYPE,
} from './micro-test-generation';
import {
  DEFAULT_POTENTIAL_PROMPT,
  POTENTIAL_PROMPT_TYPE,
} from './potential-generation';

/**
 * Quattro famiglie di prompt con lo stesso ciclo di vita (bozze, attivazione,
 * versioni): la valutazione delle risposte, le domande di calibrazione, i
 * micro-test su misura e gli scenari P3/P6/P12. Al massimo un prompt attivo
 * per famiglia.
 */
export const ASSESSMENT_PROMPT_KINDS = [
  'EVALUATION',
  'CALIBRATION',
  'MICRO_TEST',
  'POTENTIAL',
] as const;
export type AssessmentPromptKind = (typeof ASSESSMENT_PROMPT_KINDS)[number];
const KINDS = {
  EVALUATION: {
    defaultId: 'assessment-prompt-default',
    defaultName: 'valutazione assessment',
    defaultPrompt: DEFAULT_ASSESSMENT_PROMPT,
    promptType: ASSESSMENT_PROMPT_TYPE,
  },
  CALIBRATION: {
    defaultId: 'calibration-prompt-default',
    defaultName: 'domande di calibrazione',
    defaultPrompt: DEFAULT_CALIBRATION_PROMPT,
    promptType: CALIBRATION_PROMPT_TYPE,
  },
  MICRO_TEST: {
    defaultId: 'micro-test-prompt-default',
    defaultName: 'micro-test su misura',
    defaultPrompt: DEFAULT_MICRO_TEST_PROMPT,
    promptType: MICRO_TEST_PROMPT_TYPE,
  },
  POTENTIAL: {
    defaultId: 'potential-prompt-default',
    defaultName: 'scenari P3/P6/P12',
    defaultPrompt: DEFAULT_POTENTIAL_PROMPT,
    promptType: POTENTIAL_PROMPT_TYPE,
  },
} as const;
export const isAssessmentPromptKind = (
  value: unknown,
): value is AssessmentPromptKind =>
  (ASSESSMENT_PROMPT_KINDS as readonly unknown[]).includes(value);
const select = {
  id: true,
  name: true,
  basePrompt: true,
  version: true,
  isActive: true,
  kind: true,
  activePromptVersionId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AiAssessmentPromptConfigSelect;

/** Serializza ogni scrittura: al massimo una configurazione attiva alla volta. */
async function lockPromptConfigs(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ai-assessment-prompt-config'))`;
}

type ConfigRecord = {
  id: string;
  name: string;
  basePrompt: string;
  version: number;
  isActive: boolean;
  kind: string;
};

/** Il prompt plausibile di partenza nasce attivo alla prima lettura, come il prompt obiettivo. */
export async function ensureAssessmentPromptConfig(
  prisma: PrismaService,
  kind: AssessmentPromptKind = 'EVALUATION',
) {
  const defaults = KINDS[kind];
  await prisma.$transaction(async (tx) => {
    await lockPromptConfigs(tx);
    const config = await tx.aiAssessmentPromptConfig.upsert({
      where: { id: defaults.defaultId },
      update: {},
      create: {
        id: defaults.defaultId,
        kind,
        name: defaults.defaultName,
        basePrompt: defaults.defaultPrompt,
        // Attivo solo se nessun'altra configurazione della famiglia lo e gia.
        isActive: !(await tx.aiAssessmentPromptConfig.count({
          where: { isActive: true, kind },
        })),
      },
    });
    if (!config.activePromptVersionId)
      await createAssessmentPromptVersion(tx, config, null);
  });
}

export async function loadActiveAssessmentPrompt(
  prisma: PrismaService,
  kind: AssessmentPromptKind = 'EVALUATION',
) {
  await ensureAssessmentPromptConfig(prisma, kind);
  const config = await prisma.aiAssessmentPromptConfig.findFirst({
    where: { isActive: true, kind },
    orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    select: { basePrompt: true, activePromptVersionId: true },
  });
  return {
    basePrompt: config?.basePrompt ?? KINDS[kind].defaultPrompt,
    promptVersionId: config?.activePromptVersionId ?? null,
  };
}

export async function listAssessmentPromptConfigs(
  prisma: PrismaService,
  kind: AssessmentPromptKind = 'EVALUATION',
) {
  await ensureAssessmentPromptConfig(prisma, kind);
  return prisma.aiAssessmentPromptConfig.findMany({
    where: { kind },
    select,
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
  });
}

export async function upsertAssessmentPromptConfig(
  prisma: PrismaService,
  body: {
    id?: string;
    name?: string;
    basePrompt?: string;
    isActive?: boolean;
    kind?: string;
  },
  actorId: string,
) {
  const requestedKind: AssessmentPromptKind = isAssessmentPromptKind(body.kind)
    ? body.kind
    : 'EVALUATION';
  const name = body.name?.trim() || KINDS[requestedKind].defaultName;
  const basePrompt = body.basePrompt?.trim();
  const isActive = body.isActive ?? false;
  if (!actorId || !basePrompt)
    throw new BadRequestException('Testo del prompt di valutazione mancante');
  return prisma.$transaction(async (tx) => {
    await lockPromptConfigs(tx);
    const existing = body.id
      ? await tx.aiAssessmentPromptConfig.findUnique({
          where: { id: body.id },
        })
      : null;
    if (body.id && !existing)
      throw new NotFoundException('Prompt di valutazione non trovato');
    // La famiglia di un prompt esistente non cambia.
    const kind = (existing?.kind ?? requestedKind) as AssessmentPromptKind;
    const duplicate = await tx.aiAssessmentPromptConfig.findFirst({
      where: { name, ...(body.id ? { id: { not: body.id } } : {}) },
    });
    if (duplicate)
      throw new BadRequestException('Esiste già un prompt con questo nome');
    if (isActive) {
      const active = await tx.aiAssessmentPromptConfig.findMany({
        where: {
          isActive: true,
          kind,
          ...(body.id ? { id: { not: body.id } } : {}),
        },
      });
      for (const config of active) {
        const deactivated = await tx.aiAssessmentPromptConfig.update({
          where: { id: config.id },
          data: {
            isActive: false,
            version: { increment: 1 },
            updatedById: actorId,
          },
        });
        await createAssessmentPromptVersion(tx, deactivated, actorId);
      }
    }
    const saved = body.id
      ? await tx.aiAssessmentPromptConfig.update({
          where: { id: body.id },
          data: {
            name,
            basePrompt,
            isActive,
            version: { increment: 1 },
            updatedById: actorId,
          },
        })
      : await tx.aiAssessmentPromptConfig.create({
          data: {
            kind,
            name,
            basePrompt,
            isActive,
            createdById: actorId,
            updatedById: actorId,
          },
        });
    await createAssessmentPromptVersion(tx, saved, actorId);
    return tx.aiAssessmentPromptConfig.findUniqueOrThrow({
      where: { id: saved.id },
      select,
    });
  });
}

async function createAssessmentPromptVersion(
  tx: Prisma.TransactionClient,
  config: ConfigRecord,
  actorId: string | null,
) {
  const version = await tx.aiPromptVersion.create({
    data: {
      promptType: KINDS[config.kind as AssessmentPromptKind].promptType,
      version: config.version,
      contentJson: {
        name: config.name,
        basePrompt: config.basePrompt,
        isActive: config.isActive,
      },
      assessmentPromptConfigId: config.id,
      createdById: actorId,
    },
    select: { id: true },
  });
  return tx.aiAssessmentPromptConfig.update({
    where: { id: config.id },
    data: { activePromptVersionId: version.id },
  });
}
