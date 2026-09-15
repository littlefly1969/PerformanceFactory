import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import {
  loadAreaGenerationConfig,
  loadSportSpecializationPromptInstruction,
  loadTrainingPromptInstruction,
} from './cycle-guidance';
import {
  loadAreaCycleHistory,
  loadOrCreateOlderCyclesSummary,
} from './cycle-history';
import { AreaRecord, RECENT_HISTORY_CYCLES } from './orchestrator-model';
import { CycleProposalInput } from './proposal-provider.service';

export function buildAiCycleContext(input: {
  userId: string;
  area: AreaRecord;
  nextVersion: number;
  reason: string;
  scale: {
    minScore: number;
    maxScore: number;
    potentialStep: number;
    thresholdRatio: number;
  };
  previousSnapshot: CycleProposalInput['previousSnapshot'];
  history: Awaited<ReturnType<typeof loadAreaCycleHistory>>;
  olderCyclesSummary: Awaited<
    ReturnType<typeof loadOrCreateOlderCyclesSummary>
  >;
  onboardingAssessment: {
    answersJson: Prisma.JsonValue | null;
    profileJson: Prisma.JsonValue | null;
  } | null;
  areaLevel: string;
  areaGenerationConfig: Awaited<ReturnType<typeof loadAreaGenerationConfig>>;
  userAreaPromptInstruction: {
    promptText: string;
    promptVersion: string;
    updatedAt: Date;
    goal: { goalText: string };
  } | null;
  sportSpecializationPromptInstruction: Awaited<
    ReturnType<typeof loadSportSpecializationPromptInstruction>
  >;
  trainingPromptInstruction: Awaited<
    ReturnType<typeof loadTrainingPromptInstruction>
  >;
}): CycleProposalInput['context'] {
  const latestAreas =
    input.previousSnapshot?.areas.map((area) => ({
      areaName: area.area.name,
      realR: area.realR,
      potentialP: area.potentialP,
      gap: Math.max(0, area.potentialP - area.realR),
    })) ?? [];
  const targetArea = input.previousSnapshot?.areas.find(
    (area) => area.areaId === input.area.id,
  );
  const targetAreaPerformance = targetArea
    ? {
        realR: roundScore(targetArea.realR),
        potentialP: roundScore(targetArea.potentialP),
        gap: roundScore(Math.max(0, targetArea.potentialP - targetArea.realR)),
      }
    : null;
  const onboardingAnswers = input.onboardingAssessment?.answersJson ?? null;

  return {
    athlete: {
      performanceGoal: input.userAreaPromptInstruction?.goal.goalText ?? null,
      generalAnamnesis: buildGeneralAnamnesis(
        input.onboardingAssessment?.profileJson ?? null,
        onboardingAnswers,
      ),
      targetAreaAnamnesis: buildTargetAreaAnamnesis(
        onboardingAnswers,
        input.area.id,
        input.area.name,
      ),
      areaLevel: input.areaLevel,
    },
    targetArea: {
      name: input.area.name,
    },
    cycle: {
      nextVersion: input.nextVersion,
    },
    performance: {
      latestSnapshot: input.previousSnapshot
        ? {
            rankingGlobal: input.previousSnapshot.rankingGlobal,
            targetArea: targetAreaPerformance,
            otherAreas: latestAreas
              .filter((area) => area.areaName !== input.area.name)
              .map((area) => ({
                areaName: area.areaName,
                realR: roundScore(area.realR),
                potentialP: roundScore(area.potentialP),
                gap: roundScore(area.gap),
              })),
          }
        : null,
    },
    history: {
      olderCyclesSummary: input.olderCyclesSummary
        ? {
            scope: input.olderCyclesSummary.scope as 'AREA' | 'TRAINING',
            targetLabel: input.olderCyclesSummary.targetLabel,
            summaryText: input.olderCyclesSummary.summaryText,
            summaryJson: input.olderCyclesSummary.summaryJson,
            coveredVersions: Array.isArray(
              input.olderCyclesSummary.coveredVersionsJson,
            )
              ? input.olderCyclesSummary.coveredVersionsJson.filter(
                  (version): version is number => typeof version === 'number',
                )
              : [],
            updatedAt: input.olderCyclesSummary.updatedAt.toISOString(),
          }
        : null,
      previousAreaCycles: input.history
        .slice(0, RECENT_HISTORY_CYCLES)
        .map((cycle) => compactCycleForPrompt(cycle)),
    },
    guidance: {
      areaGenerationConfig: input.areaGenerationConfig
        ? {
            initialContext: input.areaGenerationConfig.initialContext,
            responseFormatPrompt:
              input.areaGenerationConfig.responseFormatPrompt,
            questionnaireLayoutJson:
              input.areaGenerationConfig.questionnaireLayoutJson,
            version: input.areaGenerationConfig.version,
            activePromptVersionId:
              input.areaGenerationConfig.activePromptVersionId,
          }
        : null,
      userAreaPromptInstruction: input.userAreaPromptInstruction
        ? {
            promptVersion: input.userAreaPromptInstruction.promptVersion,
            updatedAt: input.userAreaPromptInstruction.updatedAt.toISOString(),
            basePrompt: input.userAreaPromptInstruction.promptText,
          }
        : null,
      sportSpecializationPromptInstruction:
        input.sportSpecializationPromptInstruction
          ? {
              sportLabel:
                input.sportSpecializationPromptInstruction.specialization.sport
                  .label,
              specializationLabel:
                input.sportSpecializationPromptInstruction.specialization.label,
              areaName: input.sportSpecializationPromptInstruction.area.name,
              version: input.sportSpecializationPromptInstruction.version,
              activePromptVersionId:
                input.sportSpecializationPromptInstruction
                  .activePromptVersionId,
              updatedAt:
                input.sportSpecializationPromptInstruction.updatedAt.toISOString(),
              basePrompt: input.sportSpecializationPromptInstruction.basePrompt,
            }
          : null,
      trainingPromptInstruction: input.trainingPromptInstruction
        ? {
            sportLabel: input.trainingPromptInstruction.sport.label,
            specializationLabel: input.trainingPromptInstruction.label,
            version: input.trainingPromptInstruction.trainingPromptVersion,
            activePromptVersionId:
              input.trainingPromptInstruction.activeTrainingPromptVersionId,
            updatedAt: input.trainingPromptInstruction.updatedAt.toISOString(),
            basePrompt: input.trainingPromptInstruction.trainingPrompt,
          }
        : null,
      planItemRequirements: [
        'Fonda ogni attivita sui punteggi dell area target, sulle note di completamento precedenti e sui motivi di rifiuto gia presenti.',
        'Ogni attivita deve essere abbastanza concreta da poter essere eseguita dall atleta senza spiegazioni aggiuntive.',
        'Includi criteri di successo misurabili, frequenza o trigger e una progressione chiara.',
      ],
      questionnaireRequirements: [
        'Crea il numero di domande richiesto dal layout AI dell area target.',
        'Le domande devono monitorare esecuzione o aderenza al lavoro proposto, non l umore generico.',
        'Evita di duplicare domande precedenti salvo quando la continuita e utile; se le ripeti, rendi chiaro il motivo nella formulazione.',
      ],
      safetyRules: [
        'Non diagnosticare infortuni e non fare affermazioni mediche.',
        'Non prescrivere carichi, integratori o trattamenti non sicuri.',
        'Mantieni le raccomandazioni adatte alla revisione professionale prima della pubblicazione.',
      ],
    },
  };
}

