import { Logger } from '@nestjs/common';
import {
  buildSpecialistOnboardingQuestionAuditInput,
  hashJson,
} from './proposal-audit';
import {
  AiAreaInput,
  AiProvider,
  QUESTIONS_PER_AREA,
  SPECIALIST_ONBOARDING_QUESTIONS_VERSION,
  SpecialistOnboardingQuestionInput,
  SpecialistOnboardingQuestionResult,
} from './proposal-provider-model';
import {
  generateGeminiSpecialistOnboardingQuestions,
  generateOpenAiSpecialistOnboardingQuestions,
} from './proposal-transport';
import { resolveModel, resolveProvider } from './provider-config';

export async function generateSpecialistOnboardingQuestions(
  logger: Logger,
  input: SpecialistOnboardingQuestionInput,
): Promise<SpecialistOnboardingQuestionResult> {
  const provider = resolveProvider();
  const model = resolveModel(provider);
  const inputJson = buildSpecialistOnboardingQuestionAuditInput(input);
  if (provider === 'openai') {
    return generateOpenAiSpecialistOnboardingQuestions(
      logger,
      input,
      inputJson,
    );
  }
  if (provider === 'gemini') {
    return generateGeminiSpecialistOnboardingQuestions(
      logger,
      input,
      inputJson,
    );
  }
  return normalizeSpecialistOnboardingQuestions(
    input,
    provider,
    model,
    buildStubSpecialistOnboardingQuestions(input),
    inputJson,
  );
}

export function normalizeSpecialistOnboardingQuestions(
  input: SpecialistOnboardingQuestionInput,
  provider: AiProvider,
  model: string,
  parsed: {
    areaQuestions?: Array<{
      areaId?: string;
      questions?: Array<{ text?: string; orderIndex?: number }>;
    }>;
  },
  inputJson: Record<string, unknown>,
): SpecialistOnboardingQuestionResult {
  const parsedByArea = new Map(
    (parsed.areaQuestions ?? [])
      .filter((item) => item.areaId)
      .map((item) => [item.areaId as string, item.questions ?? []]),
  );
  const areaQuestions = input.areas.map((area) => {
    const normalizedQuestions = (parsedByArea.get(area.id) ?? [])
      .filter((question) => question.text?.trim())
      .slice(0, QUESTIONS_PER_AREA)
      .map((question, index) => ({
        text: question.text!.trim(),
        orderIndex:
          typeof question.orderIndex === 'number'
            ? Math.max(1, Math.min(QUESTIONS_PER_AREA, question.orderIndex))
            : index + 1,
      }));
    const questions =
      normalizedQuestions.length === QUESTIONS_PER_AREA
        ? normalizedQuestions
        : buildFallbackSpecialistQuestions(input, area);
    return {
      areaId: area.id,
      areaName: area.name,
      questions,
    };
  });

  return {
    provider,
    model,
    promptVersion: SPECIALIST_ONBOARDING_QUESTIONS_VERSION,
    promptHash: hashJson(inputJson),
    inputJson,
    areaQuestions,
  };
}

export function buildStubSpecialistOnboardingQuestions(
  input: SpecialistOnboardingQuestionInput,
) {
  return {
    areaQuestions: input.areas.map((area) => ({
      areaId: area.id,
      questions: buildFallbackSpecialistQuestions(input, area),
    })),
  };
}

export function buildFallbackSpecialistQuestions(
  input: SpecialistOnboardingQuestionInput,
  area: AiAreaInput,
) {
  const goal = input.interpretedGoal || input.goalText;
  return [
    `Per ${area.name}, quanto il tuo livello attuale supporta l obiettivo: ${goal}?`,
    `Per ${area.name}, quanto sono chiari vincoli o difficolta che possono influenzare questo obiettivo?`,
    `Per ${area.name}, quanto riesci a mantenere continuita nelle azioni utili a questo obiettivo?`,
  ].map((text, index) => ({ text, orderIndex: index + 1 }));
}
