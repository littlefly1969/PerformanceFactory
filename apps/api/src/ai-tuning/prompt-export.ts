import { PrismaService } from '../prisma/prisma.service';
import { EXPORT_SEPARATOR, ExportPromptEntry } from './ai-tuning-model';

export async function exportActivePrompts(
  prisma: PrismaService,
  now = new Date(),
) {
  const [
    goalPromptConfigs,
    areaGenerationConfigs,
    sports,
    onboardingTemplates,
  ] = await Promise.all([
    prisma.aiGoalPromptConfig.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        basePrompt: true,
        version: true,
        isActive: true,
        activePromptVersionId: true,
        activePromptVersion: {
          select: { id: true, version: true, createdAt: true },
        },
        updatedAt: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }),
    prisma.aiAreaGenerationConfig.findMany({
      select: {
        id: true,
        areaId: true,
        initialContext: true,
        responseFormatPrompt: true,
        questionnaireLayoutJson: true,
        version: true,
        activePromptVersionId: true,
        activePromptVersion: {
          select: { id: true, version: true, createdAt: true },
        },
        updatedAt: true,
        area: { select: { id: true, name: true } },
      },
      orderBy: [{ area: { name: 'asc' } }, { id: 'asc' }],
    }),
    prisma.sport.findMany({
      where: { isActive: true },
      select: {
        id: true,
        key: true,
        label: true,
        isActive: true,
        specializations: {
          where: { isActive: true },
          select: {
            id: true,
            key: true,
            label: true,
            trainingPrompt: true,
            trainingPromptVersion: true,
            trainingPromptActive: true,
            activeTrainingPromptVersionId: true,
            activeTrainingPromptVersion: {
              select: { id: true, version: true, createdAt: true },
            },
            isActive: true,
            updatedAt: true,
            prompts: {
              where: { isActive: true },
              select: {
                id: true,
                areaId: true,
                basePrompt: true,
                isEnabledDriver: true,
                version: true,
                isActive: true,
                activePromptVersionId: true,
                activePromptVersion: {
                  select: { id: true, version: true, createdAt: true },
                },
                updatedAt: true,
                area: { select: { id: true, name: true } },
              },
              orderBy: [{ area: { name: 'asc' } }, { id: 'asc' }],
            },
          },
          orderBy: [{ label: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ label: 'asc' }, { id: 'asc' }],
    }),
    prisma.onboardingQuestionTemplate.findMany({
      where: { isActive: true },
      select: {
        id: true,
        key: true,
        scope: true,
        areaId: true,
        label: true,
        helpText: true,
        inputType: true,
        optionsJson: true,
        required: true,
        orderIndex: true,
        isActive: true,
        updatedAt: true,
        area: { select: { id: true, name: true } },
      },
      orderBy: [
        { scope: 'asc' },
        { area: { name: 'asc' } },
        { orderIndex: 'asc' },
        { id: 'asc' },
      ],
    }),
  ]);

  const sportAreaPrompts = sports.flatMap((sport) =>
    sport.specializations.flatMap((specialization) =>
      specialization.prompts.map((prompt) => ({
        sport,
        specialization,
        prompt,
      })),
    ),
  );
  const trainingPrompts = sports.flatMap((sport) =>
    sport.specializations
      .filter(
        (specialization) =>
          specialization.trainingPromptActive &&
          !!specialization.trainingPrompt,
      )
      .map((specialization) => ({ sport, specialization })),
  );

  const counts = {
    goalPromptConfigs: goalPromptConfigs.length,
    areaGenerationConfigs: areaGenerationConfigs.length,
    sportSpecializationAreaPrompts: sportAreaPrompts.length,
    trainingPrompts: trainingPrompts.length,
    onboardingQuestionTemplates: onboardingTemplates.length,
  };

  const lines = [
    'PerformanceFactory - Export prompt AI attivi',
    `Export timestamp: ${now.toISOString()}`,
    'Environment/app metadata: PerformanceFactory API',
    'Note: Only currently active prompts are included. Historical versions are excluded.',
    '',
    'Counts by prompt type:',
    `- Goal/onboarding prompt configurations: ${counts.goalPromptConfigs}`,
    `- Area generation prompts/configs: ${counts.areaGenerationConfigs}`,
    `- Sport specialization area prompts: ${counts.sportSpecializationAreaPrompts}`,
    `- Trainer/training prompts: ${counts.trainingPrompts}`,
    `- Onboarding question templates: ${counts.onboardingQuestionTemplates}`,
    '',
  ];

  appendSection(
    lines,
    'Goal/onboarding prompt configurations',
    goalPromptConfigs.map((config) =>
      renderExportEntry({
        type: 'GOAL_ONBOARDING_PROMPT',
        id: config.id,
        version: config.version,
        activeVersionId: config.activePromptVersionId,
        activeVersion: config.activePromptVersion?.version,
        scope: `name=${config.name}`,
        flags: [`isActive=${config.isActive}`],
        warning: missingActiveVersionWarning(config.activePromptVersionId),
        blocks: [{ title: 'Prompt', text: config.basePrompt }],
      }),
    ),
  );

  appendSection(
    lines,
    'Area generation prompts/configs',
    areaGenerationConfigs.map((config) =>
      renderExportEntry({
        type: 'AREA_GENERATION_CONFIG',
        id: config.id,
        version: config.version,
        activeVersionId: config.activePromptVersionId,
        activeVersion: config.activePromptVersion?.version,
        scope: `area=${config.area?.name ?? 'n/a'} (${config.areaId})`,
        flags: [],
        warning: missingActiveVersionWarning(config.activePromptVersionId),
        blocks: [
          { title: 'Initial context', text: config.initialContext },
          {
            title: 'Response format prompt',
            text: config.responseFormatPrompt,
          },
          {
            title: 'Questionnaire layout JSON',
            text: JSON.stringify(config.questionnaireLayoutJson, null, 2),
          },
        ],
      }),
    ),
  );

  appendSection(
    lines,
    'Sport specialization area prompts',
    sportAreaPrompts.map(({ sport, specialization, prompt }) =>
      renderExportEntry({
        type: 'SPORT_SPECIALIZATION_AREA_PROMPT',
        id: prompt.id,
        version: prompt.version,
        activeVersionId: prompt.activePromptVersionId,
        activeVersion: prompt.activePromptVersion?.version,
        scope: [
          `sport=${sport.label} (${sport.id})`,
          `specialization=${specialization.label} (${specialization.id})`,
          `area=${prompt.area?.name ?? 'n/a'} (${prompt.areaId})`,
        ].join(' | '),
        flags: [
          `sportActive=${sport.isActive}`,
          `specializationActive=${specialization.isActive}`,
          `isActive=${prompt.isActive}`,
          `isEnabledDriver=${prompt.isEnabledDriver}`,
        ],
        warning: missingActiveVersionWarning(prompt.activePromptVersionId),
        blocks: [{ title: 'Prompt', text: prompt.basePrompt }],
      }),
    ),
  );

  appendSection(
    lines,
    'Trainer/training prompts',
    trainingPrompts.map(({ sport, specialization }) =>
      renderExportEntry({
        type: 'TRAINING_PROMPT',
        id: specialization.id,
        version: specialization.trainingPromptVersion,
        activeVersionId: specialization.activeTrainingPromptVersionId,
        activeVersion: specialization.activeTrainingPromptVersion?.version,
        scope: [
          `sport=${sport.label} (${sport.id})`,
          `specialization=${specialization.label} (${specialization.id})`,
        ].join(' | '),
        flags: [
          `sportActive=${sport.isActive}`,
          `specializationActive=${specialization.isActive}`,
          `trainingPromptActive=${specialization.trainingPromptActive}`,
        ],
        warning: missingActiveVersionWarning(
          specialization.activeTrainingPromptVersionId,
        ),
        blocks: [
          {
            title: 'Prompt',
            text: specialization.trainingPrompt ?? '',
          },
        ],
      }),
    ),
  );

  appendSection(
    lines,
    'Other current AI prompt/config records',
    onboardingTemplates.map((template) =>
      renderExportEntry({
        type: 'ONBOARDING_QUESTION_TEMPLATE',
        id: template.id,
        version: null,
        activeVersionId: null,
        activeVersion: null,
        scope: [
          `key=${template.key}`,
          `scope=${template.scope}`,
          `area=${template.area?.name ?? 'n/a'} (${template.areaId ?? 'global'})`,
        ].join(' | '),
        flags: [
          `isActive=${template.isActive}`,
          `required=${template.required}`,
          `inputType=${template.inputType}`,
          `orderIndex=${template.orderIndex}`,
        ],
        blocks: [
          { title: 'Label', text: template.label },
          { title: 'Help text', text: template.helpText ?? '' },
          {
            title: 'Options JSON',
            text: JSON.stringify(template.optionsJson ?? {}, null, 2),
          },
        ],
      }),
    ),
  );

  const filename = `active-ai-prompts-${formatExportTimestamp(now)}.txt`;
  return {
    filename,
    content: `${lines.join('\n')}\n`,
    counts,
  };
}

export function appendSection(
  lines: string[],
  title: string,
  renderedEntries: string[],
) {
  lines.push(EXPORT_SEPARATOR, title, EXPORT_SEPARATOR);
  if (!renderedEntries.length) {
    lines.push('No active records found.', '');
    return;
  }
  lines.push(...renderedEntries);
}

export function renderExportEntry(entry: ExportPromptEntry) {
  return [
    `Type: ${entry.type}`,
    `ID: ${entry.id}`,
    `Version: ${entry.activeVersion ?? entry.version ?? 'n/a'}`,
    `Active version ID: ${entry.activeVersionId ?? 'n/a'}`,
    `Scope: ${entry.scope}`,
    `Flags: ${entry.flags?.length ? entry.flags.join(', ') : 'n/a'}`,
    entry.warning ? entry.warning : null,
    ...entry.blocks.flatMap((block) => [
      `${block.title}:`,
      '```text',
      block.text,
      '```',
    ]),
    '',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

export function missingActiveVersionWarning(activeVersionId?: string | null) {
  return activeVersionId
    ? null
    : 'WARNING: active version pointer missing; exported from current operational field.';
}

export function formatExportTimestamp(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return [
    date.getUTCFullYear().toString(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}
