import {
  OnboardingInputType,
  OnboardingQuestionScope,
  Prisma,
} from '@prisma/client';
import { SpecialistOnboardingQuestionResult } from '../ai-orchestrator/proposal-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import { SPECIALIST_SCORE_OPTIONS, TemplateRecord } from './onboarding-model';

export async function saveSpecialistQuestions(
  prisma: PrismaService,
  userId: string,
  generated: SpecialistOnboardingQuestionResult,
) {
  await prisma.$transaction(async (tx) => {
    await tx.userOnboardingQuestion.deleteMany({ where: { userId } });
    for (const area of generated.areaQuestions) {
      for (const question of area.questions) {
        await tx.userOnboardingQuestion.create({
          data: {
            userId,
            areaId: area.areaId,
            text: question.text,
            orderIndex: question.orderIndex,
            inputType: OnboardingInputType.SCORE,
            optionsJson: SPECIALIST_SCORE_OPTIONS as Prisma.InputJsonValue,
            provider: generated.provider,
            model: generated.model,
            promptVersion: generated.promptVersion,
            promptHash: generated.promptHash,
            inputJson: generated.inputJson as Prisma.InputJsonValue,
          },
        });
      }
    }
  });
}

export async function loadQuestionnaireQuestions(
  prisma: PrismaService,
  userId: string,
) {
  const [general, specialist] = await Promise.all([
    loadActiveGeneralTemplates(prisma),
    loadSpecialistQuestionRecords(prisma, userId),
  ]);
  return [...general, ...specialist];
}

export async function loadActiveGeneralTemplates(
  prisma: PrismaService,
): Promise<TemplateRecord[]> {
  const templates = await prisma.onboardingQuestionTemplate.findMany({
    where: { isActive: true, scope: OnboardingQuestionScope.GENERAL },
    select: {
      id: true,
      key: true,
      scope: true,
      areaId: true,
      label: true,
      helpText: true,
      inputType: true,
      optionsJson: true,
      required: true,
      orderIndex: true,
      area: { select: { id: true, name: true } },
    },
    orderBy: [{ orderIndex: 'asc' }],
  });
  if (templates.length > 0) {
    return templates;
  }
  return [
    {
      id: 'fallback_height_cm',
      key: 'general_height_cm',
      scope: OnboardingQuestionScope.GENERAL,
      areaId: null,
      label: 'Altezza in centimetri',
      helpText: null,
      inputType: OnboardingInputType.NUMBER,
      optionsJson: null,
      required: true,
      orderIndex: 1,
      area: null,
    },
    {
      id: 'fallback_health_status',
      key: 'general_health_status',
      scope: OnboardingQuestionScope.GENERAL,
      areaId: null,
      label: 'Stato di salute generale, eventuali limitazioni o infortuni noti',
      helpText: null,
      inputType: OnboardingInputType.TEXT,
      optionsJson: null,
      required: true,
      orderIndex: 2,
      area: null,
    },
  ];
}

export async function loadSpecialistQuestionRecords(
  prisma: PrismaService,
  userId: string,
): Promise<TemplateRecord[]> {
  const questions = await prisma.userOnboardingQuestion.findMany({
    where: { userId },
    select: {
      id: true,
      areaId: true,
      text: true,
      inputType: true,
      optionsJson: true,
      orderIndex: true,
      area: { select: { id: true, name: true } },
    },
    orderBy: [{ area: { name: 'asc' } }, { orderIndex: 'asc' }],
  });
  return questions.map((question) => ({
    id: question.id,
    key: `specialist_${question.areaId}_${question.orderIndex}`,
    scope: OnboardingQuestionScope.AREA,
    areaId: question.areaId,
    label: question.text,
    helpText: null,
    inputType: question.inputType,
    optionsJson: question.optionsJson,
    required: true,
    orderIndex: 1000 + question.orderIndex,
    area: question.area,
  }));
}
