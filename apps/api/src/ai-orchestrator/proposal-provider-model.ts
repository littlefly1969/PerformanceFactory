export type AiScaleConfig = {
  minScore: number;
  maxScore: number;
  potentialStep: number;
  thresholdRatio: number;
};

export type AiAreaInput = {
  id: string;
  name: string;
};

export type AiSnapshotInput = {
  id: string;
  rankingGlobal: number;
  reason: string;
  createdAt: Date;
  areas: Array<{
    areaId: string;
    realR: number;
    potentialP: number;
    area: { id: string; name: string };
  }>;
} | null;

export type TrainingCycleContext = {
  sport: { key: string; label: string } | null;
  specialization: { key: string; label: string } | null;
  currentState: Array<{
    areaId: string;
    score: number;
    level: string;
    updatedAt: Date;
  }>;
  metrics: Array<{ areaId: string; date: Date; metric: string; value: number }>;
  previousCycle: null | {
    id: string;
    version: number;
    status: string;
    cycleStatus: string;
    archivedAt: Date | null;
    sessions: Array<{
      scheduledDate: Date;
      status: string;
      completedAt: Date | null;
      skippedAt: Date | null;
      completionNotes: string | null;
      completionRating: number | null;
      trainingPlanItem: { title: string; body: string };
    }>;
    questionSets: Array<{
      status: string;
      closedAt: Date | null;
      questions: Array<{
        text: string;
        answers: Array<{
          scoreAwarded: number;
          answeredAt: Date;
          answerOption: { label: string } | null;
        }>;
      }>;
    }>;
  };
};

export type AiCycleContext = {
  training?: TrainingCycleContext;
  athlete: {
    performanceGoal?: string | null;
    generalAnamnesis: unknown;
    targetAreaAnamnesis: unknown;
    areaLevel: string;
  };
  targetArea: {
    name: string;
  };
  cycle: {
    nextVersion: number;
  };
  performance: {
    latestSnapshot: null | {
      rankingGlobal: number;
      targetArea: null | {
        realR: number;
        potentialP: number;
        gap: number;
      };
      otherAreas: Array<{
        areaName: string;
        realR: number;
        potentialP: number;
        gap: number;
      }>;
    };
  };
  history: {
    olderCyclesSummary: {
      scope: 'AREA' | 'TRAINING';
      targetLabel: string;
      summaryText: string;
      summaryJson: unknown;
      coveredVersions: number[];
      updatedAt: string;
    } | null;
    previousAreaCycles: Array<{
      version: number;
      status: string;
      cycleStatus: string;
      exercises: Array<{
        title: string;
        body: string;
        status: string;
        completionRating: number | null;
        completionNotes: string | null;
        rejectionReason: string | null;
      }>;
      questionnaires: Array<{
        status: string;
        rejectionReasons: string[];
        questions: Array<{
          text: string;
          answers: Array<{
            scoreAwarded: number;
            optionLabel: string | null;
          }>;
        }>;
      }>;
    }>;
  };
  guidance: {
    areaGenerationConfig: {
      initialContext: string;
      responseFormatPrompt: string;
      questionnaireLayoutJson: unknown;
      version?: number;
      activePromptVersionId?: string | null;
    } | null;
    userAreaPromptInstruction: {
      promptVersion: string;
      updatedAt: string;
      basePrompt: string;
    } | null;
    sportSpecializationPromptInstruction: {
      sportLabel: string;
      specializationLabel: string;
      areaName: string;
      version: number;
      activePromptVersionId?: string | null;
      updatedAt: string;
      basePrompt: string;
    } | null;
    trainingPromptInstruction: {
      sportLabel: string;
      specializationLabel: string;
      version: number;
      activePromptVersionId?: string | null;
      updatedAt: string;
      basePrompt: string;
    } | null;
    planItemRequirements: string[];
    questionnaireRequirements: string[];
    safetyRules: string[];
  };
};

export type CycleProposalInput = {
  userId: string;
  area: AiAreaInput;
  nextVersion: number;
  reason: string;
  scale: AiScaleConfig;
  previousSnapshot: AiSnapshotInput;
  context: AiCycleContext;
};

export type AiProvider = 'stub' | 'openai' | 'gemini';

export type CycleProposal = {
  provider: AiProvider;
  model: string;
  promptVersion: string;
  promptHash: string;
  summaryText: string;
  audit: {
    status: 'SUCCESS';
    inputJson: Record<string, unknown>;
    outputJson: Record<string, unknown>;
    latencyMs: number;
    correlationId: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
  };
  planItems: Array<{
    type: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }>;
  questions: Array<{
    text: string;
    objectiveRef?: string;
    orderIndex: number;
    options: Array<{ label: string; score: number }>;
  }>;
};

export type CycleHistorySummaryInput = {
  userId: string;
  scope: 'AREA' | 'TRAINING';
  targetLabel: string;
  coveredCycles: unknown[];
};

export type CycleHistorySummaryResult = {
  provider: AiProvider;
  model: string;
  promptVersion: string;
  promptHash: string;
  summaryText: string;
  summaryJson: Record<string, unknown>;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown>;
  latencyMs: number;
};

export type CycleQuestionLayout = {
  questions: number;
  answerOptions: Array<{ label: string; score: number }>;
  raw: unknown;
};

