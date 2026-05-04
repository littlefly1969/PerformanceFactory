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
import {
  AiProposalProviderService,
  GoalValidationResult,
  SpecialistOnboardingQuestionResult,
} from '../ai-orchestrator/proposal-provider.service';

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

type GoalChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProposalProviderService,
  ) {}

  private assertAthlete(actor: Actor) {
    if (!actor.id) {
      throw new BadRequestException('Attore mancante');
    }
    if (actor.role !== UserRole.USER) {
      throw new ForbiddenException('Solo gli atleti usano l onboarding');
    }
  }

  async getStatus(actor: Actor) {
    this.assertAthlete(actor);
    const assessment = await this.prisma.userOnboardingAssessment.findUnique({
      where: { userId: actor.id },
      select: { status: true, completedAt: true, updatedAt: true },
    });
    const goal = await this.prisma.userPerformanceGoal.findUnique({
      where: { userId: actor.id },
      select: {
        goalText: true,
        interpretedGoal: true,
        normalizedGoal: true,
        goalEvaluation: true,
        suggestedReformulatedGoal: true,
        questionsToUser: true,
        nextStep: true,
        validationStatus: true,
        validationMessage: true,
        updatedAt: true,
      },
    });
    return {
      required: assessment?.status !== 'COMPLETED' || goal?.validationStatus !== 'OK',
      status: assessment?.status ?? 'PENDING',
      completedAt: assessment?.completedAt ?? null,
      updatedAt: assessment?.updatedAt ?? null,
      goalText: goal?.goalText ?? '',
      interpretedGoal: goal?.interpretedGoal ?? null,
      normalizedGoal: goal?.normalizedGoal ?? null,
      goalEvaluation: goal?.goalEvaluation ?? null,
      suggestedReformulatedGoal: goal?.suggestedReformulatedGoal ?? null,
      questionsToUser: goal?.questionsToUser ?? [],
      nextStep: goal?.nextStep ?? null,
      validationStatus: goal?.validationStatus ?? 'PENDING',
      validationMessage: goal?.validationMessage ?? null,
      goalUpdatedAt: goal?.updatedAt ?? null,
    };
  }

  async getQuestionnaire(actor: Actor) {
    this.assertAthlete(actor);
    const status = await this.getStatus(actor);
    const templates = await this.loadQuestionnaireQuestions(actor.id);
    return {
      ...status,
      title: 'Anamnesi iniziale di performance',
      description:
        'Le risposte generali creano il profilo iniziale; poi l AI genera tre domande specialistiche per ogni area in base all obiettivo.',
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

  async validateGoal(actor: Actor, goalTextInput: string) {
    this.assertAthlete(actor);
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

    const goalPromptConfig = await this.loadGoalPromptConfig();
    const areas = await this.loadConfiguredAreas();
    const validation = await this.aiProvider.validatePerformanceGoal({
      userId: actor.id,
      goalText,
      basePrompt: goalPromptConfig.basePrompt,
      areas,
    });

    await this.saveGoalValidation(actor.id, goalText, validation, false);

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

  async refineGoal(
    actor: Actor,
    input: {
      originalGoal?: string;
      currentDraft?: string;
      messages?: GoalChatMessage[];
      userReply?: string;
    },
  ) {
    this.assertAthlete(actor);
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
      throw new BadRequestException('Scrivi una risposta per definire meglio l obiettivo.');
    }

    const refinedGoalInput = [
      `Obiettivo originale: ${originalGoal}`,
      currentDraft ? `Bozza corrente: ${currentDraft}` : '',
      `Nuova risposta utente: ${userReply}`,
    ]
      .filter(Boolean)
      .join('\n');
    const goalPromptConfig = await this.loadGoalPromptConfig();
    const areas = await this.loadConfiguredAreas();
    const validation = await this.aiProvider.validatePerformanceGoal({
      userId: actor.id,
      goalText: refinedGoalInput,
      basePrompt: goalPromptConfig.basePrompt,
      areas,
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

    await this.saveGoalValidation(actor.id, refinedGoalText, validation, false);

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

  async generateSpecialistQuestions(
    actor: Actor,
    answers: OnboardingAnswer[],
  ) {
    this.assertAthlete(actor);
    const goal = await this.prisma.userPerformanceGoal.findUnique({
      where: { userId: actor.id },
      select: {
        goalText: true,
        interpretedGoal: true,
        normalizedGoal: true,
        validationStatus: true,
      },
    });
    if (
      !goal ||
      (goal.validationStatus !== 'OK' &&
        goal.validationStatus !== 'NEEDS_ANAMNESIS')
    ) {
      throw new BadRequestException(
        'Valida prima un obiettivo utilizzabile per generare le domande specialistiche',
      );
    }

    const generalTemplates = await this.loadActiveGeneralTemplates();
    const normalizedGeneralAnswers = this.normalizeAnswersForQuestions(
      generalTemplates,
      answers,
    );
    const profile = this.buildGeneralProfile(normalizedGeneralAnswers);
    const areas = await this.loadConfiguredAreas();
    if (!areas.length) {
      throw new BadRequestException('Nessuna area configurata');
    }

    const generated =
      await this.aiProvider.generateSpecialistOnboardingQuestions({
        userId: actor.id,
        goalText: goal.goalText,
        interpretedGoal: goal.interpretedGoal ?? goal.goalText,
        normalizedGoal: goal.normalizedGoal,
        generalProfile: profile,
        generalAnswers: normalizedGeneralAnswers.map((answer) =>
          this.serializeAnswer(answer),
        ),
        areas,
      });

    await this.saveSpecialistQuestions(actor.id, generated);

    const questions = await this.loadQuestionnaireQuestions(actor.id);
    return {
      generated: true,
      provider: generated.provider,
      model: generated.model,
      promptVersion: generated.promptVersion,
      questions: questions.map((template) => ({
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
    goalTextInput: string,
    answers: OnboardingAnswer[],
  ) {
    this.assertAthlete(actor);
    const goalText = goalTextInput.trim();
    if (goalText.length < 10) {
      throw new BadRequestException('L obiettivo performance e obbligatorio');
    }
    const templates = await this.loadQuestionnaireQuestions(actor.id);
    const normalizedAnswers = this.normalizeAnswersForQuestions(
      templates,
      answers,
    );
    const profile = this.buildGeneralProfile(normalizedAnswers);

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
      throw new BadRequestException(
        'Genera e completa le domande specialistiche per area prima di salvare',
      );
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
    const configuredAreas = await this.loadConfiguredAreas();
    const onboardingAnswersForAi = normalizedAnswers.map((answer) =>
      this.serializeAnswer(answer),
    );
    const validation = await this.aiProvider.validatePerformanceGoal({
      userId: actor.id,
      goalText,
      basePrompt: (await this.loadGoalPromptConfig()).basePrompt,
      areas: configuredAreas.length
        ? configuredAreas
        : scoredAreas.map((area) => ({
            id: area.areaId,
            name: area.areaName,
          })),
      onboardingProfile: profile,
      onboardingAnswers: onboardingAnswersForAi,
    });
    if (validation.status !== 'OK') {
      await this.saveGoalValidation(actor.id, goalText, validation, false);
      throw new BadRequestException(validation.userMessage);
    }

    const goal = await this.prisma.userPerformanceGoal.upsert({
      where: { userId: actor.id },
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
        rejectionReason: null,
        frozenAt: new Date(),
      },
      create: {
        userId: actor.id,
        goalText,
        interpretedGoal: validation.interpretedGoal,
        normalizedGoal: validation.normalizedGoal as Prisma.InputJsonValue,
        goalEvaluation: validation.goalEvaluation as Prisma.InputJsonValue,
        suggestedReformulatedGoal: validation.suggestedReformulatedGoal,
        questionsToUser: validation.questionsToUser as Prisma.InputJsonValue,
        nextStep: validation.nextStep,
        validationStatus: validation.status,
        validationMessage: validation.userMessage,
        frozenAt: new Date(),
      },
      select: { id: true, goalText: true, interpretedGoal: true },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.userOnboardingAssessment.upsert({
        where: { userId: actor.id },
        update: {
          status: 'COMPLETED',
          answersJson: normalizedAnswers.map((answer) => ({
            ...this.serializeAnswer(answer),
          })) as Prisma.InputJsonValue,
          profileJson: profile as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
        create: {
          userId: actor.id,
          status: 'COMPLETED',
          answersJson: normalizedAnswers.map((answer) => ({
            ...this.serializeAnswer(answer),
          })) as Prisma.InputJsonValue,
          profileJson: profile as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });

      const snapshot = await tx.performanceProfileSnapshot.create({
        data: {
          userId: actor.id,
          rankingGlobal,
          reason: 'Baseline questionario iniziale',
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

      for (const prompt of validation.areaPrompts) {
        await tx.userAreaPromptInstruction.upsert({
          where: {
            userId_areaId: { userId: actor.id, areaId: prompt.areaId },
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
            userId: actor.id,
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

      return {
        status: 'COMPLETED',
        snapshot,
        profile,
        areas: scoredAreas,
        goal,
        goalValidation: {
          interpretedGoal: validation.interpretedGoal,
          userMessage: validation.userMessage,
        },
      };
    });

    return {
      ...result,
      generatedAreaPrompts: validation.areaPrompts.map((prompt) => ({
        areaId: prompt.areaId,
        areaName: prompt.areaName,
      })),
    };
  }

  private async loadGoalPromptConfig() {
    const config = await this.prisma.aiGoalPromptConfig.findFirst({
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

  private async loadConfiguredAreas() {
    return this.prisma.area.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  private async saveGoalValidation(
    userId: string,
    goalText: string,
    validation: GoalValidationResult,
    freeze: boolean,
  ) {
    return this.prisma.userPerformanceGoal.upsert({
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

  private normalizeAnswersForQuestions(
    questions: TemplateRecord[],
    answers: OnboardingAnswer[],
  ) {
    const answerMap = new Map(
      answers.map((answer) => [answer.questionId, answer.value]),
    );
    return questions.map((template) => {
      const value = answerMap.get(template.id);
      if (template.required && this.isEmpty(value)) {
        throw new BadRequestException(`Risposta mancante per ${template.key}`);
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
  }

  private buildGeneralProfile(
    normalizedAnswers: Array<{
      template: TemplateRecord;
      value: string | number | boolean | null;
      score: number | null;
    }>,
  ) {
    return Object.fromEntries(
      normalizedAnswers
        .filter(
          (answer) =>
            answer.template.scope === OnboardingQuestionScope.GENERAL,
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

  private serializeAnswer(answer: {
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

  private async saveSpecialistQuestions(
    userId: string,
    generated: SpecialistOnboardingQuestionResult,
  ) {
    await this.prisma.$transaction(async (tx) => {
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
              optionsJson: STARTER_OPTIONS as Prisma.InputJsonValue,
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

  private async loadQuestionnaireQuestions(userId: string) {
    const [general, specialist] = await Promise.all([
      this.loadActiveGeneralTemplates(),
      this.loadSpecialistQuestionRecords(userId),
    ]);
    return [...general, ...specialist];
  }

  private async loadActiveGeneralTemplates(): Promise<TemplateRecord[]> {
    const templates = await this.prisma.onboardingQuestionTemplate.findMany({
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

  private async loadSpecialistQuestionRecords(
    userId: string,
  ): Promise<TemplateRecord[]> {
    const questions = await this.prisma.userOnboardingQuestion.findMany({
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
      throw new BadRequestException(`Punteggio non valido per ${template.key}`);
    }
    return null;
  }
}
