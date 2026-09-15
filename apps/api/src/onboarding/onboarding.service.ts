import { Injectable } from '@nestjs/common';
import { AiProposalProviderService } from '../ai-orchestrator/proposal-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  generateSpecialistQuestions,
  getQuestionnaire,
  getStatus,
  saveSportSelection,
  submit,
} from './onboarding-assessment';
import {
  refineGoal,
  validateFinalGoal,
  validateGoal,
} from './onboarding-goals';
import {
  Actor,
  GoalChatMessage,
  OnboardingAnswer,
  SportSelectionPayload,
} from './onboarding-model';
export * from './onboarding-model';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProposalProviderService,
  ) {}
  async getStatus(actor: Actor) {
    return getStatus(this.prisma, actor);
  }

  async getQuestionnaire(actor: Actor) {
    return getQuestionnaire(this.prisma, actor);
  }

  async saveSportSelection(actor: Actor, input: SportSelectionPayload) {
    return saveSportSelection(this.prisma, actor, input);
  }

  async validateGoal(actor: Actor, goalTextInput: string) {
    return validateGoal(this.aiProvider, this.prisma, actor, goalTextInput);
  }

  async refineGoal(
    actor: Actor,
    input: {
      originalGoal?: string;
      currentDraft?: string;
      messages?: GoalChatMessage[];
      userReply?: string;
    },
  ) {
    return refineGoal(this.aiProvider, this.prisma, actor, input);
  }

  async generateSpecialistQuestions(
    actor: Actor,
    goalTextInput: string,
    answers: OnboardingAnswer[],
  ) {
    return generateSpecialistQuestions(
      this.prisma,
      this.aiProvider,
      actor,
      goalTextInput,
      answers,
    );
  }

  async submit(
    actor: Actor,
    goalTextInput: string,
    answers: OnboardingAnswer[],
  ) {
    return submit(this.prisma, actor, goalTextInput, answers);
  }

  async validateFinalGoal(
    actor: Actor,
    goalTextInput: string,
    answers: OnboardingAnswer[],
  ) {
    return validateFinalGoal(
      this.aiProvider,
      this.prisma,
      actor,
      goalTextInput,
      answers,
    );
  }
}
