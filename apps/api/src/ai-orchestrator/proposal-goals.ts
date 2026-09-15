import { Logger } from '@nestjs/common';
import { buildGoalValidationAuditInput, hashJson } from './proposal-audit';
import {
  AiProvider,
  GOAL_VALIDATION_VERSION,
  GoalValidationInput,
  GoalValidationResult,
  GoalValidationStatus,
} from './proposal-provider-model';
import {
  validateGeminiPerformanceGoal,
  validateOpenAiPerformanceGoal,
} from './proposal-transport';
import { resolveModel, resolveProvider } from './provider-config';

export async function validatePerformanceGoal(
  logger: Logger,
  input: GoalValidationInput,
): Promise<GoalValidationResult> {
  const provider = resolveProvider();
  const model = resolveModel(provider);
  const inputJson = buildGoalValidationAuditInput(input);
  if (provider === 'openai') {
    return validateOpenAiPerformanceGoal(logger, input, inputJson);
  }
  if (provider === 'gemini') {
    return validateGeminiPerformanceGoal(logger, input, inputJson);
  }
  return normalizeGoalValidation(
    input,
    provider,
    model,
    buildStubGoalValidation(input),
    inputJson,
  );
}

export function normalizeGoalValidation(
  input: GoalValidationInput,
  provider: AiProvider,
  model: string,
  parsed: {
    status?: GoalValidationStatus;
    goal_evaluation?: Record<string, unknown>;
    message_to_user?: string;
    suggested_reformulated_goal?: string | null;
    questions_to_user?: string[];
    normalized_goal?: Record<string, unknown>;
    area_prompts?: Record<string, unknown>;
    next_step?: string;
  },
  inputJson: Record<string, unknown>,
): GoalValidationResult {
  const status = normalizeGoalStatus(parsed.status);
  const accepted = status === 'OK';
  const goalEvaluation = parsed.goal_evaluation ?? {};
  const normalizedGoal = parsed.normalized_goal ?? {};
  const interpretedGoal =
    readNormalizedGoalText(normalizedGoal) ||
    (accepted
      ? `L obiettivo riguarda: ${input.goalText}`
      : 'Obiettivo non utilizzabile per il percorso.');
  const userMessage =
    parsed.message_to_user?.trim() ||
    (accepted
      ? `Ho capito questo obiettivo: ${interpretedGoal}`
      : 'Quanto richiesto non e consono a un percorso di performance sportiva.');
  const areaPrompts = accepted
    ? normalizeAreaPromptsFromValidation(input, parsed.area_prompts ?? {})
    : [];
  return {
    provider,
    model,
    promptVersion: GOAL_VALIDATION_VERSION,
    promptHash: hashJson(inputJson),
    inputJson,
    status,
    accepted,
    interpretedGoal,
    userMessage,
    suggestedReformulatedGoal: parsed.suggested_reformulated_goal ?? null,
    questionsToUser: normalizeGoalClarificationQuestions(
      parsed.questions_to_user,
    ),
    normalizedGoal,
    goalEvaluation,
    nextStep:
      parsed.next_step ??
      (accepted ? 'Procedere con il percorso.' : 'Attendere nuovo obiettivo.'),
    rejectionReason: accepted
      ? null
      : parsed.suggested_reformulated_goal ||
        'Obiettivo non pertinente o non consono.',
    areaPrompts,
  };
}

export function normalizeGoalStatus(status?: string): GoalValidationStatus {
  if (
    status === 'OK' ||
    status === 'NEEDS_ANAMNESIS' ||
    status === 'GOAL_NEEDS_REFORMULATION' ||
    status === 'OUT_OF_SCOPE' ||
    status === 'UNSAFE'
  ) {
    return status;
  }
  return 'GOAL_NEEDS_REFORMULATION';
}

export function readNormalizedGoalText(
  normalizedGoal: Record<string, unknown>,
) {
  const sport = normalizedGoal.sport_or_activity;
  const improvement = normalizedGoal.desired_improvement;
  if (typeof sport === 'string' && typeof improvement === 'string') {
    return `${sport}: ${improvement}`;
  }
  if (typeof improvement === 'string') {
    return improvement;
  }
  return null;
}

export function normalizeGoalClarificationQuestions(questions?: unknown) {
  if (!Array.isArray(questions)) {
    return [];
  }

  const forbiddenPattern =
    /\b(quante volte|quanto spesso|frequenza|giorni alla settimana|ore alla settimana|ti alleni|allenamenti|sessioni|mangi|mangiare|alimentazione|dieta|calorie|proteine|carboidrati|sonno|dormi|stress|attrezzatura|infortuni|dolore)\b/i;

  return questions
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !forbiddenPattern.test(item))
    .slice(0, 3);
}

export function normalizeAreaPromptsFromValidation(
  input: GoalValidationInput,
  areaPrompts: Record<string, unknown>,
) {
  return input.areas.map((area) => {
    const key = areaPromptKey(area.name);
    const prompt =
      areaPrompts[key] ?? areaPrompts[fallbackAreaPromptKey(area.name)];
    return {
      areaId: area.id,
      areaName: area.name,
      promptText:
        prompt && typeof prompt === 'object'
          ? JSON.stringify(prompt)
          : buildFallbackGoalAreaPrompt(input.goalText, area.name),
    };
  });
}