export function compactCycleForPrompt(
  cycle: Awaited<ReturnType<typeof loadAreaCycleHistory>>[number],
) {
  return {
    version: cycle.version,
    status: cycle.status,
    cycleStatus: cycle.cycleStatus,
    exercises: cycle.items.map((item) => ({
      title: item.title,
      body: item.body,
      status: item.status,
      completionRating: item.completionRating,
      completionNotes: item.completionNotes,
      rejectionReason: item.rejectionReason,
    })),
    questionnaires: cycle.questionSets.map((set) => ({
      status: set.status,
      rejectionReasons: set.approvals
        .map((approval) => approval.rejectionReason)
        .filter((reason): reason is string => Boolean(reason)),
      questions: set.questions.map((question) => ({
        text: question.text,
        answers: question.answers.map((answer) => ({
          scoreAwarded: answer.scoreAwarded,
          optionLabel: answer.answerOption?.label ?? null,
        })),
      })),
    })),
  };
}

export function buildGeneralAnamnesis(
  profileJson: Prisma.JsonValue | null,
  answersJson: Prisma.JsonValue | null,
) {
  if (
    profileJson &&
    typeof profileJson === 'object' &&
    !Array.isArray(profileJson)
  ) {
    return profileJson;
  }

  const answers = Array.isArray(answersJson) ? answersJson : [];
  const generalAnswers = answers
    .map((answer) => normalizeOnboardingAnswer(answer))
    .filter(isNormalizedOnboardingAnswer)
    .filter((answer) => answer?.scope === 'GENERAL')
    .map((answer) => ({
      label: answer.label ?? answer.key,
      value: answer.value,
    }));

  return generalAnswers.length ? generalAnswers : null;
}

export function buildTargetAreaAnamnesis(
  answersJson: Prisma.JsonValue | null,
  areaId: string,
  areaName: string,
) {
  const answers = Array.isArray(answersJson) ? answersJson : [];
  const normalized = answers
    .map((answer) => normalizeOnboardingAnswer(answer))
    .filter(isNormalizedOnboardingAnswer);

  const structured = normalized
    .filter(
      (answer) =>
        answer?.scope === 'AREA' &&
        (answer.areaId === areaId || answer.areaName === areaName),
    )
    .map((answer) => ({
      label: answer.label ?? answer.key ?? areaName,
      value: answer.value,
      score: answer.score,
    }));
  if (structured.length) {
    return structured;
  }

  const legacy = normalized.find(
    (answer) => answer?.areaId === areaId || answer?.areaName === areaName,
  );
  if (!legacy) {
    return null;
  }
  return {
    areaName: legacy.areaName ?? areaName,
    realR: legacy.realR,
    potentialP: legacy.potentialP,
  };
}

export function normalizeOnboardingAnswer(value: Prisma.JsonValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as {
    key?: string;
    scope?: string;
    areaId?: string;
    areaName?: string;
    label?: string;
    value?: Prisma.JsonValue;
    score?: number | null;
    realR?: number;
    potentialP?: number;
  };
}

export function isNormalizedOnboardingAnswer(
  this: void,
  value: ReturnType<typeof normalizeOnboardingAnswer>,
): value is NonNullable<ReturnType<typeof normalizeOnboardingAnswer>> {
  return value !== null;
}

export function roundScore(value: number) {
  return Math.round(value * 10) / 10;
}

export function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function levelFromSnapshot(
  snapshot: CycleProposalInput['previousSnapshot'],
  areaId: string,
) {
  const area = snapshot?.areas.find((item) => item.areaId === areaId);
  if (!area) {
    return 'BASELINE';
  }
  if (area.realR >= 80) {
    return 'ADVANCED';
  }
  if (area.realR >= 60) {
    return 'STABLE';
  }
  return 'BASELINE';
}

export function toIsoOrNull(value?: Date | null) {
  return value ? value.toISOString() : null;
}
