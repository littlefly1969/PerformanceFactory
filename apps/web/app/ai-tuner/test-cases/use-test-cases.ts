"use client";

import { useMemo } from "react";
import {
  openHistoryResultAction,
  promptLooksLikeCaseDescriptionAction,
  removeHistoryItemAction,
  resolvePromptTextAction,
  runStandardTestAction,
  saveHistoryItemAction,
  visiblePromptTextAction,
} from "./test-case-history-actions";
import {
  buildSimulationContextAction,
  continueSimulationDialogAction,
  generateSimulationAiQuestionsAction,
  goToNextSimulationStepAction,
  normalizeQuestionOptionsAction,
  runSimulationPhaseTestAction,
  simulationAnswersForContextAction,
  simulationSpecialistAnswersForContextAction,
} from "./test-case-simulation-actions";
import {
  applySavedAnamnesisUserAction,
  deleteAnamnesisTestUserAction,
  openNewSimulationAction,
  persistAnamnesisTestUsersAction,
  saveAnamnesisTestUserAction,
  startNewAnamnesisTestUserAction,
} from "./test-case-user-actions";
import {
  AnamnesisTestUser,
  SimulationSpecialistQuestion,
  SimulationSpecialistQuestionsPayload,
  TestRunHistoryItem,
  isScoreQuestionText,
  normalizeScoreQuestionText,
  parseJsonObject,
  simulationPhases,
} from "./test-cases-model";
import { useTestCaseState } from "./use-test-case-state";
export function useTestCases() {
  const useTestCaseStateResult = useTestCaseState();
  const {
    router,
    promptSettings,
    prompt,
    setPrompt,
    version,
    setVersion,
    provider,
    setProvider,
    setRunning,
    setMessage,
    setResult,
    runSnapshot,
    setRunSnapshot,
    setTestHistory,
    setSimulationOpen,
    simulationPhase,
    setSimulationPhase,
    simulationPromptName,
    simulationGoal,
    setSimulationGoal,
    simulationAnswers,
    setSimulationAnswers,
    anamnesisTestUsers,
    setAnamnesisTestUsers,
    selectedAnamnesisUserId,
    setSelectedAnamnesisUserId,
    anamnesisUserLabel,
    setAnamnesisUserLabel,
    simulationAiQuestionsResult,
    setSimulationAiQuestionsResult,
    simulationSpecialistScores,
    setSimulationSpecialistScores,
    simulationTestResult,
    setSimulationTestResult,
    simulationTestSnapshot,
    setSimulationTestSnapshot,
    setSimulationDialogOpen,
    simulationChatMessages,
    setSimulationChatMessages,
    simulationChatInput,
    setSimulationChatInput,
    refiningSimulationDialog,
    setRefiningSimulationDialog,
    setUsersEditorOpen,
    selectedCaseId,
    activeHistoryId,
    selectedGolden,
    activeGeneralQuestions,
    selectedSimulationGoalPrompt,
    selectedSimulationSport,
    selectedSimulationSpecialization,
    areaLabelById,
  } = useTestCaseStateResult;

  const saveHistoryItem = (item: TestRunHistoryItem) =>
    saveHistoryItemAction({ setTestHistory }, item);
  const removeHistoryItem = (id: string) =>
    removeHistoryItemAction(
      {
        setTestHistory,
        activeHistoryId,
        setResult,
        setRunSnapshot,
        router,
        selectedCaseId,
      },
      id,
    );
  const openHistoryResult = (item: TestRunHistoryItem) =>
    openHistoryResultAction(
      {
        setPrompt,
        setVersion,
        setProvider,
        setRunSnapshot,
        setResult,
        setMessage,
        router,
      },
      item,
    );
  const resolvePromptText = (promptName = prompt) =>
    resolvePromptTextAction(
      {
        prompt,
        promptSettings,
        selectedGolden,
        selectedSimulationSpecialization,
        areaLabelById,
      },
      promptName,
    );
  const promptLooksLikeCaseDescription = (text: string) =>
    promptLooksLikeCaseDescriptionAction({ selectedGolden }, text);
  const visiblePromptText = () =>
    visiblePromptTextAction({
      runSnapshot,
      promptLooksLikeCaseDescription,
      resolvePromptText,
    });
  const runStandardTest = (options: { keepCurrentResult?: boolean } = {}) =>
    runStandardTestAction(
      {
        selectedGolden,
        setMessage,
        version,
        resolvePromptText,
        promptLooksLikeCaseDescription,
        setRunning,
        setResult,
        setRunSnapshot,
        prompt,
        provider,
        saveHistoryItem,
      },
      options,
    );
  const persistAnamnesisTestUsers = (items: AnamnesisTestUser[]) =>
    persistAnamnesisTestUsersAction({ setAnamnesisTestUsers }, items);
  const applySavedAnamnesisUser = (userId: string) =>
    applySavedAnamnesisUserAction(
      {
        setSelectedAnamnesisUserId,
        setAnamnesisUserLabel,
        setSimulationAnswers,
        anamnesisTestUsers,
        setUsersEditorOpen,
      },
      userId,
    );
  const startNewAnamnesisTestUser = () =>
    startNewAnamnesisTestUserAction({
      setSelectedAnamnesisUserId,
      setAnamnesisUserLabel,
      setSimulationAnswers,
      setUsersEditorOpen,
      setMessage,
    });
  const saveAnamnesisTestUser = () =>
    saveAnamnesisTestUserAction({
      anamnesisUserLabel,
      setMessage,
      selectedAnamnesisUserId,
      simulationAnswers,
      anamnesisTestUsers,
      persistAnamnesisTestUsers,
      setSelectedAnamnesisUserId,
      setUsersEditorOpen,
    });
  const deleteAnamnesisTestUser = () =>
    deleteAnamnesisTestUserAction({
      selectedAnamnesisUserId,
      anamnesisTestUsers,
      persistAnamnesisTestUsers,
      setSelectedAnamnesisUserId,
      setAnamnesisUserLabel,
      setSimulationAnswers,
      setUsersEditorOpen,
      setMessage,
    });
  const openNewSimulation = () =>
    openNewSimulationAction({
      setSimulationPhase,
      setSelectedAnamnesisUserId,
      setAnamnesisUserLabel,
      setSimulationAnswers,
      setSimulationGoal,
      setSimulationAiQuestionsResult,
      setSimulationSpecialistScores,
      setSimulationTestResult,
      setSimulationTestSnapshot,
      setSimulationDialogOpen,
      setSimulationChatMessages,
      setSimulationChatInput,
      setRefiningSimulationDialog,
      setMessage,
      setSimulationOpen,
    });
  const normalizeQuestionOptions = (value: unknown) =>
    normalizeQuestionOptionsAction({}, value);
  const simulationAnswersForContext = () =>
    simulationAnswersForContextAction({
      activeGeneralQuestions,
      simulationAnswers,
    });
  const simulationSpecialistQuestions = useMemo(() => {
    const text = simulationAiQuestionsResult?.outputText ?? "";
    if (!text.trim()) return [];
    const parsed = parseJsonObject(
      text,
    ) as SimulationSpecialistQuestionsPayload | null;
    if (parsed?.areaQuestions?.length) {
      return parsed.areaQuestions.flatMap((area) =>
        [...(area.questions ?? [])]
          .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
          .slice(0, 3)
          .map((question, index) => ({
            id: `specialist-${area.areaId ?? area.areaName ?? "area"}-${index}`,
            area:
              area.areaName ??
              (area.areaId
                ? (areaLabelById.get(area.areaId) ?? area.areaId)
                : null),
            text: normalizeScoreQuestionText(question.text),
          }))
          .filter((question) => isScoreQuestionText(question.text)),
      );
    }

    const questions: SimulationSpecialistQuestion[] = [];
    const questionsByArea = new Map<string, number>();
    let currentArea: string | null = null;

    text.split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;

      const areaMatch =
        line.match(/^\d+[.)]\s*\*\*(.+?)\*\*:?\s*$/) ??
        line.match(/^\*\*(.+?)\*\*:?\s*$/);
      if (areaMatch?.[1]) {
        currentArea = areaMatch[1].replace(/:$/, "").trim();
        return;
      }

      const numberedHeadingMatch = line.match(/^\d+[.)]\s+(.+?)\s*:?\s*$/);
      if (numberedHeadingMatch?.[1] && !line.includes("?")) {
        currentArea = numberedHeadingMatch[1].replace(/\*\*/g, "").trim();
        return;
      }

      const questionMatch =
        line.match(/^[-*•]\s+(.+)/) ?? line.match(/^\d+[.)]\s+(.+)/);
      const questionText = normalizeScoreQuestionText(
        (questionMatch?.[1] ?? line).replace(/^\d+[.)]\s*/, "").trim(),
      );
      if (!questionMatch || !isScoreQuestionText(questionText)) return;

      const areaKey = currentArea ?? "Domande";
      const areaCount = questionsByArea.get(areaKey) ?? 0;
      if (areaCount >= 3) return;
      questionsByArea.set(areaKey, areaCount + 1);

      questions.push({
        id: `specialist-${questions.length}`,
        area: currentArea,
        text: questionText,
      });
    });

    return questions;
  }, [areaLabelById, simulationAiQuestionsResult?.outputText]);
  const simulationSpecialistAnswersForContext = () =>
    simulationSpecialistAnswersForContextAction({
      simulationSpecialistQuestions,
      simulationSpecialistScores,
    });
  const buildSimulationContext = (
    phase: (typeof simulationPhases)[number],
    promptName: string,
  ) =>
    buildSimulationContextAction(
      {
        selectedGolden,
        selectedAnamnesisUserId,
        anamnesisTestUsers,
        selectedSimulationSport,
        selectedSimulationSpecialization,
        simulationGoal,
        simulationAnswersForContext,
        simulationSpecialistAnswersForContext,
      },
      phase,
      promptName,
    );
  const runSimulationPhaseTest = (phaseId = simulationPhase) =>
    runSimulationPhaseTestAction(
      {
        simulationPhase,
        setMessage,
        simulationPromptName,
        selectedSimulationGoalPrompt,
        resolvePromptText,
        promptLooksLikeCaseDescription,
        simulationGoal,
        buildSimulationContext,
        version,
        provider,
        selectedGolden,
        setRunning,
        setSimulationTestResult,
        setSimulationTestSnapshot,
        setSimulationDialogOpen,
        setSimulationChatMessages,
        setSimulationChatInput,
        setPrompt,
        saveHistoryItem,
      },
      phaseId,
    );
  const generateSimulationAiQuestions = () =>
    generateSimulationAiQuestionsAction({
      resolvePromptText,
      setMessage,
      simulationGoal,
      selectedSimulationSpecialization,
      areaLabelById,
      buildSimulationContext,
      setRunning,
      setSimulationAiQuestionsResult,
      setSimulationSpecialistScores,
      provider,
      setSimulationPhase,
    });
  const continueSimulationDialog = () =>
    continueSimulationDialogAction({
      simulationChatInput,
      refiningSimulationDialog,
      simulationTestSnapshot,
      simulationTestResult,
      simulationChatMessages,
      setSimulationChatMessages,
      setSimulationChatInput,
      setRefiningSimulationDialog,
      provider,
      setSimulationTestResult,
    });
  const goToNextSimulationStep = () =>
    goToNextSimulationStepAction({
      simulationPhase,
      setPrompt,
      simulationPromptName,
      setSimulationPhase,
      generateSimulationAiQuestions,
      simulationSpecialistQuestions,
      simulationSpecialistScores,
      setMessage,
      runSimulationPhaseTest,
    });
  return {
    ...useTestCaseStateResult,
    saveHistoryItem,
    removeHistoryItem,
    openHistoryResult,
    resolvePromptText,
    promptLooksLikeCaseDescription,
    visiblePromptText,
    runStandardTest,
    persistAnamnesisTestUsers,
    applySavedAnamnesisUser,
    startNewAnamnesisTestUser,
    saveAnamnesisTestUser,
    deleteAnamnesisTestUser,
    openNewSimulation,
    normalizeQuestionOptions,
    simulationAnswersForContext,
    simulationSpecialistQuestions,
    simulationSpecialistAnswersForContext,
    buildSimulationContext,
    runSimulationPhaseTest,
    generateSimulationAiQuestions,
    continueSimulationDialog,
    goToNextSimulationStep,
  };
}
export type TestCasesModel = ReturnType<typeof useTestCases>;
