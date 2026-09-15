import { API_BASE, secureFetch } from "@/app/lib/api";
import { useEffect, useMemo, useState } from "react";
import {
  areaConfigDraftsKey,
  readStoredAreaConfigDrafts,
  readStoredDraft,
  readStoredTrainingDrafts,
  sportAreaDraftKey,
  sportAreaDraftsKey,
  trainingDraftKey,
  trainingDraftsKey,
} from "./prompt-draft-storage";
import { readError } from "./prompt-management-model";
import {
  emptyGoalPrompt,
  stringifyJson,
  type ActivationTarget,
  type Area,
  type GoalPromptConfig,
  type PromptMode,
  type PromptSettings,
  type SportCatalogItem,
  type SportPrompt,
  type SportSpecialization,
} from "./prompt-model";
import {
  getFilteredSportContextsAction,
  sportAreaDraftsForAction,
} from "./prompt-navigation";
export function usePromptState() {
  const [settings, setSettings] = useState<PromptSettings | null>(null);
  const [mode, setMode] = useState<PromptMode>("goal");
  const [message, setMessage] = useState<string | null>(null);
  const [successPopup, setSuccessPopup] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [promptListMode, setPromptListMode] = useState<PromptMode | null>(null);
  const [sportAreaPromptListAreaId, setSportAreaPromptListAreaId] = useState<
    string | null
  >(null);
  const [sportAreaPromptListSportId, setSportAreaPromptListSportId] = useState<
    string | null
  >(null);
  const [
    sportAreaPromptListSpecializationId,
    setSportAreaPromptListSpecializationId,
  ] = useState<string | null>(null);
  const [sportAreaEditorSource, setSportAreaEditorSource] = useState<
    "active" | "draft" | "new"
  >("active");
  const [sportAreaDraftId, setSportAreaDraftId] = useState<string | null>(null);
  const [areaConfigPromptListAreaId, setAreaConfigPromptListAreaId] = useState<
    string | null
  >(null);
  const [areaConfigPromptListSportId, setAreaConfigPromptListSportId] =
    useState<string | null>(null);
  const [
    areaConfigPromptListSpecializationId,
    setAreaConfigPromptListSpecializationId,
  ] = useState<string | null>(null);
  const [areaConfigEditorSource, setAreaConfigEditorSource] = useState<
    "active" | "draft" | "new"
  >("active");
  const [areaConfigDraftId, setAreaConfigDraftId] = useState<string | null>(
    null,
  );
  const [trainingPromptListSportId, setTrainingPromptListSportId] = useState<
    string | null
  >(null);
  const [
    trainingPromptListSpecializationId,
    setTrainingPromptListSpecializationId,
  ] = useState<string | null>(null);
  const [trainingEditorSource, setTrainingEditorSource] = useState<
    "active" | "draft" | "new"
  >("active");
  const [trainingDraftId, setTrainingDraftId] = useState<string | null>(null);
  const [activationTarget, setActivationTarget] =
    useState<ActivationTarget | null>(null);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState<GoalPromptConfig>(emptyGoalPrompt);
  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSpecializationId, setSelectedSpecializationId] = useState("");
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [sportAreaPrompt, setSportAreaPrompt] = useState("");
  const [sportAreaEnabled, setSportAreaEnabled] = useState(true);
  const [sportAreaActive, setSportAreaActive] = useState(true);
  const [trainingPrompt, setTrainingPrompt] = useState("");
  const [trainingActive, setTrainingActive] = useState(true);
  const [areaInitialContext, setAreaInitialContext] = useState("");
  const [areaResponseFormat, setAreaResponseFormat] = useState("");
  const [areaLayoutText, setAreaLayoutText] = useState("{}");
  const areas = useMemo(() => settings?.areas ?? [], [settings]);
  const sports = useMemo(() => settings?.sports ?? [], [settings]);
  const areaConfigs = useMemo(
    () => settings?.areaGenerationConfigs ?? [],
    [settings],
  );
  const goalPromptConfigs = useMemo(
    () =>
      settings?.goalPromptConfigs ??
      (settings?.goalPromptConfig ? [settings.goalPromptConfig] : []),
    [settings],
  );
  const selectedSport = useMemo(
    () => sports.find((sport) => sport.id === selectedSportId) ?? null,
    [selectedSportId, sports],
  );
  const selectedSpecialization = useMemo(
    () =>
      selectedSport?.specializations.find(
        (specialization) => specialization.id === selectedSpecializationId,
      ) ?? null,
    [selectedSpecializationId, selectedSport],
  );
  const selectedArea = useMemo(
    () => areas.find((area) => area.id === selectedAreaId) ?? null,
    [areas, selectedAreaId],
  );
  const selectedAreaConfig = useMemo(
    () =>
      areaConfigs.find((config) => config.areaId === selectedAreaId) ?? null,
    [areaConfigs, selectedAreaId],
  );
  const selectedSportPrompt = useMemo(
    () =>
      selectedSpecialization?.prompts.find(
        (prompt) => prompt.areaId === selectedAreaId,
      ) ?? null,
    [selectedAreaId, selectedSpecialization],
  );
  const getFilteredSportContexts = (
    sportFilterId: string | null,
    specializationFilterId: string | null,
  ) =>
    getFilteredSportContextsAction(
      { sports },
      sportFilterId,
      specializationFilterId,
    );
  const sportAreaDraftsFor = (
    sport: SportCatalogItem | null | undefined,
    specialization: SportSpecialization | null | undefined,
    area: Area | null | undefined,
    activePrompt: SportPrompt | null | undefined,
  ) => sportAreaDraftsForAction({}, sport, specialization, area, activePrompt);
  const loadSettings = async () => {
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/ai-tuning/prompt-settings`,
      {
        credentials: "include",
      },
    );
    if (!response.ok) {
      setMessage(
        `Caricamento prompt non riuscito: ${await readError(response)}`,
      );
      return;
    }

    const data = (await response.json()) as PromptSettings;
    setSettings(data);
    setGoalDraft(data.goalPromptConfig ?? emptyGoalPrompt);

    const firstSport = data.sports[0];
    const firstSpecialization = firstSport?.specializations[0];
    const firstArea = data.areas[0];
    setSelectedSportId((current) => current || firstSport?.id || "");
    setSelectedSpecializationId(
      (current) => current || firstSpecialization?.id || "",
    );
    setSelectedAreaId((current) => current || firstArea?.id || "");
  };
  useEffect(() => {
    void loadSettings();
  }, []);
  useEffect(() => {
    if (!selectedSport || selectedSport.specializations.length === 0) {
      setSelectedSpecializationId("");
      return;
    }
    if (
      !selectedSport.specializations.some(
        (specialization) => specialization.id === selectedSpecializationId,
      )
    ) {
      setSelectedSpecializationId(selectedSport.specializations[0]?.id ?? "");
    }
  }, [selectedSpecializationId, selectedSport]);
  useEffect(() => {
    const draftKey =
      selectedSportId && selectedSpecializationId && selectedAreaId
        ? sportAreaDraftsKey(
            selectedSportId,
            selectedSpecializationId,
            selectedAreaId,
          )
        : null;
    const legacyDraft =
      selectedSportId && selectedSpecializationId && selectedAreaId
        ? readStoredDraft(
            sportAreaDraftKey(
              selectedSportId,
              selectedSpecializationId,
              selectedAreaId,
            ),
          )
        : null;
    const storedDrafts =
      draftKey && selectedSport && selectedSpecialization && selectedArea
        ? sportAreaDraftsFor(
            selectedSport,
            selectedSpecialization,
            selectedArea,
            selectedSportPrompt,
          )
        : [];
    const selectedStoredDraft =
      storedDrafts.find((draft) => draft.id === sportAreaDraftId) ??
      storedDrafts[0] ??
      (legacyDraft
        ? {
            id: "legacy",
            name: "Bozza salvata",
            basePrompt: legacyDraft,
            updatedAt: new Date().toISOString(),
          }
        : null);

    if (sportAreaEditorSource === "new") {
      setSportAreaPrompt("");
      setSportAreaEnabled(selectedSportPrompt?.isEnabledDriver ?? true);
      setSportAreaActive(false);
      return;
    }

    if (sportAreaEditorSource === "draft" && selectedStoredDraft) {
      setSportAreaPrompt(selectedStoredDraft.basePrompt);
      setSportAreaEnabled(selectedSportPrompt?.isEnabledDriver ?? true);
      setSportAreaActive(false);
      setSportAreaDraftId(selectedStoredDraft.id);
      return;
    }

    if (selectedSportPrompt) {
      setSportAreaPrompt(selectedSportPrompt.basePrompt);
      setSportAreaEnabled(selectedSportPrompt.isEnabledDriver);
      setSportAreaActive(selectedSportPrompt.isActive);
      return;
    }

    setSportAreaPrompt("");
    setSportAreaEnabled(true);
    setSportAreaActive(true);
  }, [
    selectedAreaId,
    selectedSpecializationId,
    selectedSportId,
    sportAreaDraftId,
    sportAreaEditorSource,
    selectedArea,
    selectedSpecialization,
    selectedSport,
    selectedSportPrompt,
  ]);
  useEffect(() => {
    const draftsKey =
      selectedSportId && selectedSpecializationId
        ? trainingDraftsKey(selectedSportId, selectedSpecializationId)
        : null;
    const legacyDraft =
      selectedSportId && selectedSpecializationId
        ? readStoredDraft(
            trainingDraftKey(selectedSportId, selectedSpecializationId),
          )
        : null;
    const storedDrafts = draftsKey ? readStoredTrainingDrafts(draftsKey) : [];
    const selectedStoredDraft =
      storedDrafts.find((draft) => draft.id === trainingDraftId) ??
      storedDrafts[0] ??
      (legacyDraft
        ? {
            id: "legacy",
            name: "Bozza salvata",
            trainingPrompt: legacyDraft,
            updatedAt: new Date().toISOString(),
          }
        : null);

    if (trainingEditorSource === "new") {
      setTrainingPrompt("");
      setTrainingActive(false);
      return;
    }

    if (trainingEditorSource === "draft" && selectedStoredDraft) {
      setTrainingPrompt(selectedStoredDraft.trainingPrompt);
      setTrainingActive(false);
      setTrainingDraftId(selectedStoredDraft.id);
      return;
    }

    setTrainingPrompt(selectedSpecialization?.trainingPrompt ?? "");
    setTrainingActive(selectedSpecialization?.trainingPromptActive ?? true);
  }, [
    selectedSpecialization,
    selectedSpecializationId,
    selectedSportId,
    trainingDraftId,
    trainingEditorSource,
  ]);
  useEffect(() => {
    const draftsKey = selectedAreaId
      ? areaConfigDraftsKey(
          selectedAreaId,
          selectedSportId,
          selectedSpecializationId,
        )
      : null;
    const storedDrafts = draftsKey ? readStoredAreaConfigDrafts(draftsKey) : [];
    const selectedStoredDraft =
      storedDrafts.find((draft) => draft.id === areaConfigDraftId) ??
      storedDrafts[0] ??
      null;

    if (areaConfigEditorSource === "new") {
      setAreaInitialContext("");
      setAreaResponseFormat("");
      setAreaLayoutText("{}");
      return;
    }

    if (areaConfigEditorSource === "draft" && selectedStoredDraft) {
      setAreaInitialContext(selectedStoredDraft.initialContext);
      setAreaResponseFormat(selectedStoredDraft.responseFormatPrompt);
      setAreaLayoutText(
        stringifyJson(selectedStoredDraft.questionnaireLayoutJson),
      );
      setAreaConfigDraftId(selectedStoredDraft.id);
      return;
    }

    setAreaInitialContext(selectedAreaConfig?.initialContext ?? "");
    setAreaResponseFormat(selectedAreaConfig?.responseFormatPrompt ?? "");
    setAreaLayoutText(
      stringifyJson(selectedAreaConfig?.questionnaireLayoutJson ?? {}),
    );
  }, [
    areaConfigDraftId,
    areaConfigEditorSource,
    selectedAreaConfig,
    selectedAreaId,
    selectedSpecializationId,
    selectedSportId,
  ]);
  useEffect(() => {
    setMessage(null);
    setSuccessPopup(null);
  }, [mode, selectedSportId, selectedSpecializationId, selectedAreaId]);
  return {
    settings,
    setSettings,
    mode,
    setMode,
    message,
    setMessage,
    successPopup,
    setSuccessPopup,
    busyKey,
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
    exportConfirmOpen,
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
    areaConfigs,
    goalPromptConfigs,
    selectedSport,
    selectedSpecialization,
    selectedArea,
    selectedAreaConfig,
    selectedSportPrompt,
    getFilteredSportContexts,
    sportAreaDraftsFor,
    loadSettings,
  };
}
