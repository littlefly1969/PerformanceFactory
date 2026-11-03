import { BadRequestException } from '@nestjs/common';
import { OnboardingQuestionScope, Prisma } from '@prisma/client';
import { AiProposalProviderService } from '../ai-orchestrator/proposal-provider.service';
import { AVAILABILITY_FROM_PROFILE } from '../ai-orchestrator/training-constraints';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertAthlete,
  buildGeneralProfile,
  normalizeAnswersForQuestions,
  normalizeOptions,
  serializeAnswer,
} from './onboarding-answers';
import {
  Actor,
  OnboardingAnswer,
  SportSelectionPayload,
  STARTER_OPTIONS,
} from './onboarding-model';
import {
  loadUserGeneralTemplates,
  loadQuestionnaireQuestions,
  saveSpecialistQuestions,
} from './onboarding-questions';
import {
  loadActiveSports,
  loadUserSportSelection,
  requireSportContext,
  validateSportSelection,
} from './onboarding-sports';

/** Voci scritte da POST /athlete/training/availability, da non perdere. */
const AVAILABILITY_KEYS = [
  'general_training_frequency',
  'training_days_available',
  'training_session_duration',
  'preferred_training_days',
] as const;

function savedAvailability(
  profileJson: Prisma.JsonValue | undefined,
  fromProfileOnly: boolean,
) {
  if (
    !profileJson ||
    typeof profileJson !== 'object' ||
    Array.isArray(profileJson)
  )
    return {};
  return Object.fromEntries(
    AVAILABILITY_KEYS.filter((key) => {
      const entry = profileJson[key];
      if (entry == null) return false;
      return (
        !fromProfileOnly ||
        (typeof entry === 'object' &&
          !Array.isArray(entry) &&
          entry.source === AVAILABILITY_FROM_PROFILE)
      );
    }).map((key) => [key, profileJson[key]]),
  );
}

/**
 * Profilo generale con la disponibilità già salvata. La disponibilità scritta
 * dall'atleta nel profilo (fase gratuita o dopo) è la più recente e vale sulle
 * risposte congelate del funnel e dell'assessment; le altre voci salvate
 * restano solo se le risposte non le contengono.
 */
export function withSavedAvailability(
  profile: Record<string, unknown>,
  saved: Prisma.JsonValue | undefined,
) {
  return {
    ...savedAvailability(saved, false),
    ...profile,
    ...savedAvailability(saved, true),
  };
}

export async function getStatus(prisma: PrismaService, actor: Actor) {
  assertAthlete(actor);
  const [assessment, goal, sportSelection] = await Promise.all([
    prisma.userOnboardingAssessment.findUnique({
      where: { userId: actor.id },
      select: { status: true, completedAt: true, updatedAt: true },
    }),
    prisma.userPerformanceGoal.findUnique({
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
    loadUserSportSelection(prisma, actor.id),
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

export async function getQuestionnaire(prisma: PrismaService, actor: Actor) {
  assertAthlete(actor);
  const [status, templates, sports] = await Promise.all([
    getStatus(prisma, actor),
    loadQuestionnaireQuestions(prisma, actor.id),
    loadActiveSports(prisma),
  ]);
  return {
    ...status,
    title: 'Anamnesi iniziale di performance',
    description:
      'Le risposte generali creano il contesto anamnestico iniziale; l obiettivo viene definito nello step successivo.',
    sports,
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
      options: normalizeOptions(template.optionsJson),
    })),
  };
}

export async function saveSportSelection(
  prisma: PrismaService,
  actor: Actor,
  input: SportSelectionPayload,
) {
  assertAthlete(actor);
  const selection = await validateSportSelection(prisma, input);
  await prisma.userSportSelection.upsert({
    where: { userId: actor.id },
    update: {
      sportId: selection.sportId,
      specializationId: selection.specializationId,
    },
    create: {
      userId: actor.id,
      sportId: selection.sportId,
      specializationId: selection.specializationId,
    },
  });
  return selection;
}

export async function generateSpecialistQuestions(
  prisma: PrismaService,
  aiProvider: AiProposalProviderService,
  actor: Actor,
  goalTextInput: string,
  answers: OnboardingAnswer[],
) {
  assertAthlete(actor);
  const goalText = goalTextInput.trim();
  if (goalText.length < 10) {
    throw new BadRequestException('L obiettivo performance e obbligatorio');
  }

  const generalTemplates = await loadUserGeneralTemplates(prisma, actor.id);
  const normalizedGeneralAnswers = normalizeAnswersForQuestions(
    generalTemplates,
    answers,
  );
  const profile = buildGeneralProfile(normalizedGeneralAnswers);
  const sportContext = await requireSportContext(prisma, actor.id);
  const areas = sportContext.areas;
  if (!areas.length) {
    throw new BadRequestException('Nessuna area configurata');
  }

  await prisma.userPerformanceGoal.upsert({
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

  const generated = await aiProvider.generateSpecialistOnboardingQuestions({
    userId: actor.id,
    goalText,
    interpretedGoal: goalText,
    normalizedGoal: null,
    sportSelection: sportContext.selection,
    sportSpecializationPromptInstructions: sportContext.instructions,
    generalProfile: profile,
    generalAnswers: normalizedGeneralAnswers.map((answer) =>
      serializeAnswer(answer),
    ),
    areas,
  });

  await saveSpecialistQuestions(prisma, actor.id, generated);

  const questions = await loadQuestionnaireQuestions(prisma, actor.id);
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
      options: normalizeOptions(template.optionsJson),
    })),
  };
}