export function sportInstructionsForArea(
  input: GoalValidationInput,
  areaId: string,
) {
  const instructions =
    input.sportSpecializationPromptInstructions?.filter(
      (instruction) => instruction.areaId === areaId,
    ) ?? [];
  if (!instructions.length) {
    return input.sportSelection
      ? `Contesto sportivo selezionato dall atleta: ${input.sportSelection.label}.`
      : '';
  }
  return [
    input.sportSelection
      ? `Contesto sportivo selezionato dall atleta: ${input.sportSelection.label}.`
      : '',
    ...instructions.map(
      (instruction) =>
        `[Prompt sport ${instruction.sportLabel} v${instruction.version}]\n${instruction.basePrompt}`,
    ),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function areaPromptKey(areaName: string) {
  const normalized = areaName.toLowerCase();
  if (normalized.includes('athletic')) {
    return 'preparazione_atletica';
  }
  if (normalized.includes('equipment')) {
    return 'equipaggiamento';
  }
  if (normalized.includes('mental')) {
    return 'mental_training';
  }
  if (normalized.includes('nutrition')) {
    return 'nutrizione';
  }
  if (normalized.includes('physio')) {
    return 'fisioterapia';
  }
  if (normalized.includes('technical') || normalized.includes('tactical')) {
    return 'tecnico_tattica';
  }
  return fallbackAreaPromptKey(areaName);
}

export function fallbackAreaPromptKey(areaName: string) {
  return areaName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function buildStubGoalValidation(input: GoalValidationInput) {
  const normalized = input.goalText.toLowerCase();
  const rejected =
    input.goalText.trim().length < 10 ||
    ['violenza', 'droga', 'doping', 'scommesse', 'soldi facili'].some((term) =>
      normalized.includes(term),
    );
  if (rejected) {
    return {
      status: 'UNSAFE' as GoalValidationStatus,
      goal_evaluation: {
        original_goal: input.goalText,
        is_sport_related: false,
        is_self_improvement_oriented: false,
        is_clear: false,
        is_measurable: false,
        is_safe: false,
        is_legal: false,
        main_issues: ['Obiettivo fuori tema o non sicuro'],
        reasoning_summary:
          'L obiettivo non e utilizzabile in un percorso Performance Factory.',
      },
      message_to_user:
        'Quanto richiesto non e consono a un percorso di performance sportiva.',
      suggested_reformulated_goal: null,
      questions_to_user: [],
      normalized_goal: {
        sport_or_activity: input.sportSelection?.label ?? null,
        performance_dimension: null,
        current_level_assumption: null,
        desired_improvement: null,
        time_horizon: null,
        measurement_criteria: [],
        constraints_to_check: [],
      },
      area_prompts: {},
      next_step: 'Attendere un nuovo obiettivo sicuro e pertinente.',
    };
  }
  const hasOnboarding = input.onboardingProfile || input.onboardingAnswers;
  return {
    status: (hasOnboarding ? 'OK' : 'NEEDS_ANAMNESIS') as GoalValidationStatus,
    goal_evaluation: {
      original_goal: input.goalText,
      is_sport_related: true,
      is_self_improvement_oriented: true,
      is_clear: true,
      is_measurable: true,
      is_safe: true,
      is_legal: true,
      main_issues: hasOnboarding ? [] : ['Mancano dati anamnestici'],
      reasoning_summary:
        'Obiettivo coerente con Performance Factory e orientato al miglioramento personale.',
    },
    message_to_user: hasOnboarding
      ? `Ho capito questo obiettivo: ${input.goalText.trim()}`
      : 'Obiettivo potenzialmente valido. Completa l anamnesi per personalizzare il percorso.',
    suggested_reformulated_goal: null,
    questions_to_user: hasOnboarding
      ? []
      : [
          'Qual e il tuo livello attuale?',
          'Hai limitazioni, dolori o infortuni da considerare?',
          'Quanto tempo puoi dedicare al percorso?',
        ],
    normalized_goal: {
      sport_or_activity: input.sportSelection?.label ?? null,
      performance_dimension: null,
      current_level_assumption: null,
      desired_improvement: input.goalText.trim(),
      time_horizon: null,
      measurement_criteria: [],
      constraints_to_check: [],
    },
    area_prompts: hasOnboarding
      ? Object.fromEntries(
          input.areas.map((area) => [
            areaPromptKey(area.name),
            {
              role: `Modulo ${area.name}`,
              objective: `Personalizzare il lavoro ${area.name} rispetto all obiettivo: ${input.goalText.trim()}${input.sportSelection ? ` nel contesto ${input.sportSelection.label}` : ''}`,
              required_inputs: [
                'obiettivo normalizzato',
                'anamnesi',
                'storico risposte',
              ],
              initial_questionnaire: [],
              exercise_generation_rules: [
                'Genera azioni concrete, misurabili e progressive.',
              ],
              feedback_questions: [],
              progression_rules: ['Progredisci in modo prudente.'],
              measurement_indicators: [
                'aderenza',
                'qualita esecuzione',
                'progresso percepito',
              ],
              safety_limits: ['Non fare diagnosi o prescrizioni cliniche.'],
              output_format: {},
              sport_context: sportInstructionsForArea(input, area.id),
            },
          ]),
        )
      : {},
    next_step: hasOnboarding
      ? 'Congelare obiettivo e generare prompt area.'
      : 'Avviare anamnesi.',
  };
}

export function buildFallbackGoalAreaPrompt(
  goalText: string,
  areaName: string,
) {
  return [
    `Personalizza ogni proposta per l area ${areaName} rispetto all obiettivo dichiarato dall atleta: ${goalText}.`,
    'Prioritizza attivita pratiche, misurabili e progressive che avvicinano l atleta a questo obiettivo.',
    'Le domande di monitoraggio devono verificare aderenza ed esecuzione osservabile collegate all obiettivo.',
    'Mantieni il lavoro revisionabile da un professionista e non inventare diagnosi, dati o vincoli non presenti.',
  ].join(' ');
}
