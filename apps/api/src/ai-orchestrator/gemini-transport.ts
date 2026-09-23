import { requestStructuredProposal } from './proposal-structured-transport';
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
export async function generateGeminiProposal(
  logger: Logger,
  input: CycleProposalInput,
  inputJson: Record<string, unknown>,
  startedAt: number,
): Promise<CycleProposal> {
  const model = resolveModel('gemini');
  const { outputText, usage } = await requestStructuredProposal(
    logger,
    'gemini',
    model,
    inputJson,
    {
      system: buildSystemPrompt(input),
      user: buildProposalPrompt(input),
      schema: buildProposalJsonSchema(input, { includePropertyOrdering: true }),
    },
    'performance_cycle_proposal',
  );
  return normalizeProposal(
    input,
    'gemini',
    model,
    parseProposalJson(outputText, 'Gemini'),
    inputJson,
    startedAt,
    usage,
  );
}

export async function summarizeGeminiCycleHistory(
  logger: Logger,
  input: CycleHistorySummaryInput,
  inputJson: Record<string, unknown>,
  startedAt: number,
): Promise<CycleHistorySummaryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new BadRequestException(
      'GEMINI_API_KEY e obbligatoria per AI_PROVIDER=gemini',
    );
  }

  const model = resolveModel('gemini');
  logDebugPrompt(logger, 'gemini', model, inputJson);
  const modelName = model.startsWith('models/')
    ? model.slice('models/'.length)
    : model;
  const response = await aiFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: 'Riassumi lo storico atleta per uso tecnico in prompt futuri. Rispondi solo con JSON valido, in italiano, senza inventare dati non presenti.',
            },
          ],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: JSON.stringify(buildHistorySummaryPrompt(input)) }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: buildHistorySummaryJsonSchema({
            includePropertyOrdering: true,
          }),
        },
      }),
    },
    { provider: 'gemini' },
  );

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  const outputText = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => !!text)
    .join('');
  if (!outputText) {
    throw new BadRequestException(
      `La risposta sunto storico Gemini e vuota: ${
        payload.promptFeedback?.blockReason ?? 'risposta vuota'
      }`,
    );
  }

  return normalizeHistorySummary(
    'gemini',
    model,
    parseHistorySummaryJson(outputText, 'Gemini'),
    inputJson,
    startedAt,
  );
}

export async function generateGeminiSpecialistOnboardingQuestions(
  logger: Logger,
  input: SpecialistOnboardingQuestionInput,
  inputJson: Record<string, unknown>,
): Promise<SpecialistOnboardingQuestionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new BadRequestException(
      'GEMINI_API_KEY e obbligatoria per AI_PROVIDER=gemini',
    );
  }

  const model = resolveModel('gemini');
  logDebugPrompt(logger, 'gemini', model, inputJson);
  const modelName = model.startsWith('models/')
    ? model.slice('models/'.length)
    : model;
  const response = await aiFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: 'Genera domande anamnestiche specialistiche per sport performance. Rispondi solo con JSON valido, in italiano, senza diagnosi o prescrizioni cliniche.',
            },
          ],
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: JSON.stringify(
                  buildSpecialistOnboardingQuestionTask(input),
                ),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: buildSpecialistOnboardingQuestionJsonSchema({
            includePropertyOrdering: true,
          }),
        },
      }),
    },
    { provider: 'gemini' },
  );

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  const outputText = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => !!text)
    .join('');
  if (!outputText) {
    throw new BadRequestException(
      `La risposta domande specialistiche Gemini e vuota: ${
        payload.promptFeedback?.blockReason ?? 'risposta vuota'
      }`,
    );
  }

  return normalizeSpecialistOnboardingQuestions(
    input,
    'gemini',
    model,
    parseSpecialistOnboardingQuestionJson(outputText, 'Gemini'),
    inputJson,
  );
}

export async function validateGeminiPerformanceGoal(
  logger: Logger,
  input: GoalValidationInput,
  inputJson: Record<string, unknown>,
): Promise<GoalValidationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new BadRequestException(
      'GEMINI_API_KEY e obbligatoria per AI_PROVIDER=gemini',
    );
  }

  const model = resolveModel('gemini');
  logDebugPrompt(logger, 'gemini', model, inputJson);
  const modelName = model.startsWith('models/')
    ? model.slice('models/'.length)
    : model;
  const response = await aiFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.basePrompt }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: JSON.stringify(buildGoalValidationTask(input)) }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: buildGoalValidationJsonSchema(input, {
            includePropertyOrdering: true,
          }),
        },
      }),
    },
    { provider: 'gemini' },
  );

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  const outputText = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => !!text)
    .join('');
  if (!outputText) {
    throw new BadRequestException(
      `La risposta validazione obiettivo Gemini e vuota: ${
        payload.promptFeedback?.blockReason ?? 'risposta vuota'
      }`,
    );
  }
  return normalizeGoalValidation(
    input,
    'gemini',
    model,
    parseGoalValidationJson(outputText, 'Gemini'),
    inputJson,
  );
}
