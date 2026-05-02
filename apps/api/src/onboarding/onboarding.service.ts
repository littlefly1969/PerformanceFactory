import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  OnboardingInputType,
  OnboardingQuestionScope,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Actor = {
  id: string;
  role: UserRole;
};

const STARTER_OPTIONS = [
  { value: 20, label: 'Critico' },
  { value: 40, label: 'Fragile' },
  { value: 60, label: 'Stabile' },
  { value: 80, label: 'Forte' },
  { value: 100, label: 'Elite' },
];

type TemplateRecord = {
  id: string;
  key: string;
  scope: OnboardingQuestionScope;
  areaId: string | null;
  label: string;
  helpText: string | null;
  inputType: OnboardingInputType;
  optionsJson: Prisma.JsonValue;
  required: boolean;
  orderIndex: number;
  area: { id: string; name: string } | null;
};

type OnboardingAnswer = {
  questionId: string;
  value: string | number | boolean | null;
};

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAthlete(actor: Actor) {
    if (!actor.id) {
      throw new BadRequestException('Missing actor');
    }
    if (actor.role !== UserRole.USER) {
      throw new ForbiddenException('Only athletes use onboarding');
    }
  }

  async getStatus(actor: Actor) {
    this.assertAthlete(actor);
    const assessment = await this.prisma.userOnboardingAssessment.findUnique({
      where: { userId: actor.id },
      select: { status: true, completedAt: true, updatedAt: true },
    });
    return {
      required: assessment?.status !== 'COMPLETED',
      status: assessment?.status ?? 'PENDING',
      completedAt: assessment?.completedAt ?? null,
      updatedAt: assessment?.updatedAt ?? null,
    };
  }

  async getQuestionnaire(actor: Actor) {
    this.assertAthlete(actor);
    const status = await this.getStatus(actor);
    const templates = await this.loadActiveTemplates();
    return {
      ...status,
      title: 'Anamnesi iniziale di performance',
      description:
        'Le risposte generali e per area creano la baseline iniziale e diventano contesto stabile per i cicli AI futuri.',
      options: STARTER_OPTIONS,
      questions: templates.map((template) => ({
        id: template.id,
        key: template.key,
        scope: template.scope,
        areaId: template.areaId,
        areaName: template.area?.name ?? null,
        text: template.label,
        helpText: template.helpText,
        inputType: template.inputType,
        required: template.required,
        orderIndex: template.orderIndex,
        options: this.normalizeOptions(template.optionsJson),
      })),
    };
  }

  async submit(
    actor: Actor,
    answers: OnboardingAnswer[],
  ) {
    this.assertAthlete(actor);
    const templates = await this.loadActiveTemplates();
    const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.value]));
    const normalizedAnswers = templates.map((template) => {
      const value = answerMap.get(template.id);
      if (template.required && this.isEmpty(value)) {
        throw new BadRequestException(`Missing answer for ${template.key}`);
      }
      if (this.isEmpty(value)) {
        return { template, value: null, score: null };
      }
      return {
        template,
        value,
        score: this.scoreAnswer(template, value),
      };
    });

    const profile = Object.fromEntries(
      normalizedAnswers
        .filter((answer) => answer.template.scope === OnboardingQuestionScope.GENERAL)
        .map((answer) => [
          answer.template.key,
          {
            label: answer.template.label,
            value: answer.value,
          },
        ]),
    );

    const areaScores = new Map<
      string,
      { areaId: string; areaName: string; total: number; count: number; answers: unknown[] }
    >();
    for (const answer of normalizedAnswers) {
      const template = answer.template;
      if (
        template.scope !== OnboardingQuestionScope.AREA ||
        !template.areaId ||
        !template.area ||
        answer.score === null
      ) {
        continue;
      }
      const current =
        areaScores.get(template.areaId) ?? {
          areaId: template.areaId,
          areaName: template.area.name,
          total: 0,
          count: 0,
          answers: [],
        };
      current.total += answer.score;
      current.count += 1;
      current.answers.push({
        questionId: template.id,
        key: template.key,
        label: template.label,
        value: answer.value,
        score: answer.score,
      });
      areaScores.set(template.areaId, current);
    }

    if (areaScores.size === 0) {
      throw new BadRequestException('At least one scored area question is required');
    }

    const scoredAreas = Array.from(areaScores.values()).map((area) => {
      const realR = Math.round(area.total / area.count);
      return {
        areaId: area.areaId,
        areaName: area.areaName,
        realR,
        potentialP: Math.min(100, realR + 15),
        answers: area.answers,
      };
    });
    const rankingGlobal = Math.round(
      scoredAreas.reduce((sum, area) => sum + area.realR, 0) /
        scoredAreas.length,
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.userOnboardingAssessment.upsert({
        where: { userId: actor.id },
        update: {
          status: 'COMPLETED',
          answersJson: normalizedAnswers.map((answer) => ({
            questionId: answer.template.id,
            key: answer.template.key,
            scope: answer.template.scope,
            areaId: answer.template.areaId,
            label: answer.template.label,
            value: answer.value,
            score: answer.score,
          })) as Prisma.InputJsonValue,
          profileJson: profile as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
        create: {
          userId: actor.id,
          status: 'COMPLETED',
          answersJson: normalizedAnswers.map((answer) => ({
            questionId: answer.template.id,
            key: answer.template.key,
            scope: answer.template.scope,
            areaId: answer.template.areaId,
            label: answer.template.label,
            value: answer.value,
            score: answer.score,
          })) as Prisma.InputJsonValue,
          profileJson: profile as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });

      const snapshot = await tx.performanceProfileSnapshot.create({
        data: {
          userId: actor.id,
          rankingGlobal,
          reason: 'Starter questionnaire baseline',
          areas: {
            create: scoredAreas.map((area) => ({
              areaId: area.areaId,
              realR: area.realR,
              potentialP: area.potentialP,
            })),
          },
        },
        select: { id: true, rankingGlobal: true, createdAt: true },
      });

      for (const area of scoredAreas) {
        await tx.currentState.upsert({
          where: { userId_areaId: { userId: actor.id, areaId: area.areaId } },
          update: {
            score: area.realR,
            level:
              area.realR >= 80
                ? 'ADVANCED'
                : area.realR >= 60
                  ? 'STABLE'
                  : 'BASELINE',
          },
          create: {
            userId: actor.id,
            areaId: area.areaId,
            score: area.realR,
            level:
              area.realR >= 80
                ? 'ADVANCED'
                : area.realR >= 60
                  ? 'STABLE'
                  : 'BASELINE',
          },
        });
      }

      return {
        status: 'COMPLETED',
        snapshot,
        profile,
        areas: scoredAreas,
      };
    });
  }

  private async loadActiveTemplates(): Promise<TemplateRecord[]> {
    const templates = await this.prisma.onboardingQuestionTemplate.findMany({
      where: { isActive: true },
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
      orderBy: [{ scope: 'asc' }, { areaId: 'asc' }, { orderIndex: 'asc' }],
    });
    if (templates.length > 0) {
      return templates;
    }

    const areas = await this.prisma.area.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
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
      ...areas.map((area, index) => ({
        id: `fallback_${area.id}`,
        key: `area_${area.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        scope: OnboardingQuestionScope.AREA,
        areaId: area.id,
        label: `Valuta il livello iniziale per ${area.name}`,
        helpText: null,
        inputType: OnboardingInputType.SCORE,
        optionsJson: STARTER_OPTIONS as Prisma.JsonArray,
        required: true,
        orderIndex: 100 + index,
        area,
      })),
    ];
  }

  private isEmpty(value: unknown) {
    return value === undefined || value === null || value === '';
  }

  private normalizeOptions(value: Prisma.JsonValue) {
    return Array.isArray(value) ? value : [];
  }

  private scoreAnswer(template: TemplateRecord, value: unknown) {
    if (
      template.inputType !== OnboardingInputType.SCORE &&
      template.inputType !== OnboardingInputType.SELECT
    ) {
      return null;
    }
    const numeric = Number(value);
    if (
      template.inputType === OnboardingInputType.SCORE &&
      STARTER_OPTIONS.some((option) => option.value === numeric)
    ) {
      return numeric;
    }
    const options = this.normalizeOptions(template.optionsJson) as Array<{
      value?: unknown;
      score?: unknown;
    }>;
    const selected = options.find((option) => String(option.value) === String(value));
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
      throw new BadRequestException(`Invalid score for ${template.key}`);
    }
    return null;
  }
}
