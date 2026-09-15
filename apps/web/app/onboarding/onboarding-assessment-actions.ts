import { API_BASE, secureFetch } from "@/app/lib/api";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  FlowStep,
  GoalRiskResponse,
  GoalValidation,
  MessageTone,
  ONBOARDING_DRAFT_KEY,
  onboardingDraftSignature,
  readOnboardingDraft,
  SportSelection,
  StarterQuestion,
  StarterQuestionario,
  SubmitResult,
} from "./onboarding-model";
export async function loadQuestionarioAction(actionState: {
  setLoading: Dispatch<SetStateAction<boolean>>;
  setDraftReady: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setMessageTone: Dispatch<SetStateAction<MessageTone>>;
  setQuestionario: Dispatch<SetStateAction<StarterQuestionario | null>>;
  setAnswers: Dispatch<SetStateAction<Record<string, string | number>>>;
  setGoalText: Dispatch<SetStateAction<string>>;
  setSelectedSportId: Dispatch<SetStateAction<string>>;
  setSelectedSpecializationId: Dispatch<SetStateAction<string>>;
  setSportSelectionSaved: Dispatch<SetStateAction<boolean>>;
  setGoalAssistantClosed: Dispatch<SetStateAction<boolean>>;
  setFinalGoalValidated: Dispatch<SetStateAction<boolean>>;
  setFlowStep: Dispatch<SetStateAction<FlowStep>>;
  setRefinedGoalDraft: Dispatch<SetStateAction<string>>;
  setGoalValidation: Dispatch<SetStateAction<GoalValidation | null>>;
}) {
  const {
    setLoading,
    setDraftReady,
    setMessage,
    setMessageTone,
    setQuestionario,
    setAnswers,
    setGoalText,
    setSelectedSportId,
    setSelectedSpecializationId,
    setSportSelectionSaved,
    setGoalAssistantClosed,
    setFinalGoalValidated,
    setFlowStep,
    setRefinedGoalDraft,
    setGoalValidation,
  } = actionState;

  setLoading(true);
  setDraftReady(false);
  setMessage(null);
  const response = await secureFetch(`${API_BASE}/onboarding/questionnaire`);
  if (!response.ok) {
    setMessageTone("warning");
    setMessage(
      response.status === 401
        ? "Accesso richiesto."
        : "Impossibile caricare il questionario iniziale.",
    );
    setLoading(false);
    return;
  }
  const data = (await response.json()) as StarterQuestionario;
  const serverSignature = onboardingDraftSignature(data);
  const storedDraft = data.required ? readOnboardingDraft() : null;
  const draft =
    storedDraft?.serverSignature === serverSignature ? storedDraft : null;
  if (storedDraft && !draft) {
    window.sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
  }
  const validQuestionIds = new Set(
    data.questions.map((question) => question.id),
  );
  const draftAnswers = Object.fromEntries(
    Object.entries(draft?.answers ?? {}).filter(([questionId]) =>
      validQuestionIds.has(questionId),
    ),
  );
  const initialFlowStep =
    data.goalText ||
    data.questions.some((question) => question.scope === "AREA")
      ? "GOAL"
      : "ANAMNESIS";

  setQuestionario(data);
  setAnswers(draftAnswers);
  setGoalText(draft?.goalText ?? data.goalText ?? "");
  setSelectedSportId(
    draft?.selectedSportId ?? data.sportSelection?.sportId ?? "",
  );
  setSelectedSpecializationId(
    draft?.selectedSpecializationId ??
      data.sportSelection?.specializationId ??
      "",
  );
  setSportSelectionSaved(
    draft?.sportSelectionSaved ??
      Boolean(data.sportSelection?.specializationId),
  );
  setGoalAssistantClosed(draft?.goalAssistantClosed ?? Boolean(data.goalText));
  setFinalGoalValidated(
    draft?.finalGoalValidated ?? Boolean(data.goalFrozenAt),
  );
  setFlowStep(draft?.flowStep ?? initialFlowStep);
  setRefinedGoalDraft(draft?.refinedGoalDraft ?? "");
  if (draft?.goalValidation) {
    setGoalValidation(draft.goalValidation);
  }
  if (
    !draft?.goalValidation &&
    (data.validationStatus === "OK" ||
      data.validationStatus === "NEEDS_ANAMNESIS") &&
    data.interpretedGoal
  ) {
    setGoalValidation({
      status: data.validationStatus,
      accepted: data.validationStatus === "OK",
      canProceedToAnamnesis: true,
      interpretedGoal: data.interpretedGoal,
      userMessage:
        data.validationMessage ??
        `Ho capito questo obiettivo: ${data.interpretedGoal}`,
      suggestedReformulatedGoal: data.suggestedReformulatedGoal ?? null,
      questionsToUser: data.questionsToUser ?? [],
      nextStep: data.nextStep ?? null,
    });
    setGoalAssistantClosed(true);
  }
  if (!data.required) {
    window.sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
    setMessageTone("success");
    setMessage("Questionario iniziale gia completato.");
  }
  setDraftReady(true);
  setLoading(false);
}

