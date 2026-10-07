import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ASSESSMENT_PROMPT_TYPE,
  DEFAULT_ASSESSMENT_PROMPT,
} from './assessment-evaluation-model';

const DEFAULT_ID = 'assessment-prompt-default';
const select = {
  id: true,
  name: true,
  basePrompt: true,
  version: true,
  isActive: true,
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
};

/** Il prompt plausibile di partenza nasce attivo alla prima lettura, come il prompt obiettivo. */
export async function ensureAssessmentPromptConfig(prisma: PrismaService) {
  await prisma.$transaction(async (tx) => {
    await lockPromptConfigs(tx);
    const config = await tx.aiAssessmentPromptConfig.upsert({
      where: { id: DEFAULT_ID },
      update: {},
      create: {
        id: DEFAULT_ID,
        name: 'valutazione assessment',
        basePrompt: DEFAULT_ASSESSMENT_PROMPT,
        // Attivo solo se nessun'altra configurazione lo e gia.
        isActive: !(await tx.aiAssessmentPromptConfig.count({
          where: { isActive: true },
        })),
      },
    });
    if (!config.activePromptVersionId)
      await createAssessmentPromptVersion(tx, config, null);
  });
}

export async function loadActiveAssessmentPrompt(prisma: PrismaService) {
  await ensureAssessmentPromptConfig(prisma);
  const config = await prisma.aiAssessmentPromptConfig.findFirst({
    where: { isActive: true },
    orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    select: { basePrompt: true, activePromptVersionId: true },
  });
  return {
    basePrompt: config?.basePrompt ?? DEFAULT_ASSESSMENT_PROMPT,
    promptVersionId: config?.activePromptVersionId ?? null,
  };
}

export async function listAssessmentPromptConfigs(prisma: PrismaService) {
  await ensureAssessmentPromptConfig(prisma);
  return prisma.aiAssessmentPromptConfig.findMany({
    select,
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
  });
}

export async function upsertAssessmentPromptConfig(
  prisma: PrismaService,
  body: { id?: string; name?: string; basePrompt?: string; isActive?: boolean },
  actorId: string,
) {
  const name = body.name?.trim() || 'valutazione assessment';
  const basePrompt = body.basePrompt?.trim();
  const isActive = body.isActive ?? false;
  if (!actorId || !basePrompt)
    throw new BadRequestException('Testo del prompt di valutazione mancante');
  return prisma.$transaction(async (tx) => {
    await lockPromptConfigs(tx);
    if (
      body.id &&
      !(await tx.aiAssessmentPromptConfig.findUnique({
        where: { id: body.id },
      }))
    )
      throw new NotFoundException('Prompt di valutazione non trovato');
    const duplicate = await tx.aiAssessmentPromptConfig.findFirst({
      where: { name, ...(body.id ? { id: { not: body.id } } : {}) },
    });
    if (duplicate)
      throw new BadRequestException('Esiste già un prompt con questo nome');
    if (isActive) {
      const active = await tx.aiAssessmentPromptConfig.findMany({
        where: { isActive: true, ...(body.id ? { id: { not: body.id } } : {}) },
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
      promptType: ASSESSMENT_PROMPT_TYPE,
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
