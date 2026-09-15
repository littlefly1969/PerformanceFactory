import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AiProposalProviderService,
  GoalValidationResult,
} from '../ai-orchestrator/proposal-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertAthlete, serializeAnswer } from './onboarding-answers';
import { prepareCompletedOnboarding } from './onboarding-assessment';
import { Actor, GoalChatMessage, OnboardingAnswer } from './onboarding-model';
import { requireSportContext } from './onboarding-sports';

export async function validateGoal(
  aiProvider: AiProposalProviderService,
  prisma: PrismaService,
  actor: Actor,
  goalTextInput: string,
) {
  assertAthlete(actor);
  const goalText = goalTextInput.trim();
  if (goalText.length < 10) {
    return {
      accepted: false,
      interpretedGoal: '',
      userMessage:
        'Scrivi un obiettivo piu concreto legato a sport, allenamento o performance.',
      rejectionReason: 'Obiettivo troppo breve.',
    };
  }

  const goalPromptConfig = await loadGoalPromptConfig(prisma);
  const sportContext = await requireSportContext(prisma, actor.id);
  const areas = sportContext.areas;
  const validation = await aiProvider.validatePerformanceGoal({
    userId: actor.id,
    goalText,
    basePrompt: goalPromptConfig.basePrompt,
    areas,
    sportSelection: sportContext.selection,
    sportSpecializationPromptInstructions: sportContext.instructions,
  });

  await saveGoalValidation(prisma, actor.id, goalText, validation, false);

  return {
    status: validation.status,
    accepted: validation.accepted,
    canProceedToAnamnesis:
      validation.status === 'OK' || validation.status === 'NEEDS_ANAMNESIS',
    interpretedGoal: validation.interpretedGoal,
    userMessage: validation.userMessage,
    suggestedReformulatedGoal: validation.suggestedReformulatedGoal,
    questionsToUser: validation.questionsToUser,
    normalizedGoal: validation.normalizedGoal,
    rejectionReason: validation.rejectionReason,
    nextStep: validation.nextStep,
  };
}

export async function refineGoal(
  aiProvider: AiProposalProviderService,
  prisma: PrismaService,
  actor: Actor,
  input: {
    originalGoal?: string;
    currentDraft?: string;
    messages?: GoalChatMessage[];
    userReply?: string;
  },
) {
  assertAthlete(actor);
  const originalGoal = (input.originalGoal ?? '').trim();
  const currentDraft = (input.currentDraft ?? originalGoal).trim();
  const userReply = (input.userReply ?? '').trim();
  const messages = (input.messages ?? [])
    .filter(
      (message) =>
        (message.role === 'user' || message.role === 'assistant') &&
        message.content.trim(),
    )
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));

  if (!originalGoal || originalGoal.length < 10) {
    throw new BadRequestException('Inserisci prima un obiettivo iniziale.');
  }
  if (!userReply || userReply.length < 2) {
    throw new BadRequestException(
      'Scrivi una risposta per definire meglio l obiettivo.',
    );
  }

  const refinedGoalInput = [
    `Obiettivo originale: ${originalGoal}`,
    currentDraft ? `Bozza corrente: ${currentDraft}` : '',
    `Nuova risposta utente: ${userReply}`,
  ]
    .filter(Boolean)
    .join('\n');
  const goalPromptConfig = await loadGoalPromptConfig(prisma);
  const sportContext = await requireSportContext(prisma, actor.id);
  const areas = sportContext.areas;
  const validation = await aiProvider.validatePerformanceGoal({
    userId: actor.id,
    goalText: refinedGoalInput,
    basePrompt: goalPromptConfig.basePrompt,
    areas,
    sportSelection: sportContext.selection,
    sportSpecializationPromptInstructions: sportContext.instructions,
    refinementContext: {
      originalGoal,
      currentDraft,
      messages,
      userReply,
    },
  });
  const refinedGoalText =
    validation.suggestedReformulatedGoal?.trim() ||
    validation.interpretedGoal?.trim() ||
    currentDraft ||
    originalGoal;

  await saveGoalValidation(
    prisma,
    actor.id,
    refinedGoalText,
    validation,
    false,
  );

  return {
    status: validation.status,
    accepted: validation.accepted,
    canProceedToAnamnesis:
      validation.status === 'OK' || validation.status === 'NEEDS_ANAMNESIS',
    interpretedGoal: validation.interpretedGoal,
    userMessage: validation.userMessage,
    assistantMessage: validation.questionsToUser.length
      ? `${validation.userMessage}\n\n${validation.questionsToUser.join('\n')}`
      : validation.userMessage,
    suggestedReformulatedGoal: validation.suggestedReformulatedGoal,
    refinedGoalText,
    questionsToUser: validation.questionsToUser,
    normalizedGoal: validation.normalizedGoal,
    rejectionReason: validation.rejectionReason,
    nextStep: validation.nextStep,
  };
}