export async function saveSportSelectionAction(actionState: {
  sportSelectionValid: boolean;
  setMessageTone: Dispatch<SetStateAction<MessageTone>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  selectedSportId: string;
  selectedSpecializationId: string;
  readError: (response: Response) => Promise<string>;
  setSelectedSportId: Dispatch<SetStateAction<string>>;
  setSelectedSpecializationId: Dispatch<SetStateAction<string>>;
  setSportSelectionSaved: Dispatch<SetStateAction<boolean>>;
}) {
  const {
    sportSelectionValid,
    setMessageTone,
    setMessage,
    selectedSportId,
    selectedSpecializationId,
    readError,
    setSelectedSportId,
    setSelectedSpecializationId,
    setSportSelectionSaved,
  } = actionState;

  if (!sportSelectionValid) {
    setMessageTone("warning");
    setMessage("Seleziona sport e specializzazione.");
    return false;
  }
  setMessage(null);
  const response = await secureFetch(`${API_BASE}/onboarding/sport-selection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sportId: selectedSportId,
      specializationId: selectedSpecializationId,
    }),
  });
  if (!response.ok) {
    setMessageTone("warning");
    setMessage(await readError(response));
    return false;
  }
  const saved = (await response.json()) as SportSelection;
  setSelectedSportId(saved.sportId);
  setSelectedSpecializationId(saved.specializationId);
  setSportSelectionSaved(true);
  setMessageTone("success");
  setMessage("Sport salvato. Ora completa l'anamnesi.");
  return true;
}

export function setQuestionAnswerAction(
  actionState: {
    setGoalRiskAcknowledged: Dispatch<SetStateAction<boolean>>;
    setFinalGoalValidated: Dispatch<SetStateAction<boolean>>;
    setPendingGoalRisk: Dispatch<SetStateAction<GoalRiskResponse | null>>;
    setAnswers: Dispatch<SetStateAction<Record<string, string | number>>>;
  },
  questionId: string,
  value: string | number,
) {
  const {
    setGoalRiskAcknowledged,
    setFinalGoalValidated,
    setPendingGoalRisk,
    setAnswers,
  } = actionState;

  setGoalRiskAcknowledged(false);
  setFinalGoalValidated(false);
  setPendingGoalRisk(null);
  setAnswers((prev) => ({
    ...prev,
    [questionId]: value,
  }));
}

export async function confirmAnamnesisAction(actionState: {
  sportSelectionValid: boolean;
  setMessageTone: Dispatch<SetStateAction<MessageTone>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  sportSelectionSaved: boolean;
  saveSportSelection: () => Promise<boolean>;
  generalAnswersComplete: boolean;
  setFlowStep: Dispatch<SetStateAction<FlowStep>>;
}) {
  const {
    sportSelectionValid,
    setMessageTone,
    setMessage,
    sportSelectionSaved,
    saveSportSelection,
    generalAnswersComplete,
    setFlowStep,
  } = actionState;

  if (!sportSelectionValid) {
    setMessageTone("warning");
    setMessage("Seleziona uno o due sport prima di confermare.");
    return;
  }
  if (!sportSelectionSaved) {
    const saved = await saveSportSelection();
    if (!saved) {
      return;
    }
  }
  if (!generalAnswersComplete) {
    setMessageTone("warning");
    setMessage(
      "Completa tutte le domande anamnestiche generali prima di continuare.",
    );
    return;
  }
  setFlowStep("GOAL");
  setMessageTone("success");
  setMessage("Anamnesi confermata. Ora definisci l'obiettivo.");
}

export async function generateSpecialistQuestionsAction(actionState: {
  questionnaire: StarterQuestionario | null;
  generalComplete: boolean;
  setMessageTone: Dispatch<SetStateAction<MessageTone>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setGeneratingSpecialistQuestions: Dispatch<SetStateAction<boolean>>;
  goalText: string;
  generalQuestions: StarterQuestion[];
  answers: Record<string, string | number>;
  showWarning: (title: string, detail: string) => void;
  readError: (response: Response) => Promise<string>;
  setQuestionario: Dispatch<SetStateAction<StarterQuestionario | null>>;
  setFinalGoalValidated: Dispatch<SetStateAction<boolean>>;
  setGoalRiskAcknowledged: Dispatch<SetStateAction<boolean>>;
  setPendingGoalRisk: Dispatch<SetStateAction<GoalRiskResponse | null>>;
}) {
  const {
    questionnaire,
    generalComplete,
    setMessageTone,
    setMessage,
    setGeneratingSpecialistQuestions,
    goalText,
    generalQuestions,
    answers,
    showWarning,
    readError,
    setQuestionario,
    setFinalGoalValidated,
    setGoalRiskAcknowledged,
    setPendingGoalRisk,
  } = actionState;

  if (!questionnaire || !generalComplete) {
    setMessageTone("warning");
    setMessage(
      "Completa prima anamnesi generale e obiettivo per generare le domande specialistiche.",
    );
    return;
  }
  setGeneratingSpecialistQuestions(true);
  setMessage(null);
  const response = await secureFetch(
    `${API_BASE}/onboarding/specialist-questions/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalText: goalText.trim(),
        answers: generalQuestions.map((question) => ({
          questionId: question.id,
          value: answers[question.id],
        })),
      }),
    },
  );
  if (!response.ok) {
    showWarning("Errore API AI", await readError(response));
    setGeneratingSpecialistQuestions(false);
    return;
  }
  const data = (await response.json()) as {
    questions: StarterQuestion[];
  };
  setQuestionario((current) =>
    current ? { ...current, questions: data.questions } : current,
  );
  setFinalGoalValidated(false);
  setGoalRiskAcknowledged(false);
  setPendingGoalRisk(null);
  setMessageTone("success");
  setMessage(
    "Domande specialistiche generate in base all'obiettivo e salvate sulla base dati.",
  );
  setGeneratingSpecialistQuestions(false);
}

