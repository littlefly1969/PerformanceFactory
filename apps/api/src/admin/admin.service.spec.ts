import { AdminService } from './admin.service';
import { AiTuningService } from '../ai-tuning/ai-tuning.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrchestratorService } from '../ai-orchestrator/orchestrator.service';
import { AiProposalProviderService } from '../ai-orchestrator/proposal-provider.service';

type GoalPromptRecord = {
  id: string;
  name: string;
  basePrompt: string;
  version: number;
  isActive: boolean;
  activePromptVersionId: string | null;
  createdById?: string | null;
  updatedById?: string | null;
};

type AreaConfigRecord = {
  id: string;
  areaId: string;
  initialContext: string;
  responseFormatPrompt: string;
  questionnaireLayoutJson: unknown;
  version: number;
  activePromptVersionId: string | null;
  createdById?: string | null;
  updatedById?: string | null;
};

type PromptVersionRecord = {
  id: string;
  promptType: string;
  version: number;
  contentJson: unknown;
  createdAt: Date;
  createdById?: string | null;
  goalPromptConfigId?: string | null;
  areaGenerationConfigId?: string | null;
  sportSpecializationAreaPromptId?: string | null;
  sportSpecializationId?: string | null;
};

const createPrismaFake = () => {
  const goalPrompts: GoalPromptRecord[] = [];
  const areaConfigs: AreaConfigRecord[] = [];
  const promptVersions: PromptVersionRecord[] = [];
  const areas = [{ id: 'area-1', name: 'Footwork' }];

  const prisma = {
    $transaction: async (input: unknown) => {
      if (typeof input === 'function') {
        return (input as (tx: typeof prisma) => unknown)(prisma);
      }
      if (Array.isArray(input)) {
        return Promise.all(input);
      }
      throw new Error('Unsupported transaction input');
    },
    area: {
      findUnique: ({ where }: { where: { id: string } }) =>
        areas.find((area) => area.id === where.id) ?? null,
    },
    aiGoalPromptConfig: {
      findUnique: ({ where }: { where: { id: string } }) =>
        goalPrompts.find((prompt) => prompt.id === where.id) ?? null,
      findMany: ({
        where,
      }: {
        where?: {
          isActive?: boolean;
          id?: { not?: string };
        };
      } = {}) =>
        goalPrompts.filter((prompt) => {
          if (
            where?.isActive !== undefined &&
            prompt.isActive !== where.isActive
          ) {
            return false;
          }
          if (where?.id?.not && prompt.id === where.id.not) {
            return false;
          }
          return true;
        }),
      create: ({ data }: { data: Partial<GoalPromptRecord> }) => {
        const record: GoalPromptRecord = {
          id: data.id ?? `goal-${goalPrompts.length + 1}`,
          name: data.name ?? 'obiettivo',
          basePrompt: data.basePrompt ?? '',
          version: data.version ?? 1,
          isActive: data.isActive ?? true,
          activePromptVersionId: data.activePromptVersionId ?? null,
          createdById: data.createdById ?? null,
          updatedById: data.updatedById ?? null,
        };
        goalPrompts.push(record);
        return { ...record };
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Omit<Partial<GoalPromptRecord>, 'version'> & {
          version?: { increment: number } | number;
        };
      }) => {
        const record = goalPrompts.find((prompt) => prompt.id === where.id);
        if (!record) {
          throw new Error('Goal prompt not found');
        }
        const { version, ...rest } = data;
        Object.assign(record, rest);
        if (typeof data.version === 'object') {
          record.version += data.version.increment;
        } else if (typeof version === 'number') {
          record.version = version;
        }
        return { ...record };
      },
    },
    aiAreaGenerationConfig: {
      findUnique: ({ where }: { where: { id?: string; areaId?: string } }) =>
        areaConfigs.find(
          (config) =>
            (where.id && config.id === where.id) ||
            (where.areaId && config.areaId === where.areaId),
        ) ?? null,
      upsert: ({
        where,
        update,
        create,
      }: {
        where: { areaId: string };
        update: Omit<Partial<AreaConfigRecord>, 'version'> & {
          version?: { increment: number } | number;
        };
        create: Partial<AreaConfigRecord>;
      }) => {
        const existing = areaConfigs.find(
          (config) => config.areaId === where.areaId,
        );
        if (existing) {
          const { version, ...rest } = update;
          Object.assign(existing, rest);
          if (typeof update.version === 'object') {
            existing.version += update.version.increment;
          } else if (typeof version === 'number') {
            existing.version = version;
          }
          return { ...existing };
        }
        const record: AreaConfigRecord = {
          id: create.id ?? `area-config-${areaConfigs.length + 1}`,
          areaId: create.areaId ?? where.areaId,
          initialContext: create.initialContext ?? '',
          responseFormatPrompt: create.responseFormatPrompt ?? '',
          questionnaireLayoutJson: create.questionnaireLayoutJson ?? {},
          version: create.version ?? 1,
          activePromptVersionId: create.activePromptVersionId ?? null,
          createdById: create.createdById ?? null,
          updatedById: create.updatedById ?? null,
        };
        areaConfigs.push(record);
        return { ...record };
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<AreaConfigRecord>;
      }) => {
        const record = areaConfigs.find((config) => config.id === where.id);
        if (!record) {
          throw new Error('Area config not found');
        }
        Object.assign(record, data);
        return { ...record };
      },
    },
    aiPromptVersion: {
      create: ({
        data,
      }: {
        data: Omit<PromptVersionRecord, 'id' | 'createdAt'>;
      }) => {
        const record: PromptVersionRecord = {
          id: `prompt-version-${promptVersions.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        promptVersions.push(record);
        return { id: record.id };
      },
      findMany: ({
        where,
      }: {
        where?: {
          promptType?: string;
          goalPromptConfigId?: string;
          areaGenerationConfigId?: string;
        };
      } = {}) =>
        promptVersions.filter((version) => {
          if (where?.promptType && version.promptType !== where.promptType) {
            return false;
          }
          if (
            where?.goalPromptConfigId &&
            version.goalPromptConfigId !== where.goalPromptConfigId
          ) {
            return false;
          }
          if (
            where?.areaGenerationConfigId &&
            version.areaGenerationConfigId !== where.areaGenerationConfigId
          ) {
            return false;
          }
          return true;
        }),
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    goalPrompts,
    areaConfigs,
    promptVersions,
  };
};

describe('AdminService prompt immutable versions', () => {
  it('creates goal prompt version 1 when creating a prompt', async () => {
    const { prisma, promptVersions } = createPrismaFake();
    const service = new AdminService(
      prisma,
      {} as unknown as OrchestratorService,
    );

    const prompt = await service.upsertGoalPromptConfig(
      {
        name: 'obiettivo',
        basePrompt: 'Prompt obiettivo iniziale',
        isActive: true,
      },
      'tuner-1',
    );

    expect(prompt.version).toBe(1);
    expect(prompt.activePromptVersionId).toBe('prompt-version-1');
    expect(promptVersions).toHaveLength(1);
    expect(promptVersions[0]).toMatchObject({
      promptType: 'GOAL',
      version: 1,
      goalPromptConfigId: prompt.id,
    });
    expect(promptVersions[0].contentJson).toMatchObject({
      basePrompt: 'Prompt obiettivo iniziale',
    });
  });

  it('updates goal prompt by creating version 2 without mutating version 1', async () => {
    const { prisma, promptVersions } = createPrismaFake();
    const service = new AdminService(
      prisma,
      {} as unknown as OrchestratorService,
    );

    const created = await service.upsertGoalPromptConfig(
      {
        name: 'obiettivo',
        basePrompt: 'Versione uno',
        isActive: true,
      },
      'tuner-1',
    );
    const updated = await service.upsertGoalPromptConfig(
      {
        id: created.id,
        name: 'obiettivo',
        basePrompt: 'Versione due',
        isActive: true,
      },
      'tuner-1',
    );

    expect(updated.version).toBe(2);
    expect(updated.activePromptVersionId).toBe('prompt-version-2');
    expect(promptVersions).toHaveLength(2);
    expect(promptVersions[0].contentJson).toMatchObject({
      basePrompt: 'Versione uno',
    });
    expect(promptVersions[1].contentJson).toMatchObject({
      basePrompt: 'Versione due',
    });
  });

  it('versions area generation configs and keeps current config on latest version', async () => {
    const { prisma, areaConfigs, promptVersions } = createPrismaFake();
    const service = new AdminService(
      prisma,
      {} as unknown as OrchestratorService,
    );

    const created = await service.upsertAiAreaGenerationConfig(
      {
        areaId: 'area-1',
        initialContext: 'Contesto uno',
        responseFormatPrompt: 'Formato uno',
        questionnaireLayoutJson: { questionnaire: { questions: 3 } },
      },
      'tuner-1',
    );
    const updated = await service.upsertAiAreaGenerationConfig(
      {
        id: created.id,
        areaId: 'area-1',
        initialContext: 'Contesto due',
        responseFormatPrompt: 'Formato due',
        questionnaireLayoutJson: { questionnaire: { questions: 4 } },
      },
      'tuner-1',
    );

    expect(created.version).toBe(1);
    expect(updated.version).toBe(2);
    expect(areaConfigs[0]).toMatchObject({
      version: 2,
      activePromptVersionId: 'prompt-version-2',
      initialContext: 'Contesto due',
    });
    expect(promptVersions.map((version) => version.version)).toEqual([1, 2]);
    expect(promptVersions[0].contentJson).toMatchObject({
      initialContext: 'Contesto uno',
    });
  });

  it('lists immutable historical versions for a prompt owner', async () => {
    const { prisma } = createPrismaFake();
    const admin = new AdminService(
      prisma,
      {} as unknown as OrchestratorService,
    );
    const tuning = new AiTuningService(
      prisma,
      {} as unknown as AiProposalProviderService,
    );
    const created = await admin.upsertGoalPromptConfig(
      {
        name: 'obiettivo',
        basePrompt: 'Versione uno',
        isActive: true,
      },
      'tuner-1',
    );
    await admin.upsertGoalPromptConfig(
      {
        id: created.id,
        name: 'obiettivo',
        basePrompt: 'Versione due',
        isActive: true,
      },
      'tuner-1',
    );

    const versions = await tuning.listPromptVersions({
      type: 'GOAL',
      ownerId: created.id,
    });

    expect(versions).toHaveLength(2);
    expect(versions.map((version) => version.version)).toEqual([1, 2]);
  });
});
