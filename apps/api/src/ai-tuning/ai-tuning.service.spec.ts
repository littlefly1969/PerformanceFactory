import { AiProposalProviderService } from '../ai-orchestrator/proposal-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiTuningService } from './ai-tuning.service';

describe('AiTuningService active prompt export', () => {
  it('exports only current active prompt records as readable text', async () => {
    const aiPromptVersionFindMany = jest.fn();
    const goalFindMany = jest.fn().mockResolvedValue([
      {
        id: 'goal-1',
        name: 'obiettivo',
        basePrompt: 'Prompt obiettivo attivo',
        version: 2,
        isActive: true,
        activePromptVersionId: 'goal-version-2',
        activePromptVersion: {
          id: 'goal-version-2',
          version: 2,
          createdAt: new Date('2026-05-01T10:00:00.000Z'),
        },
        updatedAt: new Date('2026-05-01T10:00:00.000Z'),
      },
    ]);
    const areaConfigFindMany = jest.fn().mockResolvedValue([
      {
        id: 'area-config-1',
        areaId: 'area-1',
        initialContext: 'Contesto area corrente',
        responseFormatPrompt: 'Formato risposta corrente',
        questionnaireLayoutJson: { scale: '1-5' },
        version: 3,
        activePromptVersionId: null,
        activePromptVersion: null,
        updatedAt: new Date('2026-05-02T10:00:00.000Z'),
        area: { id: 'area-1', name: 'Tecnica' },
      },
    ]);
    const sportFindMany = jest.fn().mockResolvedValue([
      {
        id: 'sport-1',
        key: 'running',
        label: 'Running',
        isActive: true,
        specializations: [
          {
            id: 'spec-1',
            key: 'road',
            label: 'Strada',
            trainingPrompt: 'Prompt allenamento attivo',
            trainingPromptVersion: 4,
            trainingPromptActive: true,
            activeTrainingPromptVersionId: 'training-version-4',
            activeTrainingPromptVersion: {
              id: 'training-version-4',
              version: 4,
              createdAt: new Date('2026-05-03T10:00:00.000Z'),
            },
            isActive: true,
            updatedAt: new Date('2026-05-03T10:00:00.000Z'),
            prompts: [
              {
                id: 'sport-area-1',
                areaId: 'area-1',
                basePrompt: 'Prompt sport area attivo',
                isEnabledDriver: true,
                version: 5,
                isActive: true,
                activePromptVersionId: 'sport-area-version-5',
                activePromptVersion: {
                  id: 'sport-area-version-5',
                  version: 5,
                  createdAt: new Date('2026-05-04T10:00:00.000Z'),
                },
                updatedAt: new Date('2026-05-04T10:00:00.000Z'),
                area: { id: 'area-1', name: 'Tecnica' },
              },
            ],
          },
        ],
      },
    ]);
    const onboardingFindMany = jest.fn().mockResolvedValue([
      {
        id: 'template-1',
        key: 'goal_context',
        scope: 'GLOBAL',
        areaId: null,
        label: 'Domanda onboarding attiva',
        helpText: 'Aiuta a contestualizzare obiettivo e anamnesi',
        inputType: 'TEXT',
        optionsJson: null,
        required: true,
        orderIndex: 1,
        isActive: true,
        updatedAt: new Date('2026-05-05T10:00:00.000Z'),
        area: null,
      },
    ]);
    const prisma = {
      aiGoalPromptConfig: { findMany: goalFindMany },
      aiAreaGenerationConfig: { findMany: areaConfigFindMany },
      sport: { findMany: sportFindMany },
      onboardingQuestionTemplate: { findMany: onboardingFindMany },
      aiPromptVersion: { findMany: aiPromptVersionFindMany },
    } as unknown as PrismaService;
    const service = new AiTuningService(
      prisma,
      {} as AiProposalProviderService,
    );

    const result = await service.exportActivePrompts(
      new Date('2026-05-31T12:34:56.000Z'),
    );

    expect(result.filename).toBe('active-ai-prompts-20260531-123456.txt');
    expect(result.counts).toEqual({
      goalPromptConfigs: 1,
      areaGenerationConfigs: 1,
      sportSpecializationAreaPrompts: 1,
      trainingPrompts: 1,
      onboardingQuestionTemplates: 1,
    });
    expect(result.content).toContain(
      'Only currently active prompts are included. Historical versions are excluded.',
    );
    expect(result.content).toContain('Prompt obiettivo attivo');
    expect(result.content).toContain('Prompt sport area attivo');
    expect(result.content).toContain('Prompt allenamento attivo');
    expect(result.content).toContain(
      'WARNING: active version pointer missing; exported from current operational field.',
    );
    expect(result.content).not.toContain('password');
    expect(goalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(sportFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(onboardingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(aiPromptVersionFindMany).not.toHaveBeenCalled();
  });
});
