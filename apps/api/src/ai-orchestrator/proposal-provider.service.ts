import {
  generateTrainingProposal,
  buildTrainingProposalPreview,
} from './training-proposal';
import { TrainingProposalInput } from './proposal-provider-model';
import { Injectable, Logger } from '@nestjs/common';
import {
  buildCycleProposalPreview,
  generateCycleProposal,
} from './proposal-cycle';
import { validatePerformanceGoal } from './proposal-goals';
import { summarizeCycleHistory } from './proposal-history';
import {
  AiProvider,
  CycleHistorySummaryInput,
  CycleHistorySummaryResult,
  CycleProposal,
  CycleProposalInput,
  EXTERNAL_AI_PROVIDERS,
  GoalValidationInput,
  GoalValidationResult,
  SpecialistOnboardingQuestionInput,
  SpecialistOnboardingQuestionResult,
} from './proposal-provider-model';
import { generateSpecialistOnboardingQuestions } from './proposal-specialist';
import { testPrompt } from './proposal-transport';
import { resolveConfiguredProvider } from './provider-config';
export * from './proposal-provider-model';

@Injectable()
export class AiProposalProviderService {
  private readonly logger = new Logger(AiProposalProviderService.name);
  async generateCycleProposal(
    input: CycleProposalInput,
  ): Promise<CycleProposal> {
    return generateCycleProposal(this.logger, input);
  }

  generateTrainingProposal(input: TrainingProposalInput) {
    return generateTrainingProposal(this.logger, input);
  }
  buildTrainingProposalPreview(input: TrainingProposalInput) {
    return buildTrainingProposalPreview(input);
  }
  async summarizeCycleHistory(
    input: CycleHistorySummaryInput,
  ): Promise<CycleHistorySummaryResult> {
    return summarizeCycleHistory(this.logger, input);
  }

  buildCycleProposalPreview(input: CycleProposalInput) {
    return buildCycleProposalPreview(input);
  }

  async testPrompt(input: {
    prompt: string;
    context?: string;
    provider?: AiProvider | 'configured';
  }) {
    return testPrompt(input);
  }

  async validatePerformanceGoal(
    input: GoalValidationInput,
  ): Promise<GoalValidationResult> {
    return validatePerformanceGoal(this.logger, input);
  }

  async generateSpecialistOnboardingQuestions(
    input: SpecialistOnboardingQuestionInput,
  ): Promise<SpecialistOnboardingQuestionResult> {
    return generateSpecialistOnboardingQuestions(this.logger, input);
  }

  static requiresUserConsent(provider = process.env.AI_PROVIDER) {
    return EXTERNAL_AI_PROVIDERS.includes(resolveConfiguredProvider(provider));
  }
}
