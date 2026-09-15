import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  OnboardingInputType,
  OnboardingQuestionScope,
  Prisma,
  UserRole,
} from '@prisma/client';
import {
  Actor,
  OnboardingAnswer,
  STARTER_OPTIONS,
  TemplateRecord,
} from './onboarding-model';

export function assertAthlete(actor: Actor) {
  if (!actor.id) {
    throw new BadRequestException('Attore mancante');
  }
  if (actor.role !== UserRole.USER) {
    throw new ForbiddenException('Solo gli atleti usano l onboarding');
  }
}

export function normalizeAnswersForQuestions(
  questions: TemplateRecord[],
  answers: OnboardingAnswer[],
) {
  const answerMap = new Map(
    answers.map((answer) => [answer.questionId, answer.value]),
  );
  return questions.map((template) => {
    const value = answerMap.get(template.id);
    if (template.required && isEmpty(value)) {
      throw new BadRequestException(`Risposta mancante per ${template.key}`);
    }
    if (isEmpty(value)) {
      return { template, value: null, score: null };
    }
    return {
      template,
      value,
      score: scoreAnswer(template, value),
    };
  });
}

export function buildGeneralProfile(
  normalizedAnswers: Array<{
    template: TemplateRecord;
    value: string | number | boolean | null;
    score: number | null;
  }>,
) {
  return Object.fromEntries(
    normalizedAnswers
      .filter(
        (answer) => answer.template.scope === OnboardingQuestionScope.GENERAL,
      )
      .map((answer) => [
        answer.template.key,
        {
          label: answer.template.label,
          value: answer.value,
        },
      ]),
  );
}

export function serializeAnswer(answer: {
  template: TemplateRecord;
  value: string | number | boolean | null;
  score: number | null;
}) {
  return {
    questionId: answer.template.id,
    key: answer.template.key,
    scope: answer.template.scope,
    areaId: answer.template.areaId,
    label: answer.template.label,
    value: answer.value,
    score: answer.score,
  };
}

export function isEmpty(value: unknown) {
  return value === undefined || value === null || value === '';
}

export function normalizeOptions(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value : [];
}

export function scoreAnswer(template: TemplateRecord, value: unknown) {
  if (
    template.inputType !== OnboardingInputType.SCORE &&
    template.inputType !== OnboardingInputType.SELECT
  ) {
    return null;
  }
  const numeric = Number(value);
  if (
    template.scope === OnboardingQuestionScope.AREA &&
    template.inputType === OnboardingInputType.SCORE &&
    Number.isInteger(numeric) &&
    numeric >= 1 &&
    numeric <= 5
  ) {
    return numeric * 20;
  }
  if (
    template.inputType === OnboardingInputType.SCORE &&
    STARTER_OPTIONS.some((option) => option.value === numeric)
  ) {
    return numeric;
  }
  const options = normalizeOptions(template.optionsJson) as Array<{
    value?: unknown;
    score?: unknown;
  }>;
  const selected = options.find(
    (option) => String(option.value) === String(value),
  );
  if (selected?.score !== undefined) {
    const score = Number(selected.score);
    if (!Number.isNaN(score)) {
      return Math.max(0, Math.min(100, score));
    }
  }
  if (
    template.inputType === OnboardingInputType.SCORE &&
    !Number.isNaN(numeric) &&
    numeric >= 0 &&
    numeric <= 100
  ) {
    return numeric;
  }
  if (template.inputType === OnboardingInputType.SCORE) {
    throw new BadRequestException(`Punteggio non valido per ${template.key}`);
  }
  return null;
}
