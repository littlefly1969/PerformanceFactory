import {
  BadRequestException,
  ConflictException,
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
import {
  FITNESS_LOCATION_OPTIONS,
  SPORT_OPTIONS,
  NormalizedSportSelection,
  formatSportSelection,
  normalizeSportSelection,
} from './sport-selection';

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

const SPECIALIST_SCORE_OPTIONS = [
  { value: 1, label: '1', score: 20 },
  { value: 2, label: '2', score: 40 },
  { value: 3, label: '3', score: 60 },
  { value: 4, label: '4', score: 80 },
  { value: 5, label: '5', score: 100 },
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
    const [assessment, goal, sportSelection] = await Promise.all([
      this.prisma.userOnboardingAssessment.findUnique({
        where: { userId: actor.id },
        select: { status: true, completedAt: true, updatedAt: true },
      }),
      this.prisma.userPerformanceGoal.findUnique({
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
          frozenAt: true,
          updatedAt: true,
        },
      }),
      this.loadUserSportSelection(actor.id),
    ]);
    return {
      required: assessment?.status !== 'COMPLETED' || !goal?.frozenAt,
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
      goalFrozenAt: goal?.frozenAt ?? null,
      goalUpdatedAt: goal?.updatedAt ?? null,
      sportSelection,
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
        'Le risposte generali creano il contesto anamnestico iniziale; l obiettivo viene definito nello step successivo.',
      sportOptions: SPORT_OPTIONS,
      fitnessLocationOptions: FITNESS_LOCATION_OPTIONS,
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

  async saveSportSelection(actor: Actor, input: { sports?: string[]; fitnessLocation?: string | null }) {
    this.assertAthlete(actor);
    const selection = normalizeSportSelection(input);
    await this.prisma.userSportSelection.upsert({
      where: { userId: actor.id },
      update: {
        sports: selection.sports as Prisma.InputJsonValue,
        fitnessLocation: selection.fitnessLocation,
      },
      create: {
        userId: actor.id,
        sports: selection.sports as Prisma.InputJsonValue,
        fitnessLocation: selection.fitnessLocation,
      },
    });
    return formatSportSelection(selection);
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
    const sportContext = await this.requireSportContext(actor.id, areas);
    const validation = await this.aiProvider.validatePerformanceGoal({
      userId: actor.id,
      goalText,
      basePrompt: goalPromptConfig.basePrompt,
      areas,
      sportSelection: sportContext.selection,
      sportAreaPromptInstructions: sportContext.instructions,
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
    const sportContext = await this.requireSportContext(actor.id, areas);
    const validation = await this.aiProvider.validatePerformanceGoal({
      userId: actor.id,
      goalText: refinedGoalInput,
      basePrompt: goalPromptConfig.basePrompt,
      areas,
      sportSelection: sportContext.selection,
      sportAreaPromptInstructions: sportContext.instructions,
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
    goalTextInput: string,
    answers: OnboardingAnswer[],
  ) {
    this.assertAthlete(actor);
    const goalText = goalTextInput.trim();
    if (goalText.length < 10) {
      throw new BadRequestException('L obiettivo performance e obbligatorio');
    }

    const generalTemplates = await this.loadActiveGeneralTemplates();
    const normalizedGeneralAnswers = this.normalizeAnswersForQuestions(
      generalTemplates,
      answers,
    );
    const profile = this.buildGeneralProfile(normalizedGeneralAnswers);
    const areas = await this.loadConfiguredAreas();
    const sportContext = await this.requireSportContext(actor.id, areas);
    if (!areas.length) {
      throw new BadRequestException('Nessuna area configurata');
    }

    await this.prisma.userPerformanceGoal.upsert({
      where: { userId: actor.id },
      update: {
        goalText,
        interpretedGoal: null,
        normalizedGoal: Prisma.JsonNull,
        goalEvaluation: Prisma.JsonNull,
        suggestedReformulatedGoal: null,
        questionsToUser: Prisma.JsonNull,
        nextStep: 'COMPLETE_ANAMNESIS_BEFORE_VALIDATION',
        validationStatus: 'PENDING',
        validationMessage: null,
        rejectionReason: null,
        frozenAt: null,
      },
      create: {
        userId: actor.id,
        goalText,
        validationStatus: 'PENDING',
        nextStep: 'COMPLETE_ANAMNESIS_BEFORE_VALIDATION',
      },
    });

    const generated =
      await this.aiProvider.generateSpecialistOnboardingQuestions({
        userId: actor.id,
        goalText,
        interpretedGoal: goalText,
        normalizedGoal: null,
        sportSelection: sportContext.selection,
        sportAreaPromptInstructions: sportContext.instructions,
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
    const prepared = await this.prepareCompletedOnboarding(
      actor,
      goalTextInput,
      answers,
    );
    const goal = await this.prisma.userPerformanceGoal.findUnique({
      where: { userId: actor.id },
      select: {
        id: true,
        goalText: true,
        interpretedGoal: true,
        validationStatus: true,
        validationMessage: true,
        frozenAt: true,
      },
    });
    if (!goal?.frozenAt) {
      throw new BadRequestException(
        'Valida prima l obiettivo finale con le risposte completate',
      );
    }
    const { normalizedAnswers, profile, scoredAreas, rankingGlobal } = prepared;

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

      return {
        status: 'COMPLETED',
        snapshot,
        profile,
        areas: scoredAreas,
        goal: {
          id: goal.id,
          goalText: goal.goalText,
          interpretedGoal: goal.interpretedGoal,
        },
        goalValidation: {
          status: goal.validationStatus,
          interpretedGoal: goal.interpretedGoal ?? goal.goalText,
          userMessage: goal.validationMessage ?? '',
        },
      };
    });

    return result;
  }

  async validateFinalGoal(
    actor: Actor,
    goalTextInput: string,
    answers: OnboardingAnswer[],
  ) {
    this.assertAthlete(actor);
    const prepared = await this.prepareCompletedOnboarding(
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
      sportSelection: sportContext.selection,
      sportAreaPromptInstructions: sportContext.instructions,
      onboardingProfile: profile,
      onboardingAnswers: onboardingAnswersForAi,
    });
    await this.saveFinalGoalValidation(actor.id, goalText, validation);
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

  private async saveFinalGoalValidation(
    userId: string,
    goalText: string,
    validation: GoalValidationResult,
  ) {
    const goal = await this.prisma.userPerformanceGoal.upsert({
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
            : validation.rejectionReason ?? validation.userMessage,
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
            : validation.rejectionReason ?? validation.userMessage,
        frozenAt: new Date(),
      },
      select: { id: true, goalText: true, interpretedGoal: true },
    });

    await this.prisma.$transaction(async (tx) => {
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

  private async prepareCompletedOnboarding(
    actor: Actor,
    goalTextInput: string,
    answers: OnboardingAnswer[],
  ) {
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
    const sportContext = await this.requireSportContext(
      actor.id,
      configuredAreas,
    );

    return {
      goalText,
      normalizedAnswers,
      profile,
      scoredAreas,
      rankingGlobal,
      configuredAreas,
      sportContext,
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

  private async loadUserSportSelection(userId: string) {
    const selection = await this.prisma.userSportSelection.findUnique({
      where: { userId },
      select: { sports: true, fitnessLocation: true },
    });
    if (!selection || !Array.isArray(selection.sports)) {
      return null;
    }
    const normalized = normalizeSportSelection({
      sports: selection.sports.filter(
        (sport): sport is string => typeof sport === 'string',
      ),
      fitnessLocation: selection.fitnessLocation,
    });
    return formatSportSelection(normalized);
  }

  private async requireSportContext(userId: string, areas: Array<{ id: string; name: string }>) {
    const selection = await this.loadUserSportSelection(userId);
    if (!selection) {
      throw new BadRequestException(
        'Seleziona prima uno o due sport per personalizzare il percorso',
      );
    }
    const instructions = await this.loadSportAreaPromptInstructions(
      selection,
      areas,
    );
    return { selection, instructions };
  }

  private async loadSportAreaPromptInstructions(
    selection: ReturnType<typeof formatSportSelection>,
    areas: Array<{ id: string; name: string }>,
  ) {
    const areaIds = areas.map((area) => area.id);
    const promptContexts = selection.sports.map((sport) => ({
      sportKey: sport,
      fitnessLocation:
        sport === 'FITNESS' && selection.fitnessLocation
          ? selection.fitnessLocation
          : 'NONE',
    }));
    const prompts = await this.prisma.aiSportAreaPromptConfig.findMany({
      where: {
        isActive: true,
        areaId: { in: areaIds },
        OR: promptContexts,
      },
      select: {
        sportKey: true,
        fitnessLocation: true,
        areaId: true,
        basePrompt: true,
        version: true,
        area: { select: { name: true } },
      },
    });
    return prompts.map((prompt) => ({
      sportKey: prompt.sportKey,
      fitnessLocation:
        prompt.fitnessLocation === 'NONE' ? null : prompt.fitnessLocation,
      sportLabel: this.sportPromptLabel(prompt.sportKey, prompt.fitnessLocation),
      areaId: prompt.areaId,
      areaName: prompt.area.name,
      basePrompt: prompt.basePrompt,
      version: prompt.version,
    }));
  }

  private sportPromptLabel(sportKey: string, fitnessLocation: string) {
    const sportLabel =
      SPORT_OPTIONS.find((sport) => sport.key === sportKey)?.label ?? sportKey;
    if (sportKey !== 'FITNESS') {
      return sportLabel;
    }
    const fitnessLabel = FITNESS_LOCATION_OPTIONS.find(
      (location) => location.key === fitnessLocation,
    )?.label;
    return fitnessLabel ? `${sportLabel} - ${fitnessLabel}` : sportLabel;
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
