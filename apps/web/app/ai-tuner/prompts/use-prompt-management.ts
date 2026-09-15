"use client";

import {
  activateAreaConfigPromptAction,
  saveAreaConfigAction,
} from "./prompt-area-actions";
import { derivePromptEditor } from "./prompt-editor-state";
import {
  performActivateGoalPromptAction,
  requestActivateCurrentPromptAction,
  requestActivateGoalPromptAction,
  saveGoalPromptAction,
  uniqueGoalDraftNameAction,
} from "./prompt-goal-actions";
import { createPromptHeader } from "./prompt-header";
import {
  type GoalPromptConfig,
  type PromptMode,
  type SportCatalogItem,
} from "./prompt-model";
import {
  confirmActivationAction,
  confirmExportActivePromptsAction,
  createNewDraftAction,
  getPromptOverviewAction,
  openPromptDetailAction,
  openPromptModeAction,
  saveCurrentPromptAction,
  saveDraftAction,
} from "./prompt-navigation";
import {
  activateSportAreaPromptAction,
  saveSportAreaPromptAction,
  saveSportPayloadAction,
  updateSportAreaEnabledAction,
} from "./prompt-sport-actions";
import {
  activateTrainingPromptAction,
  saveTrainingPromptAction,
} from "./prompt-training-actions";
import { usePromptState } from "./use-prompt-state";
export function usePromptManagement() {
  const usePromptStateResult = usePromptState();
  const {
    settings,
    mode,
    setMode,
    setMessage,
    setSuccessPopup,
    setBusyKey,
    editorOpen,
    setEditorOpen,
    promptListMode,
    setPromptListMode,
    sportAreaPromptListAreaId,
    setSportAreaPromptListAreaId,
    sportAreaPromptListSportId,
    setSportAreaPromptListSportId,
    sportAreaPromptListSpecializationId,
    setSportAreaPromptListSpecializationId,
    sportAreaEditorSource,
    setSportAreaEditorSource,
    sportAreaDraftId,
    setSportAreaDraftId,
    areaConfigPromptListAreaId,
    setAreaConfigPromptListAreaId,
    areaConfigPromptListSportId,
    setAreaConfigPromptListSportId,
    areaConfigPromptListSpecializationId,
    setAreaConfigPromptListSpecializationId,
    areaConfigEditorSource,
    setAreaConfigEditorSource,
    areaConfigDraftId,
    setAreaConfigDraftId,
    trainingPromptListSportId,
    setTrainingPromptListSportId,
    trainingPromptListSpecializationId,
    setTrainingPromptListSpecializationId,
    trainingEditorSource,
    setTrainingEditorSource,
    trainingDraftId,
    setTrainingDraftId,
    activationTarget,
    setActivationTarget,
    setExportConfirmOpen,
    goalDraft,
    setGoalDraft,
    selectedSportId,
    setSelectedSportId,
    selectedSpecializationId,
    setSelectedSpecializationId,
    selectedAreaId,
    setSelectedAreaId,
    sportAreaPrompt,
    setSportAreaPrompt,
    sportAreaEnabled,
    setSportAreaEnabled,
    sportAreaActive,
    setSportAreaActive,
    trainingPrompt,
    setTrainingPrompt,
    trainingActive,
    setTrainingActive,
    areaInitialContext,
    setAreaInitialContext,
    areaResponseFormat,
    setAreaResponseFormat,
    areaLayoutText,
    setAreaLayoutText,
    areas,
    sports,
    goalPromptConfigs,
    selectedSport,
    selectedSpecialization,
    selectedArea,
    selectedAreaConfig,
    selectedSportPrompt,
    sportAreaDraftsFor,
    loadSettings,
  } = usePromptStateResult;

  const derivePromptEditorResult = derivePromptEditor({
    mode,
    goalDraft,
    sportAreaPrompt,
    trainingPrompt,
    areaInitialContext,
    areaResponseFormat,
    areaLayoutText,
    settings,
    selectedSportPrompt,
    selectedSpecialization,
    selectedAreaConfig,
    selectedSportId,
    selectedSpecializationId,
    selectedAreaId,
    sportAreaDraftId,
    sportAreaDraftsFor,
    selectedSport,
    selectedArea,
    trainingDraftId,
    areaConfigDraftId,
    goalPromptConfigs,
    sportAreaEditorSource,
    trainingEditorSource,
    areaConfigEditorSource,
    sportAreaActive,
    trainingActive,
  });
  const {
    currentPrompt,
    hasChanges,
    draftAlreadySaved,
    currentPromptIsActive,
    editorDescription,
  } = derivePromptEditorResult;

  const showSuccess = (text: string) => {
    setMessage(null);
    setSuccessPopup(text);
  };
  const uniqueGoalDraftName = (baseName: string, currentId?: string) =>
    uniqueGoalDraftNameAction({ goalPromptConfigs }, baseName, currentId);
  const saveGoalPrompt = () =>
    saveGoalPromptAction({
      setBusyKey,
      setMessage,
      goalDraft,
      hasChanges,
      uniqueGoalDraftName,
      loadSettings,
      setGoalDraft,
      showSuccess,
    });
  const performActivateGoalPrompt = (
    promptConfig: GoalPromptConfig,
    options: { forceSaveActive?: boolean } = {},
  ) =>
    performActivateGoalPromptAction(
      { setGoalDraft, setBusyKey, setMessage, loadSettings },
      promptConfig,
      options,
    );
  const requestActivateCurrentPrompt = () =>
    requestActivateCurrentPromptAction({
      mode,
      goalDraft,
      setMessage,
      currentPromptIsActive,
      setActivationTarget,
      sportAreaEditorSource,
      areaConfigEditorSource,
      trainingEditorSource,
    });
  const requestActivateGoalPrompt = (promptConfig: GoalPromptConfig) =>
    requestActivateGoalPromptAction({ setActivationTarget }, promptConfig);
  const activateSportAreaPrompt = () =>
    activateSportAreaPromptAction({
      selectedSport,
      selectedSpecialization,
      selectedArea,
      setMessage,
      setBusyKey,
      saveSportPayload,
      areas,
      sportAreaPrompt,
      sportAreaEnabled,
      selectedSportPrompt,
      sportAreaDraftId,
      setSportAreaActive,
      setSportAreaEditorSource,
      setSportAreaDraftId,
      loadSettings,
    });
  const activateTrainingPrompt = () =>
    activateTrainingPromptAction({
      selectedSport,
      selectedSpecialization,
      setMessage,
      setBusyKey,
      saveSportPayload,
      trainingPrompt,
      trainingDraftId,
      setTrainingActive,
      setTrainingEditorSource,
      setTrainingDraftId,
      loadSettings,
    });
  const activateAreaConfigPrompt = () =>
    activateAreaConfigPromptAction({
      selectedArea,
      setMessage,
      areaLayoutText,
      setBusyKey,
      selectedAreaConfig,
      areaInitialContext,
      areaResponseFormat,
      selectedSportId,
      selectedSpecializationId,
      areaConfigDraftId,
      setAreaConfigEditorSource,
      setAreaConfigDraftId,
      loadSettings,
    });
  const confirmActivation = () =>
    confirmActivationAction({
      activationTarget,
      performActivateGoalPrompt,
      hasChanges,
      activateSportAreaPrompt,
      activateAreaConfigPrompt,
      activateTrainingPrompt,
      setActivationTarget,
      showSuccess,
    });
  const confirmExportActivePrompts = () =>
    confirmExportActivePromptsAction({
      setBusyKey,
      setMessage,
      setExportConfirmOpen,
      showSuccess,
    });
  const saveSportPayload = (payload: SportCatalogItem) =>
    saveSportPayloadAction({}, payload);
  const saveSportAreaPrompt = () =>
    saveSportAreaPromptAction({
      selectedSport,
      selectedSpecialization,
      selectedArea,
      setMessage,
      setBusyKey,
      sportAreaEditorSource,
      sportAreaDraftId,
      sportAreaPrompt,
      setSportAreaEditorSource,
      setSportAreaDraftId,
      setSportAreaActive,
      showSuccess,
    });
  const updateSportAreaEnabled = (areaId: string, enabled: boolean) =>
    updateSportAreaEnabledAction(
      {
        selectedSport,
        selectedSpecialization,
        setMessage,
        areas,
        setBusyKey,
        saveSportPayload,
        selectedAreaId,
        setSportAreaEnabled,
        loadSettings,
        showSuccess,
      },
      areaId,
      enabled,
    );
  const saveTrainingPrompt = () =>
    saveTrainingPromptAction({
      selectedSport,
      selectedSpecialization,
      setMessage,
      setBusyKey,
      trainingEditorSource,
      trainingDraftId,
      trainingPrompt,
      setTrainingEditorSource,
      setTrainingDraftId,
      setTrainingActive,
      showSuccess,
    });
  const saveAreaConfig = () =>
    saveAreaConfigAction({
      selectedArea,
      setMessage,
      areaLayoutText,
      setBusyKey,
      selectedSportId,
      selectedSpecializationId,
      areaConfigEditorSource,
      areaConfigDraftId,
      areaInitialContext,
      areaResponseFormat,
      setAreaConfigEditorSource,
      setAreaConfigDraftId,
      showSuccess,
    });
  const saveCurrentPrompt = () =>
    saveCurrentPromptAction({
      mode,
      saveGoalPrompt,
      saveSportAreaPrompt,
      saveTrainingPrompt,
      saveAreaConfig,
    });
  const saveDraft = () =>
    saveDraftAction({
      hasChanges,
      setMessage,
      draftAlreadySaved,
      currentPrompt,
      saveCurrentPrompt,
    });
  const openPromptMode = (promptMode: PromptMode) =>
    openPromptModeAction(
      {
        setMode,
        setPromptListMode,
        setSportAreaPromptListAreaId,
        setSportAreaPromptListSportId,
        setSportAreaPromptListSpecializationId,
        setSportAreaEditorSource,
        setSportAreaDraftId,
        setAreaConfigPromptListAreaId,
        setAreaConfigPromptListSportId,
        setAreaConfigPromptListSpecializationId,
        setAreaConfigEditorSource,
        setAreaConfigDraftId,
        setTrainingPromptListSportId,
        setTrainingPromptListSpecializationId,
        setTrainingEditorSource,
        setTrainingDraftId,
        setEditorOpen,
      },
      promptMode,
    );
  const openPromptDetail = (
    promptConfig?: GoalPromptConfig,
    options?: {
      areaId?: string;
      sportId?: string;
      specializationId?: string;
      sportAreaSource?: "active" | "draft" | "new";
      sportAreaDraftId?: string | null;
      areaConfigSource?: "active" | "draft" | "new";
      areaConfigDraftId?: string | null;
      trainingSource?: "active" | "draft" | "new";
      trainingDraftId?: string | null;
    },
  ) =>
    openPromptDetailAction(
      {
        setGoalDraft,
        setSelectedAreaId,
        setSelectedSportId,
        setSelectedSpecializationId,
        mode,
        setSportAreaEditorSource,
        setSportAreaDraftId,
        setAreaConfigEditorSource,
        setAreaConfigDraftId,
        setTrainingEditorSource,
        setTrainingDraftId,
        setEditorOpen,
      },
      promptConfig,
      options,
    );
  const createNewDraft = () =>
    createNewDraftAction({
      mode,
      setGoalDraft,
      setSportAreaPrompt,
      setSportAreaActive,
      setSportAreaEnabled,
      setSportAreaEditorSource,
      setSportAreaDraftId,
      setTrainingPrompt,
      setTrainingActive,
      setTrainingEditorSource,
      setTrainingDraftId,
      setAreaInitialContext,
      setAreaResponseFormat,
      setAreaLayoutText,
      setAreaConfigEditorSource,
      setAreaConfigDraftId,
      setPromptListMode,
      setEditorOpen,
      setMessage,
    });
  const getPromptOverview = (promptMode: PromptMode) =>
    getPromptOverviewAction(
      {
        settings,
        selectedSportPrompt,
        selectedAreaConfig,
        selectedSpecialization,
      },
      promptMode,
    );
  const createPromptHeaderResult = createPromptHeader({
    editorOpen,
    setEditorOpen,
    setMessage,
    promptListMode,
    areaConfigPromptListAreaId,
    areaConfigPromptListSportId,
    areaConfigPromptListSpecializationId,
    setAreaConfigPromptListAreaId,
    setAreaConfigPromptListSpecializationId,
    setAreaConfigPromptListSportId,
    setAreaConfigEditorSource,
    setAreaConfigDraftId,
    trainingPromptListSpecializationId,
    trainingPromptListSportId,
    setTrainingPromptListSpecializationId,
    setTrainingPromptListSportId,
    setTrainingEditorSource,
    setTrainingDraftId,
    sportAreaPromptListAreaId,
    sportAreaPromptListSportId,
    sportAreaPromptListSpecializationId,
    setSportAreaPromptListAreaId,
    setSportAreaPromptListSpecializationId,
    setSportAreaPromptListSportId,
    setSportAreaEditorSource,
    setSportAreaDraftId,
    setPromptListMode,
    getPromptOverview,
    mode,
    editorDescription,
    areas,
    sports,
  });
  const {} = createPromptHeaderResult;

  return {
    ...createPromptHeaderResult,
    ...derivePromptEditorResult,
    ...usePromptStateResult,
    showSuccess,
    uniqueGoalDraftName,
    saveGoalPrompt,
    performActivateGoalPrompt,
    requestActivateCurrentPrompt,
    requestActivateGoalPrompt,
    activateSportAreaPrompt,
    activateTrainingPrompt,
    activateAreaConfigPrompt,
    confirmActivation,
    confirmExportActivePrompts,
    saveSportPayload,
    saveSportAreaPrompt,
    updateSportAreaEnabled,
    saveTrainingPrompt,
    saveAreaConfig,
    saveCurrentPrompt,
    saveDraft,
    openPromptMode,
    openPromptDetail,
    createNewDraft,
    getPromptOverview,
  };
}
export type PromptManagementModel = ReturnType<typeof usePromptManagement>;