/**
 * Baseline già nota (R consolidata della calibrazione e P dell'orizzonte
 * pagato): sostituisce lo scoring delle risposte, che resta per il flusso
 * precedente.
 */
export type ProvidedBaseline = {
  reason: string;
  areas: { areaId: string; realR: number; potentialP: number }[];
};

export async function submit(
  prisma: PrismaService,
  actor: Actor,
  goalTextInput: string,
  answers: OnboardingAnswer[],
  baseline?: ProvidedBaseline,
) {
  assertAthlete(actor);
  const prepared = await prepareCompletedOnboarding(
    prisma,
    actor,
    goalTextInput,
    answers,
  );
  const goal = await prisma.userPerformanceGoal.findUnique({
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
  const { normalizedAnswers, profile } = prepared;
  const names = new Map(
    prepared.configuredAreas.map((a) => [a.id, a.name] as const),
  );
  const scoredAreas = baseline
    ? baseline.areas.map((a) => ({
        ...a,
        areaName: names.get(a.areaId) ?? '',
        answers: [] as unknown[],
      }))
    : prepared.scoredAreas;
  const rankingGlobal = baseline
    ? Math.round(
        scoredAreas.reduce((sum, area) => sum + area.realR, 0) /
          Math.max(1, scoredAreas.length),
      )
    : prepared.rankingGlobal;

  const result = await prisma.$transaction(async (tx) => {
    if (tx.$executeRaw)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.id}))`;
    const existing = await tx.athleteDiscovery?.findUnique({
      where: { userId: actor.id },
    });
    if (existing?.baselineId)
      return { status: 'COMPLETED', snapshot: { id: existing.baselineId } };

    // Riletta sotto il lock: una disponibilità salvata dal profilo nel
    // frattempo vale comunque sulle risposte congelate.
    const saved = await tx.userOnboardingAssessment.findUnique({
      where: { userId: actor.id },
      select: { profileJson: true },
    });
    const profileJson = withSavedAvailability(
      profile,
      saved?.profileJson,
    ) as Prisma.InputJsonValue;
    await tx.userOnboardingAssessment.upsert({
      where: { userId: actor.id },
      update: {
        status: 'COMPLETED',
        answersJson: normalizedAnswers.map((answer) => ({
          ...serializeAnswer(answer),
        })) as Prisma.InputJsonValue,
        profileJson,
        completedAt: new Date(),
      },
      create: {
        userId: actor.id,
        status: 'COMPLETED',
        answersJson: normalizedAnswers.map((answer) => ({
          ...serializeAnswer(answer),
        })) as Prisma.InputJsonValue,
        profileJson,
        completedAt: new Date(),
      },
    });

    const snapshot = await tx.performanceProfileSnapshot.create({
      data: {
        userId: actor.id,
        rankingGlobal,
        reason: baseline?.reason ?? 'Baseline questionario iniziale',
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

    await tx.athleteDiscovery?.updateMany({
      where: { userId: actor.id },
      data: { baselineId: snapshot.id, phase: 'RESULT', operationAt: null },
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
      // P resta nello snapshot per i professionisti, non nella risposta all'atleta.
      areas: scoredAreas.map((a) => ({
        areaId: a.areaId,
        areaName: a.areaName,
        realR: a.realR,
        answers: a.answers,
      })),
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

export async function prepareCompletedOnboarding(
  prisma: PrismaService,
  actor: Actor,
  goalTextInput: string,
  answers: OnboardingAnswer[],
) {
  const goalText = goalTextInput.trim();
  if (goalText.length < 10) {
    throw new BadRequestException('L obiettivo performance e obbligatorio');
  }
  const templates = await loadQuestionnaireQuestions(prisma, actor.id);
  const normalizedAnswers = normalizeAnswersForQuestions(templates, answers);
  // Anche la validazione dell'obiettivo legge la disponibilità aggiornata.
  const saved = await prisma.userOnboardingAssessment.findUnique({
    where: { userId: actor.id },
    select: { profileJson: true },
  });
  const profile = withSavedAvailability(
    buildGeneralProfile(normalizedAnswers),
    saved?.profileJson,
  );

  const areaScores = new Map<
    string,
    {
      areaId: string;
      areaName: string;
      total: number;
      count: number;
      answers: unknown[];
    }
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
    const current = areaScores.get(template.areaId) ?? {
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
    scoredAreas.reduce((sum, area) => sum + area.realR, 0) / scoredAreas.length,
  );
  const sportContext = await requireSportContext(prisma, actor.id);
  const configuredAreas = sportContext.areas;

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