export type GoalValidationInput = {
  userId: string;
  goalText: string;
  basePrompt: string;
  areas: AiAreaInput[];
  sportSelection?: {
    sportId: string;
    sportKey: string;
    sportLabel: string;
    specializationId: string;
    specializationKey: string;
    specializationLabel: string;
    label: string;
  };
  sportSpecializationPromptInstructions?: Array<{
    sportKey: string;
    specializationKey: string;
    specializationId: string;
    sportLabel: string;
    areaId: string;
    areaName: string;
    basePrompt: string;
    version: number;
  }>;
  onboardingProfile?: unknown;
  onboardingAnswers?: unknown;
  refinementContext?: {
    originalGoal: string;
    currentDraft: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    userReply: string;
  };
};

export type GoalValidationStatus =
  | 'OK'
  | 'NEEDS_ANAMNESIS'
  | 'GOAL_NEEDS_REFORMULATION'
  | 'OUT_OF_SCOPE'
  | 'UNSAFE';

export type GoalValidationResult = {
  provider: AiProvider;
  model: string;
  promptVersion: string;
  promptHash: string;
  inputJson: Record<string, unknown>;
  status: GoalValidationStatus;
  accepted: boolean;
  interpretedGoal: string;
  userMessage: string;
  suggestedReformulatedGoal: string | null;
  questionsToUser: string[];
  normalizedGoal: Record<string, unknown> | null;
  goalEvaluation: Record<string, unknown>;
  nextStep: string;
  rejectionReason: string | null;
  areaPrompts: Array<{
    areaId: string;
    areaName: string;
    promptText: string;
  }>;
};

export type SpecialistOnboardingQuestionInput = {
  userId: string;
  goalText: string;
  interpretedGoal: string;
  normalizedGoal?: unknown;
  sportSelection?: {
    sportId: string;
    sportKey: string;
    sportLabel: string;
    specializationId: string;
    specializationKey: string;
    specializationLabel: string;
    label: string;
  };
  sportSpecializationPromptInstructions?: Array<{
    sportKey: string;
    specializationKey: string;
    specializationId: string;
    sportLabel: string;
    areaId: string;
    areaName: string;
    basePrompt: string;
    version: number;
  }>;
  generalProfile: unknown;
  generalAnswers: unknown;
  areas: AiAreaInput[];
};

export type SpecialistOnboardingQuestionResult = {
  provider: AiProvider;
  model: string;
  promptVersion: string;
  promptHash: string;
  inputJson: Record<string, unknown>;
  areaQuestions: Array<{
    areaId: string;
    areaName: string;
    questions: Array<{ text: string; orderIndex: number }>;
  }>;
};

export const PROMPT_VERSION = 'cycle-proposal-v2';

export const GOAL_VALIDATION_VERSION = 'goal-validation-v1';

export const SPECIALIST_ONBOARDING_QUESTIONS_VERSION =
  'specialist-onboarding-questions-v1';

export const HISTORY_SUMMARY_VERSION = 'cycle-history-summary-v1';

export const QUESTIONS_PER_AREA = 3;

export const EXTERNAL_AI_PROVIDERS: AiProvider[] = ['openai', 'gemini'];

export const SYSTEM_PROMPT =
  'Sei un assistente senior di sport performance a supporto di professionisti umani. Genera una proposta di miglioramento specifica per area e le domande di monitoraggio richieste dal layout AI usando solo il contesto atleta fornito. Rispondi esclusivamente in italiano e solo con JSON valido conforme allo schema. Il lavoro deve essere pratico, misurabile, progressivo e revisionabile da un professionista. Non inventare diagnosi, indicazioni mediche, dati atleta non presenti o contesto nascosto. Se esistono lavori precedenti, usa note di completamento, punteggi e motivi di rifiuto per migliorare la proposta.';

export const DEFAULT_OPTIONS = [
  { label: 'Non ancora', score: 0 },
  { label: 'A volte', score: 50 },
  { label: 'Spesso', score: 75 },
  { label: 'Con costanza', score: 100 },
];

/** Vincoli comuni a ogni traccia schedulata: programma sportivo e aree a calendario. */
export type ScheduleConstraints = {
  operationalWindowDays: number;
  currentFrequency: { min: number; max: number };
  availability: {
    daysPerWeek: number;
    sessionDurationMinutes: number;
    preferredDays?: number[];
  };
  prescription: { minSessionsPerWeek: number; maxSessionsPerWeek: number };
};
export type TrainingConstraints = ScheduleConstraints & {
  programDurationWeeks: 4 | 12 | 52;
  operationalWindowDays: 14;
};
export type TrainingWindow = {
  startsOn: string;
  endsOn: string;
  windowDays: 14;
  macroBlock: number;
  windowInProgram: number;
  windowsPerProgram: number;
};
export type TrainingProposalInput = CycleProposalInput & {
  trainingConstraints: TrainingConstraints;
  trainingWindow: TrainingWindow;
};
export type TrainingSessionProposal = {
  type: string;
  title: string;
  body: string;
  dayOffset: number;
  durationMinutes: number;
  equipment?: string | null;
  sets?: number | null;
  reps?: string | null;
  restSeconds?: number | null;
};
export type TrainingCycleProposal = Omit<CycleProposal, 'planItems'> & {
  sessionsPerWeek: number;
  planItems: TrainingSessionProposal[];
};
export const TRAINING_PROMPT_VERSION = 'training-rolling-v1';
export const AREA_SCHEDULE_PROMPT_VERSION = 'area-schedule-v1';
/** Finestra dell'area: ricalca quella sportiva a cui e agganciata. */
export type AreaWindow = {
  startsOn: string;
  endsOn: string;
  windowDays: number;
};
export type AreaSessionProposal = TrainingSessionProposal;
export type AreaScheduleInput = CycleProposalInput & {
  scheduleConstraints: ScheduleConstraints;
  areaWindow: AreaWindow;
  freeDayOffsets: number[];
};
