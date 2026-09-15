import { BadRequestException } from '@nestjs/common';
import { GoalValidationStatus } from './proposal-provider-model';

export function parseProposalJson(outputText: string, providerName: string) {
  try {
    return JSON.parse(outputText) as {
      summaryText?: string;
      planItems?: Array<{ type?: string; title?: string; body?: string }>;
      questions?: Array<{
        text?: string;
        objectiveRef?: string;
        orderIndex?: number;
      }>;
    };
  } catch {
    throw new BadRequestException(
      `La risposta proposta ${providerName} non e un JSON valido`,
    );
  }
}

export function parseHistorySummaryJson(
  outputText: string,
  providerName: string,
) {
  try {
    return JSON.parse(outputText) as {
      summaryText?: string;
      stableSignals?: string[];
      completedWork?: string[];
      unresolvedRisks?: string[];
      progressionNotes?: string[];
    };
  } catch {
    throw new BadRequestException(
      `La risposta sunto storico ${providerName} non e un JSON valido`,
    );
  }
}

export function parseSpecialistOnboardingQuestionJson(
  outputText: string,
  providerName: string,
) {
  try {
    return JSON.parse(outputText) as {
      areaQuestions?: Array<{
        areaId?: string;
        questions?: Array<{ text?: string; orderIndex?: number }>;
      }>;
    };
  } catch {
    throw new BadRequestException(
      `La risposta domande specialistiche ${providerName} non e un JSON valido`,
    );
  }
}

export function parseGoalValidationJson(
  outputText: string,
  providerName: string,
) {
  try {
    return JSON.parse(outputText) as {
      status?: GoalValidationStatus;
      goal_evaluation?: Record<string, unknown>;
      message_to_user?: string;
      suggested_reformulated_goal?: string | null;
      questions_to_user?: string[];
      normalized_goal?: Record<string, unknown>;
      area_prompts?: Record<string, unknown>;
      next_step?: string;
    };
  } catch {
    throw new BadRequestException(
      `La risposta validazione obiettivo ${providerName} non e un JSON valido`,
    );
  }
}
