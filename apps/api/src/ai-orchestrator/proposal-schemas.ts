import { areaPromptKey } from './proposal-goals';
import {
  CycleProposalInput,
  CycleQuestionLayout,
  DEFAULT_OPTIONS,
  GoalValidationInput,
  QUESTIONS_PER_AREA,
} from './proposal-provider-model';

export function buildGoalValidationJsonSchema(
  input: GoalValidationInput,
  options?: {
    includePropertyOrdering?: boolean;
  },
) {
  const goalEvaluationSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'original_goal',
      'is_sport_related',
      'is_self_improvement_oriented',
      'is_clear',
      'is_measurable',
      'is_safe',
      'is_legal',
      'main_issues',
      'reasoning_summary',
    ],
    properties: {
      original_goal: { type: 'string' },
      is_sport_related: { type: 'boolean' },
      is_self_improvement_oriented: { type: 'boolean' },
      is_clear: { type: 'boolean' },
      is_measurable: { type: 'boolean' },
      is_safe: { type: 'boolean' },
      is_legal: { type: 'boolean' },
      main_issues: { type: 'array', items: { type: 'string' } },
      reasoning_summary: { type: 'string' },
    },
  };
  const normalizedGoalSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'sport_or_activity',
      'performance_dimension',
      'current_level_assumption',
      'desired_improvement',
      'time_horizon',
      'measurement_criteria',
      'constraints_to_check',
    ],
    properties: {
      sport_or_activity: { type: ['string', 'null'] },
      performance_dimension: { type: ['string', 'null'] },
      current_level_assumption: { type: ['string', 'null'] },
      desired_improvement: { type: ['string', 'null'] },
      time_horizon: { type: ['string', 'null'] },
      measurement_criteria: { type: 'array', items: { type: 'string' } },
      constraints_to_check: { type: 'array', items: { type: 'string' } },
    },
  };
  const areaPromptSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'role',
      'objective',
      'required_inputs',
      'initial_questionnaire',
      'exercise_generation_rules',
      'feedback_questions',
      'progression_rules',
      'measurement_indicators',
      'safety_limits',
      'output_format',
    ],
    properties: {
      role: { type: 'string' },
      objective: { type: 'string' },
      required_inputs: { type: 'array', items: { type: 'string' } },
      initial_questionnaire: { type: 'array', items: { type: 'string' } },
      exercise_generation_rules: { type: 'array', items: { type: 'string' } },
      feedback_questions: { type: 'array', items: { type: 'string' } },
      progression_rules: { type: 'array', items: { type: 'string' } },
      measurement_indicators: { type: 'array', items: { type: 'string' } },
      safety_limits: { type: 'array', items: { type: 'string' } },
      output_format: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
    },
  };
  const nullableAreaPromptSchema = {
    anyOf: [areaPromptSchema, { type: 'null' }],
  };
  const areaPromptKeys = Array.from(
    new Set(input.areas.map((area) => areaPromptKey(area.name))),
  );
  const areaPromptProperties = Object.fromEntries(
    areaPromptKeys.map((key) => [key, nullableAreaPromptSchema]),
  );
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'status',
      'goal_evaluation',
      'message_to_user',
      'suggested_reformulated_goal',
      'questions_to_user',
      'normalized_goal',
      'area_prompts',
      'next_step',
    ],
    properties: {
      status: {
        type: 'string',
        enum: [
          'OK',
          'NEEDS_ANAMNESIS',
          'GOAL_NEEDS_REFORMULATION',
          'OUT_OF_SCOPE',
          'UNSAFE',
        ],
      },
      goal_evaluation: goalEvaluationSchema,
      message_to_user: { type: 'string' },
      suggested_reformulated_goal: { type: ['string', 'null'] },
      questions_to_user: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 5,
      },
      normalized_goal: normalizedGoalSchema,
      area_prompts: {
        type: 'object',
        additionalProperties: false,
        required: areaPromptKeys,
        properties: areaPromptProperties,
      },
      next_step: { type: 'string' },
    },
    ...(options?.includePropertyOrdering
      ? {
          propertyOrdering: [
            'status',
            'goal_evaluation',
            'message_to_user',
            'suggested_reformulated_goal',
            'questions_to_user',
            'normalized_goal',
            'area_prompts',
            'next_step',
          ],
        }
      : {}),
  };
}