export async function submitAction(actionState: {
  questionnaire: StarterQuestionario | null;
  completed: boolean;
  setMessageTone: Dispatch<SetStateAction<MessageTone>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setSubmitting: Dispatch<SetStateAction<boolean>>;
  goalText: string;
  answers: Record<string, string | number>;
  readError: (response: Response) => Promise<string>;
  setResult: Dispatch<SetStateAction<SubmitResult | null>>;
  setRedirecting: Dispatch<SetStateAction<boolean>>;
  redirectTimeout: RefObject<number | null>;
}) {
  const {
    questionnaire,
    completed,
    setMessageTone,
    setMessage,
    setSubmitting,
    goalText,
    answers,
    readError,
    setResult,
    setRedirecting,
    redirectTimeout,
  } = actionState;

  if (!questionnaire || !completed) {
    setMessageTone("warning");
    setMessage("Rispondi a tutte le domande prima di continuare.");
    return;
  }

  setSubmitting(true);
  setMessage(null);
  const response = await secureFetch(`${API_BASE}/onboarding/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goalText,
      answers: questionnaire.questions.map((question) => ({
        questionId: question.id,
        value: answers[question.id],
      })),
    }),
  });

  if (!response.ok) {
    setMessageTone("warning");
    setMessage(await readError(response));
    setSubmitting(false);
    return;
  }

  setResult((await response.json()) as SubmitResult);
  window.sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
  setMessageTone("success");
  setMessage("Anamnesi iniziale creata. Apertura ambiente atleta...");
  setSubmitting(false);
  setRedirecting(true);
  redirectTimeout.current = window.setTimeout(() => {
    window.location.href = "/user";
  }, 1200);
}
