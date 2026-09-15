import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  buildGoalValidationTask,
  buildHistorySummaryPrompt,
  buildProposalPrompt,
  buildSpecialistOnboardingQuestionTask,
  buildSystemPrompt,
} from './proposal-prompts';
import {
  AiProvider,
  CycleHistorySummaryInput,
  CycleProposal,
  CycleProposalInput,
  GoalValidationInput,
  SpecialistOnboardingQuestionInput,
} from './proposal-provider-model';
import {
  buildGoalValidationJsonSchema,
  buildHistorySummaryJsonSchema,
  buildProposalJsonSchema,
  buildSpecialistOnboardingQuestionJsonSchema,
} from './proposal-schemas';

export function logDebugPrompt(
  logger: Logger,
  provider: AiProvider,
  model: string,
  inputJson: Record<string, unknown>,
) {
  if (process.env.AI_DEBUG_PROMPT_LOG !== 'true') {
    return;
  }

  logger.log(
    JSON.stringify({
      provider,
      model,
      prompt: inputJson.prompt,
    }),
  );
}

export function buildAuditInput(input: CycleProposalInput) {
  const previousArea = input.previousSnapshot?.areas.find(
    (area) => area.areaId === input.area.id,
  );
  const providerPrompt = buildProposalPrompt(input);

  return {
    area: { name: input.area.name },
    nextVersion: input.nextVersion,
    reason: input.reason,
    previousSnapshot: input.previousSnapshot
      ? {
          rankingGlobal: input.previousSnapshot.rankingGlobal,
          reason: input.previousSnapshot.reason,
          createdAt: input.previousSnapshot.createdAt.toISOString(),
          area: previousArea
            ? {
                realR: previousArea.realR,
                potentialP: previousArea.potentialP,
                areaName: previousArea.area.name,
              }
            : null,
        }
      : null,
    prompt: {
      system: buildSystemPrompt(input),
      user: providerPrompt,
      responseJsonSchema: buildProposalJsonSchema(input),
    },
  };
}

export function buildHistorySummaryAuditInput(input: CycleHistorySummaryInput) {
  return {
    prompt: {
      system:
        'Riassumi storico atleta vecchio per prompt futuri, senza inventare dati.',
      user: buildHistorySummaryPrompt(input),
      responseJsonSchema: buildHistorySummaryJsonSchema(),
    },
  };
}

export function buildSpecialistOnboardingQuestionAuditInput(
  input: SpecialistOnboardingQuestionInput,
) {
  return {
    prompt: {
      system:
        'Genera domande anamnestiche specialistiche personalizzate per area.',
      user: buildSpecialistOnboardingQuestionTask(input),
      responseJsonSchema: buildSpecialistOnboardingQuestionJsonSchema(),
    },
  };
}

export function buildGoalValidationAuditInput(input: GoalValidationInput) {
  return {
    prompt: {
      system: input.basePrompt,
      user: buildGoalValidationTask(input),
      responseJsonSchema: buildGoalValidationJsonSchema(input),
    },
    sportSelection: input.sportSelection ?? null,
    sportSpecializationPromptInstructions:
      input.sportSpecializationPromptInstructions ?? [],
  };
}

export function buildAuditOutput(proposal: Omit<CycleProposal, 'audit'>) {
  return {
    provider: proposal.provider,
    model: proposal.model,
    promptVersion: proposal.promptVersion,
    promptHash: proposal.promptHash,
    summaryText: proposal.summaryText,
    planItems: proposal.planItems,
    questions: proposal.questions,
  };
}

export function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