export function buildSpecialistOnboardingQuestionJsonSchema(options?: {
  includePropertyOrdering?: boolean;
}) {
  const questionSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'orderIndex'],
    properties: {
      text: { type: 'string' },
      orderIndex: { type: 'integer', minimum: 1, maximum: 3 },
    },
    ...(options?.includePropertyOrdering
      ? { propertyOrdering: ['text', 'orderIndex'] }
      : {}),
  };
  const areaSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['areaId', 'questions'],
    properties: {
      areaId: { type: 'string' },
      questions: {
        type: 'array',
        minItems: QUESTIONS_PER_AREA,
        maxItems: QUESTIONS_PER_AREA,
        items: questionSchema,
      },
    },
    ...(options?.includePropertyOrdering
      ? { propertyOrdering: ['areaId', 'questions'] }
      : {}),
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['areaQuestions'],
    properties: {
      areaQuestions: {
        type: 'array',
        minItems: 1,
        items: areaSchema,
      },
    },
    ...(options?.includePropertyOrdering
      ? { propertyOrdering: ['areaQuestions'] }
      : {}),
  };
}

export function buildProposalJsonSchema(
  input: CycleProposalInput,
  options?: {
    includePropertyOrdering?: boolean;
  },
) {
  const questionLayout = cycleQuestionLayout(input);
  const planItemSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'title', 'body'],
    properties: {
      type: { type: 'string' },
      title: { type: 'string' },
      body: { type: 'string' },
    },
    ...(options?.includePropertyOrdering
      ? { propertyOrdering: ['type', 'title', 'body'] }
      : {}),
  };

  const questionSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'objectiveRef', 'orderIndex'],
    properties: {
      text: { type: 'string' },
      objectiveRef: { type: 'string' },
      orderIndex: {
        type: 'integer',
        minimum: 1,
        maximum: questionLayout.questions,
      },
    },
    ...(options?.includePropertyOrdering
      ? { propertyOrdering: ['text', 'objectiveRef', 'orderIndex'] }
      : {}),
  };

  return {
    type: 'object',
    additionalProperties: false,
    required: ['summaryText', 'planItems', 'questions'],
    properties: {
      summaryText: { type: 'string' },
      planItems: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: planItemSchema,
      },
      questions: {
        type: 'array',
        minItems: questionLayout.questions,
        maxItems: questionLayout.questions,
        items: questionSchema,
      },
    },
    ...(options?.includePropertyOrdering
      ? { propertyOrdering: ['summaryText', 'planItems', 'questions'] }
      : {}),
  };
}

export function buildHistorySummaryJsonSchema(options?: {
  includePropertyOrdering?: boolean;
}) {
  const stringArraySchema = {
    type: 'array',
    items: { type: 'string' },
    maxItems: 12,
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'summaryText',
      'stableSignals',
      'completedWork',
      'unresolvedRisks',
      'progressionNotes',
    ],
    properties: {
      summaryText: { type: 'string' },
      stableSignals: stringArraySchema,
      completedWork: stringArraySchema,
      unresolvedRisks: stringArraySchema,
      progressionNotes: stringArraySchema,
    },
    ...(options?.includePropertyOrdering
      ? {
          propertyOrdering: [
            'summaryText',
            'stableSignals',
            'completedWork',
            'unresolvedRisks',
            'progressionNotes',
          ],
        }
      : {}),
  };
}

export function cycleQuestionLayout(
  input: CycleProposalInput,
): CycleQuestionLayout {
  const raw =
    input.context.guidance.areaGenerationConfig?.questionnaireLayoutJson;
  const root =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const questionnaire =
    root.questionnaire &&
    typeof root.questionnaire === 'object' &&
    !Array.isArray(root.questionnaire)
      ? (root.questionnaire as Record<string, unknown>)
      : root;
  const rawQuestions = questionnaire.questions;
  const questions =
    typeof rawQuestions === 'number' &&
    Number.isInteger(rawQuestions) &&
    rawQuestions > 0
      ? Math.min(rawQuestions, 10)
      : QUESTIONS_PER_AREA;
  const rawOptions = questionnaire.answerOptions;
  const answerOptions = Array.isArray(rawOptions)
    ? rawOptions
        .map((option) => {
          if (!option || typeof option !== 'object' || Array.isArray(option)) {
            return null;
          }
          const item = option as Record<string, unknown>;
          const label = typeof item.label === 'string' ? item.label.trim() : '';
          const score =
            typeof item.score === 'number'
              ? item.score
              : typeof item.value === 'number'
                ? item.value
                : null;
          return label && score !== null ? { label, score } : null;
        })
        .filter(
          (option): option is { label: string; score: number } =>
            option !== null,
        )
    : [];
  return {
    questions,
    answerOptions: answerOptions.length ? answerOptions : DEFAULT_OPTIONS,
    raw: raw ?? null,
  };
}

