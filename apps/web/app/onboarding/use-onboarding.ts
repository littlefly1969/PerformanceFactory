"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  confirmAnamnesisAction,
  generateSpecialistQuestionsAction,
  loadQuestionarioAction,
  saveSportSelectionAction,
  setQuestionAnswerAction,
  submitAction,
} from "./onboarding-assessment-actions";
import {
  confirmGoalContextAction,
  confirmSuggestedGoalFromRiskAction,
  openGoalAssistantAction,
  openGoalConfirmationAction,
  openGoalRevisionFromRiskAction,
  refineGoalAction,
  useRefinedGoalAction,
  validateFinalGoalAction,
} from "./onboarding-goal-actions";
import {
  FlowStep,
  GoalChatMessage,
  GoalRiskResponse,
  GoalValidation,
  MessageTone,
  ONBOARDING_DRAFT_KEY,
  OnboardingDraft,
  onboardingDraftSignature,
  StarterOption,
  StarterQuestionario,
  SubmitResult,
  WarningPopup,
} from "./onboarding-model";
export function useOnboarding() {
  const [questionnaire, setQuestionario] = useState<StarterQuestionario | null>(
    null,
  );
  const [goalText, setGoalText] = useState("");
  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSpecializationId, setSelectedSpecializationId] = useState("");
  const [sportSelectionSaved, setSportSelectionSaved] = useState(false);
  const [goalValidation, setGoalValidation] = useState<GoalValidation | null>(
    null,
  );
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<MessageTone>("warning");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatingSpecialistQuestions, setGeneratingSpecialistQuestions] =
    useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalChatMessages, setGoalChatMessages] = useState<GoalChatMessage[]>(
    [],
  );
  const [goalChatInput, setGoalChatInput] = useState("");
  const [refinedGoalDraft, setRefinedGoalDraft] = useState("");
  const [refiningGoal, setRefiningGoal] = useState(false);
  const [goalAssistantClosed, setGoalAssistantClosed] = useState(false);
  const [flowStep, setFlowStep] = useState<FlowStep>("ANAMNESIS");
  const [goalRiskModalOpen, setGoalRiskModalOpen] = useState(false);
  const [pendingGoalRisk, setPendingGoalRisk] =
    useState<GoalRiskResponse | null>(null);
  const [goalRiskAcknowledged, setGoalRiskAcknowledged] = useState(false);
  const [warningPopup, setWarningPopup] = useState<WarningPopup | null>(null);
  const [finalGoalValidated, setFinalGoalValidated] = useState(false);
  const [validatingFinalGoal, setValidatingFinalGoal] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const redirectTimeout = useRef<number | null>(null);
  const radarAree = useMemo(
    () =>
      result?.areas.map((area) => ({
        id: area.areaId,
        label: area.areaName,
        real: area.realR,
        potential: area.potentialP,
      })) ?? [],
    [result],
  );
  const goalIsValidated = goalValidation?.canProceedToAnamnesis === true;
  const generalQuestions = useMemo(
    () =>
      questionnaire?.questions.filter(
        (question) => question.scope === "GENERAL",
      ) ?? [],
    [questionnaire?.questions],
  );
  const specialistQuestions = useMemo(
    () =>
      questionnaire?.questions.filter(
        (question) => question.scope === "AREA",
      ) ?? [],
    [questionnaire?.questions],
  );
  const specialistQuestionsGenerated = specialistQuestions.length > 0;
  const visibleQuestions =
    flowStep === "ANAMNESIS" ? generalQuestions : specialistQuestions;
  const goalReady = sportSelectionSaved && goalText.trim().length >= 10;
  const goalConfirmed = goalReady && goalAssistantClosed;
  const sports = questionnaire?.sports ?? [];
  const selectedSport = sports.find((sport) => sport.id === selectedSportId);
  const specializationOptions = selectedSport?.specializations ?? [];
  const sportSelectionValid =
    Boolean(selectedSportId) && Boolean(selectedSpecializationId);
  const generalAnswersComplete =
    generalQuestions.length > 0 &&
    generalQuestions.every(
      (question) =>
        !question.required ||
        (answers[question.id] !== undefined && answers[question.id] !== ""),
    );
  const generalComplete = sportSelectionSaved && generalAnswersComplete;
  const completed = questionnaire
    ? goalConfirmed &&
      specialistQuestionsGenerated &&
      questionnaire.questions.every(
        (question) =>
          !question.required ||
          (answers[question.id] !== undefined && answers[question.id] !== ""),
      )
    : false;
  const canCreatePerformance = completed && finalGoalValidated;
  const validationLocksQuestionList = finalGoalValidated && completed;
  const specialistScoreOptions: StarterOption[] = [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4" },
    { value: 5, label: "5" },
  ];
  const showGoalValidationResult =
    flowStep === "GOAL" &&
    validationLocksQuestionList &&
    Boolean(goalValidation);
  const missingRequiredAnswers = questionnaire
    ? questionnaire.questions.filter(
        (question) =>
          question.required &&
          (answers[question.id] === undefined || answers[question.id] === ""),
      ).length
    : 0;
  const showWarning = (title: string, detail: string) => {
    setMessageTone("warning");
    setMessage(detail);
    setWarningPopup({ title, message: detail });
  };
  const loadQuestionario = () =>
    loadQuestionarioAction({
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
    });
  const readError = async (response: Response) => {
    try {
      const data = (await response.json()) as { message?: string };
      return data.message ?? "Il questionario iniziale non puo essere salvato.";
    } catch {
      return "Il questionario iniziale non puo essere salvato.";
    }
  };
  const openGoalAssistant = (
    validation: GoalValidation,
    refinedDraft = goalText,
  ) =>
    openGoalAssistantAction(
      {
        goalText,
        setRefinedGoalDraft,
        setGoalChatMessages,
        setGoalChatInput,
        setGoalModalOpen,
      },
      validation,
      refinedDraft,
    );
  const openGoalConfirmation = (
    validation: GoalValidation,
    refinedDraft = goalText,
  ) =>
    openGoalConfirmationAction(
      {
        goalText,
        setRefinedGoalDraft,
        setGoalChatMessages,
        setGoalChatInput,
        setGoalAssistantClosed,
        setGoalModalOpen,
      },
      validation,
      refinedDraft,
    );
  const openGoalRevisionFromRisk = () =>
    openGoalRevisionFromRiskAction({
      pendingGoalRisk,
      setGoalValidation,
      goalText,
      setRefinedGoalDraft,
      setGoalChatMessages,
      setGoalChatInput,
      setGoalRiskAcknowledged,
      setFinalGoalValidated,
      setPendingGoalRisk,
      setGoalRiskModalOpen,
      setGoalAssistantClosed,
      setGoalModalOpen,
    });
  const confirmSuggestedGoalFromRisk = () =>
    confirmSuggestedGoalFromRiskAction({
      pendingGoalRisk,
      setGoalText,
      setGoalRiskModalOpen,
      setPendingGoalRisk,
      setGoalRiskAcknowledged,
      setGoalAssistantClosed,
      validateFinalGoal,
    });
  const saveSportSelection = () =>
    saveSportSelectionAction({
      sportSelectionValid,
      setMessageTone,
      setMessage,
      selectedSportId,
      selectedSpecializationId,
      readError,
      setSelectedSportId,
      setSelectedSpecializationId,
      setSportSelectionSaved,
    });
  const setQuestionAnswer = (questionId: string, value: string | number) =>
    setQuestionAnswerAction(
      {
        setGoalRiskAcknowledged,
        setFinalGoalValidated,
        setPendingGoalRisk,
        setAnswers,
      },
      questionId,
      value,
    );
  const confirmAnamnesis = () =>
    confirmAnamnesisAction({
      sportSelectionValid,
      setMessageTone,
      setMessage,
      sportSelectionSaved,
      saveSportSelection,
      generalAnswersComplete,
      setFlowStep,
    });
  const confirmGoalContext = () =>
    confirmGoalContextAction({
      sportSelectionSaved,
      saveSportSelection,
      goalText,
      setGoalValidation,
      openGoalAssistant,
      setGoalAssistantClosed,
      setGoalRiskAcknowledged,
      setFinalGoalValidated,
      setPendingGoalRisk,
      setMessageTone,
      setMessage,
    });
  const refineGoal = () =>
    refineGoalAction({
      goalChatInput,
      refiningGoal,
      goalChatMessages,
      setGoalChatMessages,
      setGoalChatInput,
      setRefiningGoal,
      goalText,
      refinedGoalDraft,
      readError,
      showWarning,
      setRefinedGoalDraft,
      setGoalValidation,
      setMessageTone,
      setMessage,
    });
  const useRefinedGoal = () =>
    useRefinedGoalAction({
      refinedGoalDraft,
      goalValidation,
      setGoalText,
      setGoalModalOpen,
      setGoalAssistantClosed,
      setMessageTone,
      setMessage,
      completed,
      validateFinalGoal,
    });
  const generateSpecialistQuestions = () =>
    generateSpecialistQuestionsAction({
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
    });
  const validateFinalGoal = (goalOverride?: string) =>
    validateFinalGoalAction(
      {
        questionnaire,
        completed,
        setMessageTone,
        setMessage,
        goalText,
        setValidatingFinalGoal,
        answers,
        setPendingGoalRisk,
        setGoalRiskModalOpen,
        setGoalValidation,
        showWarning,
        readError,
        setGoalText,
        setFinalGoalValidated,
        setGoalRiskAcknowledged,
      },
      goalOverride,
    );
  useEffect(() => {
    void loadQuestionario();

    return () => {
      if (redirectTimeout.current) {
        window.clearTimeout(redirectTimeout.current);
      }
    };
  }, []);
  useEffect(() => {
    if (
      !draftReady ||
      !questionnaire?.required ||
      typeof window === "undefined"
    ) {
      return;
    }
    const validQuestionIds = new Set(
      questionnaire.questions.map((question) => question.id),
    );
    const draftAnswers = Object.fromEntries(
      Object.entries(answers).filter(([questionId]) =>
        validQuestionIds.has(questionId),
      ),
    );
    const draft: OnboardingDraft = {
      answers: draftAnswers,
      goalText,
      selectedSportId,
      selectedSpecializationId,
      sportSelectionSaved,
      flowStep,
      goalAssistantClosed,
      finalGoalValidated,
      goalValidation,
      refinedGoalDraft,
      serverSignature: onboardingDraftSignature(questionnaire),
    };
    window.sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
  }, [
    answers,
    draftReady,
    finalGoalValidated,
    flowStep,
    goalAssistantClosed,
    goalText,
    goalValidation,
    questionnaire,
    refinedGoalDraft,
    selectedSpecializationId,
    selectedSportId,
    sportSelectionSaved,
  ]);
  const submit = () =>
    submitAction({
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
    });
  return {
    questionnaire,
    setQuestionario,
    goalText,
    setGoalText,
    selectedSportId,
    setSelectedSportId,
    selectedSpecializationId,
    setSelectedSpecializationId,
    sportSelectionSaved,
    setSportSelectionSaved,
    goalValidation,
    setGoalValidation,
    answers,
    setAnswers,
    result,
    setResult,
    message,
    setMessage,
    messageTone,
    setMessageTone,
    loading,
    setLoading,
    submitting,
    setSubmitting,
    generatingSpecialistQuestions,
    setGeneratingSpecialistQuestions,
    goalModalOpen,
    setGoalModalOpen,
    goalChatMessages,
    setGoalChatMessages,
    goalChatInput,
    setGoalChatInput,
    refinedGoalDraft,
    setRefinedGoalDraft,
    refiningGoal,
    setRefiningGoal,
    goalAssistantClosed,
    setGoalAssistantClosed,
    flowStep,
    setFlowStep,
    goalRiskModalOpen,
    setGoalRiskModalOpen,
    pendingGoalRisk,
    setPendingGoalRisk,
    goalRiskAcknowledged,
    setGoalRiskAcknowledged,
    warningPopup,
    setWarningPopup,
    finalGoalValidated,
    setFinalGoalValidated,
    validatingFinalGoal,
    setValidatingFinalGoal,
    redirecting,
    setRedirecting,
    draftReady,
    setDraftReady,
    redirectTimeout,
    radarAree,
    goalIsValidated,
    generalQuestions,
    specialistQuestions,
    specialistQuestionsGenerated,
    visibleQuestions,
    goalReady,
    goalConfirmed,
    sports,
    selectedSport,
    specializationOptions,
    sportSelectionValid,
    generalAnswersComplete,
    generalComplete,
    completed,
    canCreatePerformance,
    validationLocksQuestionList,
    specialistScoreOptions,
    showGoalValidationResult,
    missingRequiredAnswers,
    showWarning,
    loadQuestionario,
    readError,
    openGoalAssistant,
    openGoalConfirmation,
    openGoalRevisionFromRisk,
    confirmSuggestedGoalFromRisk,
    saveSportSelection,
    setQuestionAnswer,
    confirmAnamnesis,
    confirmGoalContext,
    refineGoal,
    useRefinedGoal,
    generateSpecialistQuestions,
    validateFinalGoal,
    submit,
  };
}
export type OnboardingModel = ReturnType<typeof useOnboarding>;