export async function validateFinalGoal(
  aiProvider: AiProposalProviderService,
  prisma: PrismaService,
  actor: Actor,
  goalTextInput: string,
  answers: OnboardingAnswer[],
) {
  assertAthlete(actor);
  const prepared = await prepareCompletedOnboarding(
    prisma,
    actor,
    goalTextInput,
    answers,
  );
  const {
    goalText,
    normalizedAnswers,
    profile,
    configuredAreas,
    scoredAreas,
    sportContext,
  } = prepared;
  const onboardingAnswersForAi = normalizedAnswers.map((answer) =>
    serializeAnswer(answer),
  );
  const validation = await aiProvider.validatePerformanceGoal({
    userId: actor.id,
    goalText,
    basePrompt: (await loadGoalPromptConfig(prisma)).basePrompt,
    areas: configuredAreas.length
      ? configuredAreas
      : scoredAreas.map((area) => ({
          id: area.areaId,
          name: area.areaName,
        })),
    sportSelection: sportContext.selection,
    sportSpecializationPromptInstructions: sportContext.instructions,
    onboardingProfile: profile,
    onboardingAnswers: onboardingAnswersForAi,
  });
  await saveFinalGoalValidation(prisma, actor.id, goalText, validation);
  if (validation.status !== 'OK') {
    throw new ConflictException({
      code: 'GOAL_RISK_ACK_REQUIRED',
      message: validation.userMessage,
      goalValidation: {
        status: validation.status,
        interpretedGoal: validation.interpretedGoal,
        userMessage: validation.userMessage,
        suggestedReformulatedGoal: validation.suggestedReformulatedGoal,
        questionsToUser: validation.questionsToUser,
        rejectionReason: validation.rejectionReason,
        nextStep: validation.nextStep,
      },
    });
  }

  return {
    status: validation.status,
    accepted: validation.accepted,
    interpretedGoal: validation.interpretedGoal,
    userMessage: validation.userMessage,
    suggestedReformulatedGoal: validation.suggestedReformulatedGoal,
    questionsToUser: validation.questionsToUser,
    normalizedGoal: validation.normalizedGoal,
    rejectionReason: validation.rejectionReason,
    nextStep: validation.nextStep,
  };
}

export async function saveFinalGoalValidation(
  prisma: PrismaService,
  userId: string,
  goalText: string,
  validation: GoalValidationResult,
) {
  const goal = await prisma.userPerformanceGoal.upsert({
    where: { userId },
    update: {
      goalText,
      interpretedGoal: validation.interpretedGoal,
      normalizedGoal: validation.normalizedGoal as Prisma.InputJsonValue,
      goalEvaluation: validation.goalEvaluation as Prisma.InputJsonValue,
      suggestedReformulatedGoal: validation.suggestedReformulatedGoal,
      questionsToUser: validation.questionsToUser as Prisma.InputJsonValue,
      nextStep: validation.nextStep,
      validationStatus: validation.status,
      validationMessage: validation.userMessage,
      rejectionReason:
        validation.status === 'OK'
          ? null
          : (validation.rejectionReason ?? validation.userMessage),
      frozenAt: new Date(),
    },
    create: {
      userId,
      goalText,
      interpretedGoal: validation.interpretedGoal,
      normalizedGoal: validation.normalizedGoal as Prisma.InputJsonValue,
      goalEvaluation: validation.goalEvaluation as Prisma.InputJsonValue,
      suggestedReformulatedGoal: validation.suggestedReformulatedGoal,
      questionsToUser: validation.questionsToUser as Prisma.InputJsonValue,
      nextStep: validation.nextStep,
      validationStatus: validation.status,
      validationMessage: validation.userMessage,
      rejectionReason:
        validation.status === 'OK'
          ? null
          : (validation.rejectionReason ?? validation.userMessage),
      frozenAt: new Date(),
    },
    select: { id: true, goalText: true, interpretedGoal: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const prompt of validation.areaPrompts) {
      await tx.userAreaPromptInstruction.upsert({
        where: {
          userId_areaId: { userId, areaId: prompt.areaId },
        },
        update: {
          goalId: goal.id,
          promptText: prompt.promptText,
          provider: validation.provider,
          model: validation.model,
          promptVersion: validation.promptVersion,
          promptHash: validation.promptHash,
          inputJson: validation.inputJson as Prisma.InputJsonValue,
        },
        create: {
          userId,
          areaId: prompt.areaId,
          goalId: goal.id,
          promptText: prompt.promptText,
          provider: validation.provider,
          model: validation.model,
          promptVersion: validation.promptVersion,
          promptHash: validation.promptHash,
          inputJson: validation.inputJson as Prisma.InputJsonValue,
        },
      });
    }
  });
  return goal;
}

export async function loadGoalPromptConfig(prisma: PrismaService) {
  const config = await prisma.aiGoalPromptConfig.findFirst({
    where: { isActive: true },
    orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    select: { basePrompt: true },
  });
  return {
    basePrompt:
      config?.basePrompt ??
      'Genera prompt operativi per area partendo dall obiettivo atleta e dal suo profilo. Rispondi in italiano, in modo pratico e revisionabile.',
  };
}

export async function saveGoalValidation(
  prisma: PrismaService,
  userId: string,
  goalText: string,
  validation: GoalValidationResult,
  freeze: boolean,
) {
  return prisma.userPerformanceGoal.upsert({
    where: { userId },
    update: {
      goalText,
      interpretedGoal: validation.interpretedGoal,
      normalizedGoal: validation.normalizedGoal as Prisma.InputJsonValue,
      goalEvaluation: validation.goalEvaluation as Prisma.InputJsonValue,
      suggestedReformulatedGoal: validation.suggestedReformulatedGoal,
      questionsToUser: validation.questionsToUser as Prisma.InputJsonValue,
      nextStep: validation.nextStep,
      validationStatus: validation.status,
      validationMessage: validation.userMessage,
      rejectionReason: validation.rejectionReason,
      frozenAt: freeze ? new Date() : null,
    },
    create: {
      userId,
      goalText,
      interpretedGoal: validation.interpretedGoal,
      normalizedGoal: validation.normalizedGoal as Prisma.InputJsonValue,
      goalEvaluation: validation.goalEvaluation as Prisma.InputJsonValue,
      suggestedReformulatedGoal: validation.suggestedReformulatedGoal,
      questionsToUser: validation.questionsToUser as Prisma.InputJsonValue,
      nextStep: validation.nextStep,
      validationStatus: validation.status,
      validationMessage: validation.userMessage,
      rejectionReason: validation.rejectionReason,
      frozenAt: freeze ? new Date() : null,
    },
  });
}
