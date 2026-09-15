export type StarterOption = { value: number; label: string };

export type StarterQuestion = {
  id: string;
  key: string;
  scope: "GENERAL" | "AREA";
  areaId?: string | null;
  areaName?: string | null;
  text: string;
  helpText?: string | null;
  inputType: "TEXT" | "NUMBER" | "SELECT" | "SCORE";
  required: boolean;
  options: Array<{ value: string | number; label: string }>;
};

export type StarterQuestionario = {
  required: boolean;
  status: string;
  sportSelection?: SportSelection | null;
  sports?: SportOption[];
  goalText?: string;
  interpretedGoal?: string | null;
  suggestedReformulatedGoal?: string | null;
  questionsToUser?: string[];
  nextStep?: string | null;
  validationStatus?: string;
  validationMessage?: string | null;
  goalFrozenAt?: string | null;
  updatedAt?: string | null;
  goalUpdatedAt?: string | null;
  title: string;
  description: string;
  options: StarterOption[];
  questions: StarterQuestion[];
};

export type SubmitResult = {
  status: string;
  goalValidation?: {
    status?: GoalValidation["status"];
    interpretedGoal: string;
    userMessage: string;
  };
  areas: Array<{
    areaId: string;
    areaName: string;
    realR: number;
    potentialP: number;
  }>;
};

export type GoalRiskResponse = {
  code?: string;
  message?: string;
  goalValidation?: Partial<GoalValidation> & {
    userMessage?: string;
  };
};

export type GoalValidation = {
  status:
    | "OK"
    | "NEEDS_ANAMNESIS"
    | "GOAL_NEEDS_REFORMULATION"
    | "OUT_OF_SCOPE"
    | "UNSAFE";
  accepted: boolean;
  canProceedToAnamnesis: boolean;
  interpretedGoal: string;
  userMessage: string;
  suggestedReformulatedGoal?: string | null;
  questionsToUser?: string[];
  nextStep?: string | null;
  rejectionReason?: string | null;
};

export type SportSpecializationOption = {
  id: string;
  key: string;
  label: string;
};

export type SportOption = {
  id: string;
  key: string;
  label: string;
  specializations: SportSpecializationOption[];
};

export type SportSelection = {
  sportId: string;
  sportKey: string;
  sportLabel: string;
  specializationId: string;
  specializationKey: string;
  specializationLabel: string;
  label?: string;
};

export type GoalChatMessage = {
  role: "assistant" | "user";
  content: string;
};

export type GoalRefinement = GoalValidation & {
  assistantMessage: string;
  refinedGoalText: string;
};

export type MessageTone = "success" | "warning";

export type FlowStep = "ANAMNESIS" | "GOAL";

export type WarningPopup = {
  title: string;
  message: string;
};

export type OnboardingDraft = {
  answers?: Record<string, string | number>;
  goalText?: string;
  selectedSportId?: string;
  selectedSpecializationId?: string;
  sportSelectionSaved?: boolean;
  flowStep?: FlowStep;
  goalAssistantClosed?: boolean;
  finalGoalValidated?: boolean;
  goalValidation?: GoalValidation | null;
  refinedGoalDraft?: string;
  serverSignature?: string;
};

export const ONBOARDING_DRAFT_KEY = "performance:onboarding:draft:v1";

export const readOnboardingDraft = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as OnboardingDraft) : null;
  } catch {
    window.sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
    return null;
  }
};

export const onboardingDraftSignature = (data: StarterQuestionario) =>
  [
    data.sportSelection?.sportId ?? "no-sport",
    data.sportSelection?.specializationId ?? "no-specialization",
    data.goalUpdatedAt ?? "no-goal",
    data.goalFrozenAt ?? "no-frozen-goal",
    data.updatedAt ?? "no-assessment",
    data.questions
      .filter((question) => question.scope === "AREA")
      .map((question) => question.id)
      .sort()
      .join(",") || "no-specialist-questions",
  ].join("|");