export function buildTrainingProposalJsonSchema(
  input: import('./proposal-provider-model').TrainingProposalInput,
  options?: { includePropertyOrdering?: boolean },
) {
  const base = buildProposalJsonSchema(input, options);
  const { minSessionsPerWeek, maxSessionsPerWeek } =
    input.trainingConstraints.prescription;
  const properties = {
    type: { type: 'string' },
    title: { type: 'string' },
    body: { type: 'string' },
    dayOffset: { type: 'integer', minimum: 0, maximum: 13 },
    durationMinutes: {
      type: 'integer',
      minimum: 1,
      maximum: input.trainingConstraints.availability.sessionDurationMinutes,
    },
    equipment: { type: ['string', 'null'] },
    sets: { type: ['integer', 'null'], minimum: 1 },
    reps: { type: ['string', 'null'] },
    restSeconds: { type: ['integer', 'null'], minimum: 0 },
  };
  return {
    ...base,
    required: ['summaryText', 'sessionsPerWeek', 'planItems', 'questions'],
    properties: {
      ...base.properties,
      sessionsPerWeek: {
        type: 'integer',
        minimum: minSessionsPerWeek,
        maximum: maxSessionsPerWeek,
      },
      planItems: {
        type: 'array',
        minItems: 2 * minSessionsPerWeek,
        maxItems: 2 * maxSessionsPerWeek,
        items: {
          type: 'object',
          additionalProperties: false,
          required: Object.keys(properties),
          properties,
          ...(options?.includePropertyOrdering
            ? { propertyOrdering: Object.keys(properties) }
            : {}),
        },
      },
    },
    ...(options?.includePropertyOrdering
      ? {
          propertyOrdering: [
            'summaryText',
            'sessionsPerWeek',
            'planItems',
            'questions',
          ],
        }
      : {}),
  };
}

/** Giorni proponibili all'area: liberi e, dove servono, condivisi con lo sport. */
export function areaDayOffsets(
  input: Pick<
    import('./proposal-provider-model').AreaScheduleInput,
    'freeDayOffsets' | 'sharedDayOffsets'
  >,
) {
  return [...input.freeDayOffsets, ...input.sharedDayOffsets].sort(
    (a, b) => a - b,
  );
}

export function buildAreaScheduleJsonSchema(
  input: import('./proposal-provider-model').AreaScheduleInput,
  options?: { includePropertyOrdering?: boolean },
) {
  const base = buildProposalJsonSchema(input, options);
  const { minSessionsPerWeek, maxSessionsPerWeek } =
    input.scheduleConstraints.prescription;
  const weeks = Math.ceil(input.areaWindow.windowDays / 7);
  const offsets = areaDayOffsets(input);
  const properties = {
    type: { type: 'string' },
    title: { type: 'string' },
    body: { type: 'string' },
    // Solo i giorni ammessi all'area sono proponibili.
    dayOffset: { type: 'integer', enum: offsets },
    durationMinutes: {
      type: 'integer',
      minimum: 1,
      maximum: input.scheduleConstraints.availability.sessionDurationMinutes,
    },
    equipment: { type: ['string', 'null'] },
    sets: { type: ['integer', 'null'], minimum: 1 },
    reps: { type: ['string', 'null'] },
    restSeconds: { type: ['integer', 'null'], minimum: 0 },
  };
  return {
    ...base,
    required: ['summaryText', 'sessionsPerWeek', 'planItems', 'questions'],
    properties: {
      ...base.properties,
      sessionsPerWeek: {
        type: 'integer',
        minimum: minSessionsPerWeek,
        maximum: maxSessionsPerWeek,
      },
      planItems: {
        type: 'array',
        minItems: weeks * minSessionsPerWeek,
        maxItems: Math.min(weeks * maxSessionsPerWeek, offsets.length),
        items: {
          type: 'object',
          additionalProperties: false,
          required: Object.keys(properties),
          properties,
          ...(options?.includePropertyOrdering
            ? { propertyOrdering: Object.keys(properties) }
            : {}),
        },
      },
    },
    ...(options?.includePropertyOrdering
      ? {
          propertyOrdering: [
            'summaryText',
            'sessionsPerWeek',
            'planItems',
            'questions',
          ],
        }
      : {}),
  };
}
