import { AreaScheduleInput } from './proposal-provider-model';
import { generateAreaScheduleProposal } from './area-schedule';
import { AiMonitoringService } from '../ai-monitoring/ai-monitoring.service';
import {
  generateTrainingProposal,
  buildTrainingProposalPreview,
} from './training-proposal';
import { TrainingProposalInput } from './proposal-provider-model';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { evaluateAssessment } from './assessment-evaluation';
import { AssessmentEvaluationInput } from './assessment-evaluation-model';
import {
  CalibrationQuestionsInput,
  generateCalibrationQuestions,
} from './calibration-questions';
import { generateMicroTests, MicroTestInput } from './micro-test-generation';
import {
  generateInitialQuestions,
  InitialQuestionsInput,
} from './initial-questions';
import {
  generatePotential,
  PotentialGenerationInput,
} from './potential-generation';
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
  constructor(@Optional() private readonly monitoring?: AiMonitoringService) {}
  private readonly logger = new Logger(AiProposalProviderService.name);
  async generateCycleProposal(
    input: CycleProposalInput,
  ): Promise<CycleProposal> {
    return this.monitoring
      ? this.monitoring.run(
          'cycle_proposal',
          () => generateCycleProposal(this.logger, input),
          input,
        )
      : generateCycleProposal(this.logger, input);
  }

  generateTrainingProposal(input: TrainingProposalInput) {
    return this.monitoring
      ? this.monitoring.run(
          'training_proposal',
          () => generateTrainingProposal(this.logger, input),
          input,
        )
      : generateTrainingProposal(this.logger, input);
  }
  buildTrainingProposalPreview(input: TrainingProposalInput) {
    return buildTrainingProposalPreview(input);
  }
  async summarizeCycleHistory(
    input: CycleHistorySummaryInput,
  ): Promise<CycleHistorySummaryResult> {
    return this.monitoring
      ? this.monitoring.run(
          'cycle_history',
          () => summarizeCycleHistory(this.logger, input),
          input,
        )
      : summarizeCycleHistory(this.logger, input);
  }

  buildCycleProposalPreview(input: CycleProposalInput) {
    return buildCycleProposalPreview(input);
  }

  async testPrompt(input: {
    prompt: string;
    context?: string;
    provider?: AiProvider | 'configured';
  }) {
    return this.monitoring
      ? this.monitoring.run('prompt_test', () => testPrompt(input), input)
      : testPrompt(input);
  }

  async validatePerformanceGoal(
    input: GoalValidationInput,
  ): Promise<GoalValidationResult> {
    return this.monitoring
      ? this.monitoring.run(
          'goal_validation',
          () => validatePerformanceGoal(this.logger, input),
          input,
        )
      : validatePerformanceGoal(this.logger, input);
  }

  async generateSpecialistOnboardingQuestions(
    input: SpecialistOnboardingQuestionInput,
  ): Promise<SpecialistOnboardingQuestionResult> {
    return this.monitoring
      ? this.monitoring.run(
          'specialist_questions',
          () => generateSpecialistOnboardingQuestions(this.logger, input),
          input,
        )
      : generateSpecialistOnboardingQuestions(this.logger, input);
  }

  evaluateAssessment(input: AssessmentEvaluationInput) {
    return this.monitoring
      ? this.monitoring.run(
          'assessment_evaluation',
          () => evaluateAssessment(this.logger, input),
          input,
        )
      : evaluateAssessment(this.logger, input);
  }

  generateCalibrationQuestions(input: CalibrationQuestionsInput) {
    return this.monitoring
      ? this.monitoring.run(
          'calibration_questions',
          () => generateCalibrationQuestions(this.logger, input),
          input,
        )
      : generateCalibrationQuestions(this.logger, input);
  }

  generateInitialQuestions(input: InitialQuestionsInput) {
    return this.monitoring
      ? this.monitoring.run(
          'initial_questions',
          () => generateInitialQuestions(this.logger, input),
          input,
        )
      : generateInitialQuestions(this.logger, input);
  }

  generateMicroTests(input: MicroTestInput) {
    return this.monitoring
      ? this.monitoring.run(
          'micro_tests',
          () => generateMicroTests(this.logger, input),
          input,
        )
      : generateMicroTests(this.logger, input);
  }

  generatePotential(input: PotentialGenerationInput) {
    return this.monitoring
      ? this.monitoring.run(
          'potential',
          () => generatePotential(this.logger, input),
          input,
        )
      : generatePotential(this.logger, input);
  }

  generateAreaScheduleProposal(input: AreaScheduleInput) {
    return this.monitoring
      ? this.monitoring.run(
          'area_schedule',
          () => generateAreaScheduleProposal(this.logger, input),
          input,
        )
      : generateAreaScheduleProposal(this.logger, input);
  }

  static requiresUserConsent(provider = process.env.AI_PROVIDER) {
    return EXTERNAL_AI_PROVIDERS.includes(resolveConfiguredProvider(provider));
  }
}
