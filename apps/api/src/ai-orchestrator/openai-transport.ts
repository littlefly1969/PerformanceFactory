import { BadRequestException, Logger } from '@nestjs/common';
import { aiFetch } from '../common/ai-fetch';
import { logDebugPrompt } from './proposal-audit';
import { normalizeProposal } from './proposal-cycle';
import { normalizeGoalValidation } from './proposal-goals';
import { normalizeHistorySummary } from './proposal-history';
import {
  parseGoalValidationJson,
  parseHistorySummaryJson,
  parseProposalJson,
  parseSpecialistOnboardingQuestionJson,
} from './proposal-json';
import {
  buildGoalValidationTask,
  buildHistorySummaryPrompt,
  buildProposalPrompt,
  buildSpecialistOnboardingQuestionTask,
  buildSystemPrompt,
} from './proposal-prompts';
import {
  CycleHistorySummaryInput,
  CycleHistorySummaryResult,
  CycleProposal,
  CycleProposalInput,
  GoalValidationInput,
  GoalValidationResult,
  SpecialistOnboardingQuestionInput,
  SpecialistOnboardingQuestionResult,
} from './proposal-provider-model';
import {
  buildGoalValidationJsonSchema,
  buildHistorySummaryJsonSchema,
  buildProposalJsonSchema,
  buildSpecialistOnboardingQuestionJsonSchema,
} from './proposal-schemas';
import { normalizeSpecialistOnboardingQuestions } from './proposal-specialist';
import { resolveModel } from './provider-config';
export async function generateOpenAiProposal(
  logger: Logger,
  input: CycleProposalInput,
  inputJson: Record<string, unknown>,
  startedAt: number,
): Promise<CycleProposal> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new BadRequestException(
      'OPENAI_API_KEY e obbligatoria per AI_PROVIDER=openai',
    );
  }

  const model = resolveModel('openai');
  logDebugPrompt(logger, 'openai', model, inputJson);
  const response = await aiFetch(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: buildSystemPrompt(input),
          },
          {
            role: 'user',
            content: JSON.stringify(buildProposalPrompt(input)),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'performance_cycle_proposal',
            strict: true,
            schema: buildProposalJsonSchema(input),
          },
        },
      }),
    },
    { provider: 'openai' },
  );

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
  };
  const outputText =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .find((text): text is string => !!text);

  if (!outputText) {
    throw new BadRequestException('La risposta proposta OpenAI e vuota');
  }

  const parsed = parseProposalJson(outputText, 'OpenAI');

  return normalizeProposal(
    input,
    'openai',
    model,
    parsed,
    inputJson,
    startedAt,
    {
      inputTokens: payload.usage?.input_tokens ?? null,
      outputTokens: payload.usage?.output_tokens ?? null,
      totalTokens: payload.usage?.total_tokens ?? null,
    },
  );
}

export async function summarizeOpenAiCycleHistory(
  logger: Logger,
  input: CycleHistorySummaryInput,
  inputJson: Record<string, unknown>,
  startedAt: number,
): Promise<CycleHistorySummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new BadRequestException(
      'OPENAI_API_KEY e obbligatoria per AI_PROVIDER=openai',
    );
  }

  const model = resolveModel('openai');
  logDebugPrompt(logger, 'openai', model, inputJson);
  const response = await aiFetch(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content:
              'Riassumi lo storico atleta per uso tecnico in prompt futuri. Rispondi solo con JSON valido, in italiano, senza inventare dati non presenti.',
          },
          {
            role: 'user',
            content: JSON.stringify(buildHistorySummaryPrompt(input)),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'cycle_history_summary',
            strict: true,
            schema: buildHistorySummaryJsonSchema(),
          },
        },
      }),
    },
    { provider: 'openai' },
  );

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  const outputText =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .find((text): text is string => !!text);
  if (!outputText) {
    throw new BadRequestException('La risposta sunto storico OpenAI e vuota');
  }

  return normalizeHistorySummary(
    'openai',
    model,
    parseHistorySummaryJson(outputText, 'OpenAI'),
    inputJson,
    startedAt,
  );
}

export async function generateOpenAiSpecialistOnboardingQuestions(
  logger: Logger,
  input: SpecialistOnboardingQuestionInput,
  inputJson: Record<string, unknown>,
): Promise<SpecialistOnboardingQuestionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new BadRequestException(
      'OPENAI_API_KEY e obbligatoria per AI_PROVIDER=openai',
    );
  }

  const model = resolveModel('openai');
  logDebugPrompt(logger, 'openai', model, inputJson);
  const response = await aiFetch(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content:
              'Genera domande anamnestiche specialistiche per sport performance. Rispondi solo con JSON valido, in italiano, senza diagnosi o prescrizioni cliniche.',
          },
          {
            role: 'user',
            content: JSON.stringify(
              buildSpecialistOnboardingQuestionTask(input),
            ),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'specialist_onboarding_questions',
            strict: true,
            schema: buildSpecialistOnboardingQuestionJsonSchema(),
          },
        },
      }),
    },
    { provider: 'openai' },
  );

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  const outputText =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .find((text): text is string => !!text);
  if (!outputText) {
    throw new BadRequestException(
      'La risposta domande specialistiche OpenAI e vuota',
    );
  }

  return normalizeSpecialistOnboardingQuestions(
    input,
    'openai',
    model,
    parseSpecialistOnboardingQuestionJson(outputText, 'OpenAI'),
    inputJson,
  );
}

export async function validateOpenAiPerformanceGoal(
  logger: Logger,
  input: GoalValidationInput,
  inputJson: Record<string, unknown>,
): Promise<GoalValidationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new BadRequestException(
      'OPENAI_API_KEY e obbligatoria per AI_PROVIDER=openai',
    );
  }

  const model = resolveModel('openai');
  logDebugPrompt(logger, 'openai', model, inputJson);
  const response = await aiFetch(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: input.basePrompt },
          {
            role: 'user',
            content: JSON.stringify(buildGoalValidationTask(input)),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'goal_validation',
            strict: true,
            schema: buildGoalValidationJsonSchema(input),
          },
        },
      }),
    },
    { provider: 'openai' },
  );

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  const outputText =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .find((text): text is string => !!text);
  if (!outputText) {
    throw new BadRequestException(
      'La risposta validazione obiettivo OpenAI e vuota',
    );
  }
  return normalizeGoalValidation(
    input,
    'openai',
    model,
    parseGoalValidationJson(outputText, 'OpenAI'),
    inputJson,
  );
}
