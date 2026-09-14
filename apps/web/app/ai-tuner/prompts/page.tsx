"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ProductShell,
} from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";
import { downloadResponseBody } from "@/app/lib/download";

import {
  allFilterValue,
  areaDisplayName,
  defaultSportAreaPromptText,
  emptyGoalPrompt,
  promptModes,
  stringifyJson,
  type ActivationTarget,
  type Area,
  type GoalPromptConfig,
  type PromptMode,
  type PromptSettings,
  type SportCatalogItem,
  type SportPrompt,
  type SportSpecialization,
  type StoredAreaConfigDraft,
  type StoredSportAreaDraft,
  type StoredTrainingDraft,
} from "./prompt-model";
import {
  areaConfigDraftsKey,
  makeHistoryDraftId,
  readStoredAreaConfigDrafts,
  readStoredDraft,
  readStoredSportAreaDrafts,
  readStoredTrainingDrafts,
  removeStoredDraft,
  sportAreaDraftKey,
  sportAreaDraftsKey,
  trainingDraftKey,
  trainingDraftsKey,
  writeStoredAreaConfigDrafts,
  writeStoredDraft,
  writeStoredSportAreaDrafts,
  writeStoredTrainingDrafts,
} from "./prompt-draft-storage";
import { PromptOverviewGrid } from "./prompt-overview-grid";

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(value))
    : "-";

const readError = async (response: Response) => {
  try {
    const data = (await response.json()) as { message?: string; error?: string };
    return data.message ?? data.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

export default function PromptManagementPage() {
  const [settings, setSettings] = useState<PromptSettings | null>(null);
  const [mode, setMode] = useState<PromptMode>("goal");
  const [message, setMessage] = useState<string | null>(null);
  const [successPopup, setSuccessPopup] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [promptListMode, setPromptListMode] = useState<PromptMode | null>(null);
  const [sportAreaPromptListAreaId, setSportAreaPromptListAreaId] =
    useState<string | null>(null);
  const [sportAreaPromptListSportId, setSportAreaPromptListSportId] =
    useState<string | null>(null);
  const [
    sportAreaPromptListSpecializationId,
    setSportAreaPromptListSpecializationId,
  ] = useState<string | null>(null);
  const [sportAreaEditorSource, setSportAreaEditorSource] =
    useState<"active" | "draft" | "new">("active");
  const [sportAreaDraftId, setSportAreaDraftId] = useState<string | null>(null);
  const [areaConfigPromptListAreaId, setAreaConfigPromptListAreaId] =
    useState<string | null>(null);
  const [areaConfigPromptListSportId, setAreaConfigPromptListSportId] =
    useState<string | null>(null);
  const [
    areaConfigPromptListSpecializationId,
    setAreaConfigPromptListSpecializationId,
  ] = useState<string | null>(null);
  const [areaConfigEditorSource, setAreaConfigEditorSource] =
    useState<"active" | "draft" | "new">("active");
  const [areaConfigDraftId, setAreaConfigDraftId] = useState<string | null>(
    null,
  );
  const [trainingPromptListSportId, setTrainingPromptListSportId] =
    useState<string | null>(null);
  const [
    trainingPromptListSpecializationId,
    setTrainingPromptListSpecializationId,
  ] = useState<string | null>(null);
  const [trainingEditorSource, setTrainingEditorSource] =
    useState<"active" | "draft" | "new">("active");
  const [trainingDraftId, setTrainingDraftId] = useState<string | null>(null);
  const [activationTarget, setActivationTarget] =
    useState<ActivationTarget | null>(null);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);

  const [goalDraft, setGoalDraft] =
    useState<GoalPromptConfig>(emptyGoalPrompt);
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
    () => areaConfigs.find((config) => config.areaId === selectedAreaId) ?? null,
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
  ) => {
    const sportCandidates =
      sportFilterId && sportFilterId !== allFilterValue
        ? sports.filter((sport) => sport.id === sportFilterId)
        : sports;

    return sportCandidates.flatMap((sport) => {
      const specializationCandidates =
        specializationFilterId && specializationFilterId !== allFilterValue
          ? sport.specializations.filter(
              (specialization) => specialization.id === specializationFilterId,
            )
          : sport.specializations;

      return specializationCandidates.map((specialization) => ({
        sport,
        specialization,
      }));
    });
  };

  const sportAreaDraftsFor = (
    sport: SportCatalogItem | null | undefined,
    specialization: SportSpecialization | null | undefined,
    area: Area | null | undefined,
    activePrompt: SportPrompt | null | undefined,
  ) => {
    if (!sport?.id || !specialization?.id || !area?.id) {
      return [];
    }
    const draftsKey = sportAreaDraftsKey(sport.id, specialization.id, area.id);
    const storedDrafts = readStoredSportAreaDrafts(draftsKey);
    const recoveredDefault = defaultSportAreaPromptText(
      sport.label,
      specialization.label,
      area.name,
    );
    if (
      activePrompt?.basePrompt &&
      activePrompt.basePrompt !== recoveredDefault &&
      !storedDrafts.some((draft) => draft.basePrompt === recoveredDefault)
    ) {
      return [
        {
          id: `recovered-default:${sport.id}:${specialization.id}:${area.id}`,
          name: `Precedente ${areaDisplayName(area.name)}`,
          basePrompt: recoveredDefault,
          updatedAt: activePrompt.updatedAt ?? "2026-05-16T12:05:20.348Z",
        },
        ...storedDrafts,
      ];
    }
    return storedDrafts;
  };

  const loadSettings = async () => {
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/ai-tuning/prompt-settings`, {
      credentials: "include",
    });
    if (!response.ok) {
      setMessage(`Caricamento prompt non riuscito: ${await readError(response)}`);
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
        ? readStoredDraft(trainingDraftKey(selectedSportId, selectedSpecializationId))
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

  const currentPromptText = () => {
    if (mode === "goal") {
      return goalDraft.basePrompt;
    }
    if (mode === "sport-area") {
      return sportAreaPrompt;
    }
    if (mode === "training") {
      return trainingPrompt;
    }
    return [
      "[Istruzioni di generazione]",
      areaInitialContext,
      "",
      "[Formato della proposta]",
      areaResponseFormat,
      "",
      "[Questionario di monitoraggio]",
      areaLayoutText,
    ].join("\n");
  };

  const activePromptText = () => {
    if (mode === "goal") {
      return settings?.goalPromptConfig?.basePrompt ?? "";
    }
    if (mode === "sport-area") {
      return selectedSportPrompt?.basePrompt ?? "";
    }
    if (mode === "training") {
      return selectedSpecialization?.trainingPrompt ?? "";
    }
    return [
      "[Istruzioni di generazione]",
      selectedAreaConfig?.initialContext ?? "",
      "",
      "[Formato della proposta]",
      selectedAreaConfig?.responseFormatPrompt ?? "",
      "",
      "[Questionario di monitoraggio]",
      stringifyJson(selectedAreaConfig?.questionnaireLayoutJson ?? {}),
    ].join("\n");
  };

  const currentPrompt = currentPromptText();
  const hasChanges = currentPrompt !== activePromptText();
  const savedSportAreaDraft =
    mode === "sport-area" &&
    selectedSportId &&
    selectedSpecializationId &&
    selectedAreaId
      ? readStoredSportAreaDrafts(
          sportAreaDraftsKey(
            selectedSportId,
            selectedSpecializationId,
            selectedAreaId,
          ),
        ).find((draft) => draft.id === sportAreaDraftId)?.basePrompt ??
        sportAreaDraftsFor(
          selectedSport,
          selectedSpecialization,
          selectedArea,
          selectedSportPrompt,
        ).find((draft) => draft.id === sportAreaDraftId)?.basePrompt ??
        readStoredDraft(
          sportAreaDraftKey(
            selectedSportId,
            selectedSpecializationId,
            selectedAreaId,
          ),
        )
      : null;
  const savedTrainingDraft =
    mode === "training" && selectedSportId && selectedSpecializationId
      ? readStoredTrainingDrafts(
          trainingDraftsKey(selectedSportId, selectedSpecializationId),
        ).find((draft) => draft.id === trainingDraftId)?.trainingPrompt ??
        readStoredDraft(trainingDraftKey(selectedSportId, selectedSpecializationId))
      : null;
  const savedAreaConfigDraft =
    mode === "area-config" && selectedAreaId
      ? readStoredAreaConfigDrafts(
          areaConfigDraftsKey(
            selectedAreaId,
            selectedSportId,
            selectedSpecializationId,
          ),
        ).find((draft) => draft.id === areaConfigDraftId)
      : null;
  const savedAreaConfigDraftText = savedAreaConfigDraft
    ? [
        "[Istruzioni di generazione]",
        savedAreaConfigDraft.initialContext,
        "",
        "[Formato della proposta]",
        savedAreaConfigDraft.responseFormatPrompt,
        "",
        "[Questionario di monitoraggio]",
        stringifyJson(savedAreaConfigDraft.questionnaireLayoutJson),
      ].join("\n")
    : null;
  const savedGoalDraft =
    mode === "goal" && goalDraft.id && !goalDraft.isActive
      ? goalPromptConfigs.find((item) => item.id === goalDraft.id) ?? null
      : null;
  const draftAlreadySaved =
    mode === "goal"
      ? Boolean(
          savedGoalDraft &&
            savedGoalDraft.name === goalDraft.name &&
            savedGoalDraft.basePrompt === goalDraft.basePrompt,
        )
      : mode === "sport-area"
        ? sportAreaEditorSource !== "active" &&
          savedSportAreaDraft === sportAreaPrompt
        : mode === "training"
          ? trainingEditorSource !== "active" &&
            savedTrainingDraft === trainingPrompt
          : mode === "area-config"
            ? areaConfigEditorSource !== "active" &&
              savedAreaConfigDraftText === currentPrompt
            : false;
  const canSaveDraft =
    hasChanges && !draftAlreadySaved && currentPrompt.trim().length > 0;
  const currentAreaName = areaDisplayName(selectedArea?.name);
  const currentPromptIsActive =
    mode === "goal"
      ? goalDraft.isActive && !hasChanges
      : mode === "sport-area"
        ? sportAreaActive && !hasChanges
        : mode === "training"
          ? trainingEditorSource === "active" && trainingActive && !hasChanges
          : areaConfigEditorSource === "active" && !hasChanges;
  const statusLabel = hasChanges
    ? draftAlreadySaved
      ? "Bozza salvata"
      : "Modifiche non salvate"
    : currentPromptIsActive
      ? "Prompt attivo"
      : "Non attivo";
  const versionLabel =
    mode === "goal"
      ? goalDraft.version
      : mode === "sport-area"
        ? selectedSportPrompt?.version
        : mode === "training"
          ? trainingEditorSource === "draft" || trainingEditorSource === "new"
            ? undefined
            : selectedSpecialization?.trainingPromptVersion
          : areaConfigEditorSource === "draft" || areaConfigEditorSource === "new"
            ? undefined
            : selectedAreaConfig
            ? selectedAreaConfig.version ?? 1
            : undefined;
  const updatedAt =
    mode === "goal"
      ? goalDraft.updatedAt
      : mode === "sport-area"
        ? selectedSportPrompt?.updatedAt
        : mode === "training"
          ? trainingEditorSource === "draft"
            ? readStoredTrainingDrafts(
                selectedSportId && selectedSpecializationId
                  ? trainingDraftsKey(selectedSportId, selectedSpecializationId)
                  : "",
              ).find((draft) => draft.id === trainingDraftId)?.updatedAt
            : trainingEditorSource === "new"
              ? undefined
              : selectedSpecialization?.updatedAt
          : areaConfigEditorSource === "draft"
            ? savedAreaConfigDraft?.updatedAt
            : areaConfigEditorSource === "new"
              ? undefined
              : selectedAreaConfig?.updatedAt;

  const editorDescription =
    mode === "goal"
      ? "Questo prompt controlla se l'obiettivo inserito dall'atleta puo essere accettato, corretto o riformulato prima di generare il percorso di miglioramento."
      : mode === "sport-area"
        ? "Definisci come questa area deve essere interpretata nello sport e nella specializzazione selezionati."
        : mode === "area-config"
        ? "Definisci come l'AI genera la proposta operativa e il questionario di monitoraggio per l'area selezionata."
        : "Definisci come l'AI deve trasformare obiettivo, dati dell'atleta e storico in attivita pratiche di allenamento.";
  const showSuccess = (text: string) => {
    setMessage(null);
    setSuccessPopup(text);
  };

  const uniqueGoalDraftName = (baseName: string, currentId?: string) => {
    const cleanBase = baseName.trim() || "obiettivo";
    const existingNames = new Set(
      goalPromptConfigs
        .filter((item) => item.id !== currentId)
        .map((item) => item.name.trim().toLowerCase()),
    );
    if (!existingNames.has(cleanBase.toLowerCase())) {
      return cleanBase;
    }
    const draftName = `${cleanBase} bozza ${new Date()
      .toISOString()
      .slice(0, 16)
      .replace("T", " ")}`;
    if (!existingNames.has(draftName.toLowerCase())) {
      return draftName;
    }
    return `${draftName} ${Date.now()}`;
  };

  const saveGoalPrompt = async () => {
    setBusyKey("save");
    setMessage(null);
    const shouldCreateInactiveDraft = goalDraft.isActive && hasChanges;
    const payload = {
      ...(shouldCreateInactiveDraft ? {} : { id: goalDraft.id }),
      name: uniqueGoalDraftName(
        shouldCreateInactiveDraft
          ? `${goalDraft.name || "obiettivo"} bozza`
          : goalDraft.name,
        shouldCreateInactiveDraft ? undefined : goalDraft.id,
      ),
      basePrompt: goalDraft.basePrompt,
      isActive: false,
    };
    const response = await secureFetch(`${API_BASE}/ai-tuning/goal-prompt`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setMessage(`Salvataggio non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    const savedDraft = (await response.json()) as GoalPromptConfig;
    await loadSettings();
    setGoalDraft(savedDraft);
    showSuccess("Bozza salvata con successo.");
    setBusyKey(null);
  };

  const performActivateGoalPrompt = async (
    promptConfig: GoalPromptConfig,
    options: { forceSaveActive?: boolean } = {},
  ) => {
    if (promptConfig.isActive && !options.forceSaveActive) {
      return true;
    }
    if (!promptConfig.id) {
      setGoalDraft((prev) => ({ ...prev, isActive: true }));
      return true;
    }

    const key = `activate-${promptConfig.id}`;
    setBusyKey(key);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/ai-tuning/goal-prompt`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: promptConfig.id,
        name: promptConfig.name,
        basePrompt: promptConfig.basePrompt,
        isActive: true,
      }),
    });
    if (!response.ok) {
      setMessage(`Attivazione non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return false;
    }

    const activated = (await response.json()) as GoalPromptConfig;
    await loadSettings();
    setGoalDraft(activated);
    setBusyKey(null);
    return true;
  };

  const requestActivateCurrentPrompt = () => {
    if (mode === "goal") {
      if (!goalDraft.id) {
        setMessage("Salva prima la bozza, poi potrai renderla attiva.");
        return;
      }
      if (!currentPromptIsActive) {
        setActivationTarget({ kind: "goal", prompt: goalDraft });
      }
      return;
    }
    if (mode === "sport-area") {
      if (sportAreaEditorSource === "new") {
        setMessage("Salva prima la bozza, poi potrai renderla attiva.");
        return;
      }
      if (!currentPromptIsActive) {
        setActivationTarget({ kind: "sport-area" });
      }
      return;
    }
    if (mode === "area-config") {
      if (areaConfigEditorSource === "new") {
        setMessage("Salva prima la bozza, poi potrai renderla attiva.");
        return;
      }
      if (!currentPromptIsActive) {
        setActivationTarget({ kind: "area-config" });
      }
      return;
    }
    if (mode === "training") {
      if (trainingEditorSource === "new") {
        setMessage("Salva prima la bozza, poi potrai renderla attiva.");
        return;
      }
      if (!currentPromptIsActive) {
        setActivationTarget({ kind: "training" });
      }
    }
  };

  const requestActivateGoalPrompt = (promptConfig: GoalPromptConfig) => {
    if (!promptConfig.isActive) {
      setActivationTarget({ kind: "goal", prompt: promptConfig });
    }
  };

  const activateSportAreaPrompt = async () => {
    if (!selectedSport || !selectedSpecialization || !selectedArea) {
      setMessage("Seleziona sport, specializzazione e area.");
      return false;
    }
    setBusyKey("activate-sport-area");
    setMessage(null);
    try {
      await saveSportPayload({
        ...selectedSport,
        specializations: selectedSport.specializations.map((specialization) => {
          if (specialization.id !== selectedSpecialization.id) {
            return specialization;
          }
          return {
            ...specialization,
            prompts: areas.map((area) => {
              const existing =
                specialization.prompts.find(
                  (prompt) => prompt.areaId === area.id,
                ) ?? {
                  areaId: area.id,
                  basePrompt: "",
                  isEnabledDriver: true,
                  isActive: true,
                  area,
                };
              return area.id === selectedArea.id
                ? {
                    ...existing,
                    basePrompt: sportAreaPrompt,
                    isEnabledDriver: sportAreaEnabled,
                    isActive: true,
                  }
                : existing;
            }),
          };
        }),
      });
      removeStoredDraft(
        sportAreaDraftKey(
          selectedSport.id ?? "",
          selectedSpecialization.id ?? "",
          selectedArea.id,
        ),
      );
      const draftsKey = sportAreaDraftsKey(
        selectedSport.id ?? "",
        selectedSpecialization.id ?? "",
        selectedArea.id,
      );
      const existingDrafts = readStoredSportAreaDrafts(draftsKey);
      const activePromptBeforeActivation = selectedSportPrompt?.basePrompt ?? "";
      const preservedActiveDrafts =
        activePromptBeforeActivation.trim() &&
        activePromptBeforeActivation !== sportAreaPrompt &&
        !existingDrafts.some(
          (draft) => draft.basePrompt === activePromptBeforeActivation,
        )
          ? [
              {
                id: makeHistoryDraftId(),
                name: `Precedente ${areaDisplayName(selectedArea.name)}`,
                basePrompt: activePromptBeforeActivation,
                updatedAt:
                  selectedSportPrompt?.updatedAt ?? new Date().toISOString(),
              },
              ...existingDrafts,
            ]
          : existingDrafts;
      if (sportAreaDraftId) {
        writeStoredSportAreaDrafts(
          draftsKey,
          preservedActiveDrafts.filter(
            (draft) => draft.id !== sportAreaDraftId,
          ),
        );
      } else {
        writeStoredSportAreaDrafts(draftsKey, preservedActiveDrafts);
      }
      setSportAreaActive(true);
      setSportAreaEditorSource("active");
      setSportAreaDraftId(null);
      await loadSettings();
      setBusyKey(null);
      return true;
    } catch (error) {
      setMessage(
        `Attivazione non riuscita: ${
          error instanceof Error ? error.message : "errore sconosciuto"
        }`,
      );
      setBusyKey(null);
      return false;
    }
  };

  const activateTrainingPrompt = async () => {
    if (!selectedSport || !selectedSpecialization) {
      setMessage("Seleziona sport e specializzazione.");
      return false;
    }
    setBusyKey("activate-training");
    setMessage(null);
    try {
      await saveSportPayload({
        ...selectedSport,
        specializations: selectedSport.specializations.map((specialization) =>
          specialization.id === selectedSpecialization.id
            ? {
                ...specialization,
                trainingPrompt,
                trainingPromptActive: true,
              }
            : specialization,
        ),
      });
      removeStoredDraft(
        trainingDraftKey(selectedSport.id ?? "", selectedSpecialization.id ?? ""),
      );
      const draftsKey = trainingDraftsKey(
        selectedSport.id ?? "",
        selectedSpecialization.id ?? "",
      );
      const existingDrafts = readStoredTrainingDrafts(draftsKey);
      const activePromptBeforeActivation =
        selectedSpecialization.trainingPrompt ?? "";
      const preservedActiveDrafts =
        activePromptBeforeActivation.trim() &&
        activePromptBeforeActivation !== trainingPrompt &&
        !existingDrafts.some(
          (draft) => draft.trainingPrompt === activePromptBeforeActivation,
        )
          ? [
              {
                id: makeHistoryDraftId(),
                name: `Precedente ${selectedSpecialization.label}`,
                trainingPrompt: activePromptBeforeActivation,
                updatedAt:
                  selectedSpecialization.updatedAt ?? new Date().toISOString(),
              },
              ...existingDrafts,
            ]
          : existingDrafts;
      if (trainingDraftId) {
        writeStoredTrainingDrafts(
          draftsKey,
          preservedActiveDrafts.filter(
            (draft) => draft.id !== trainingDraftId,
          ),
        );
      } else {
        writeStoredTrainingDrafts(draftsKey, preservedActiveDrafts);
      }
      setTrainingActive(true);
      setTrainingEditorSource("active");
      setTrainingDraftId(null);
      await loadSettings();
      setBusyKey(null);
      return true;
    } catch (error) {
      setMessage(
        `Attivazione non riuscita: ${
          error instanceof Error ? error.message : "errore sconosciuto"
        }`,
      );
      setBusyKey(null);
      return false;
    }
  };

  const activateAreaConfigPrompt = async () => {
    if (!selectedArea) {
      setMessage("Seleziona un'area.");
      return false;
    }
    let questionnaireLayoutJson: unknown;
    try {
      questionnaireLayoutJson = JSON.parse(areaLayoutText);
    } catch {
      setMessage("Il layout questionario non e un JSON valido.");
      return false;
    }

    setBusyKey("activate-area-config");
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/ai-tuning/ai-area-configs`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedAreaConfig?.id,
        areaId: selectedArea.id,
        initialContext: areaInitialContext,
        responseFormatPrompt: areaResponseFormat,
        questionnaireLayoutJson,
      }),
    });
    if (!response.ok) {
      setMessage(`Attivazione non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return false;
    }

    const draftsKey = areaConfigDraftsKey(
      selectedArea.id,
      selectedSportId,
      selectedSpecializationId,
    );
    const existingDrafts = readStoredAreaConfigDrafts(draftsKey);
    const activeConfigBeforeActivation = selectedAreaConfig
      ? [
          selectedAreaConfig.initialContext,
          selectedAreaConfig.responseFormatPrompt,
          stringifyJson(selectedAreaConfig.questionnaireLayoutJson),
        ].join("\n")
      : "";
    const newConfigText = [
      areaInitialContext,
      areaResponseFormat,
      stringifyJson(questionnaireLayoutJson),
    ].join("\n");
    const preservedActiveDrafts =
      activeConfigBeforeActivation.trim() &&
      activeConfigBeforeActivation !== newConfigText &&
      !existingDrafts.some(
        (draft) =>
          [
            draft.initialContext,
            draft.responseFormatPrompt,
            stringifyJson(draft.questionnaireLayoutJson),
          ].join("\n") === activeConfigBeforeActivation,
      )
        ? [
            {
              id: makeHistoryDraftId(),
              name: `Precedente ${areaDisplayName(selectedArea.name)}`,
              initialContext: selectedAreaConfig?.initialContext ?? "",
              responseFormatPrompt:
                selectedAreaConfig?.responseFormatPrompt ?? "",
              questionnaireLayoutJson:
                selectedAreaConfig?.questionnaireLayoutJson ?? {},
              updatedAt:
                selectedAreaConfig?.updatedAt ?? new Date().toISOString(),
            },
            ...existingDrafts,
          ]
        : existingDrafts;
    if (areaConfigDraftId) {
      writeStoredAreaConfigDrafts(
        draftsKey,
        preservedActiveDrafts.filter(
          (draft) => draft.id !== areaConfigDraftId,
        ),
      );
    } else {
      writeStoredAreaConfigDrafts(draftsKey, preservedActiveDrafts);
    }
    setAreaConfigEditorSource("active");
    setAreaConfigDraftId(null);
    await loadSettings();
    setBusyKey(null);
    return true;
  };

  const confirmActivation = async () => {
    if (!activationTarget) {
      return;
    }
    const target = activationTarget;
    let activated = false;
    if (target.kind === "goal") {
      activated = await performActivateGoalPrompt(target.prompt, {
        forceSaveActive: hasChanges,
      });
    } else if (target.kind === "sport-area") {
      activated = await activateSportAreaPrompt();
    } else if (target.kind === "area-config") {
      activated = await activateAreaConfigPrompt();
    } else if (target.kind === "training") {
      activated = await activateTrainingPrompt();
    }
    setActivationTarget(null);
    if (activated) {
      showSuccess("Prompt attivato con successo.");
    }
  };

  const confirmExportActivePrompts = async () => {
    setBusyKey("export-active-prompts");
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/ai-tuning/active-prompts/export`,
      {
        method: "GET",
        credentials: "include",
      },
    );
    if (!response.ok) {
      setMessage(`Export non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      setExportConfirmOpen(false);
      return;
    }

    await downloadResponseBody(response, "active-ai-prompts.txt");
    setBusyKey(null);
    setExportConfirmOpen(false);
    showSuccess("Export prompt AI attivi generato.");
  };

  const saveSportPayload = async (payload: SportCatalogItem) => {
    const response = await secureFetch(`${API_BASE}/ai-tuning/sports`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(await readError(response));
    }
  };

  const saveSportAreaPrompt = async () => {
    if (!selectedSport || !selectedSpecialization || !selectedArea) {
      setMessage("Seleziona sport, specializzazione e area.");
      return;
    }
    setBusyKey("save");
    setMessage(null);
    const draftsKey = sportAreaDraftsKey(
      selectedSport.id ?? "",
      selectedSpecialization.id ?? "",
      selectedArea.id,
    );
    const existingDrafts = readStoredSportAreaDrafts(draftsKey);
    const draftId =
      sportAreaEditorSource === "draft" && sportAreaDraftId
        ? sportAreaDraftId
        : `draft-${Date.now()}`;
    const draftName =
      sportAreaEditorSource === "draft"
        ? existingDrafts.find((draft) => draft.id === draftId)?.name ??
          "Bozza prompt"
        : `Bozza ${areaDisplayName(selectedArea.name)} ${existingDrafts.length + 1}`;
    const savedDraft: StoredSportAreaDraft = {
      id: draftId,
      name: draftName,
      basePrompt: sportAreaPrompt,
      updatedAt: new Date().toISOString(),
    };
    const nextDrafts = [
      savedDraft,
      ...existingDrafts.filter((draft) => draft.id !== draftId),
    ];
    writeStoredSportAreaDrafts(draftsKey, nextDrafts);
    writeStoredDraft(
      sportAreaDraftKey(
        selectedSport.id ?? "",
        selectedSpecialization.id ?? "",
        selectedArea.id,
      ),
      sportAreaPrompt,
    );
    setSportAreaEditorSource("draft");
    setSportAreaDraftId(draftId);
    setSportAreaActive(false);
    showSuccess("Bozza salvata con successo.");
    setBusyKey(null);
  };

  const updateSportAreaEnabled = async (areaId: string, enabled: boolean) => {
    if (!selectedSport || !selectedSpecialization) {
      setMessage("Seleziona sport e specializzazione.");
      return;
    }
    const targetArea = areas.find((area) => area.id === areaId);
    if (!targetArea) {
      setMessage("Area non trovata.");
      return;
    }

    setBusyKey(`area-toggle-${areaId}`);
    setMessage(null);
    try {
      await saveSportPayload({
        ...selectedSport,
        specializations: selectedSport.specializations.map((specialization) => {
          if (specialization.id !== selectedSpecialization.id) {
            return specialization;
          }
          return {
            ...specialization,
            prompts: areas.map((area) => {
              const existing =
                specialization.prompts.find(
                  (prompt) => prompt.areaId === area.id,
                ) ?? {
                  areaId: area.id,
                  basePrompt: "",
                  isEnabledDriver: true,
                  isActive: true,
                  area,
                };
              return area.id === areaId
                ? {
                    ...existing,
                    isEnabledDriver: enabled,
                  }
                : existing;
            }),
          };
        }),
      });
      if (areaId === selectedAreaId) {
        setSportAreaEnabled(enabled);
      }
      await loadSettings();
      showSuccess(
        enabled
          ? "Area attivata nella valutazione."
          : "Area esclusa dalla valutazione.",
      );
    } catch (error) {
      setMessage(
        `Aggiornamento area non riuscito: ${
          error instanceof Error ? error.message : "errore sconosciuto"
        }`,
      );
    }
    setBusyKey(null);
  };

  const saveTrainingPrompt = async () => {
    if (!selectedSport || !selectedSpecialization) {
      setMessage("Seleziona sport e specializzazione.");
      return;
    }
    setBusyKey("save");
    setMessage(null);
    const draftsKey = trainingDraftsKey(
      selectedSport.id ?? "",
      selectedSpecialization.id ?? "",
    );
    const existingDrafts = readStoredTrainingDrafts(draftsKey);
    const draftId =
      trainingEditorSource === "draft" && trainingDraftId
        ? trainingDraftId
        : `draft-${Date.now()}`;
    const draftName =
      trainingEditorSource === "draft"
        ? existingDrafts.find((draft) => draft.id === draftId)?.name ??
          "Bozza allenamento"
        : `Bozza ${selectedSpecialization.label} ${existingDrafts.length + 1}`;
    const savedDraft: StoredTrainingDraft = {
      id: draftId,
      name: draftName,
      trainingPrompt,
      updatedAt: new Date().toISOString(),
    };
    writeStoredTrainingDrafts(draftsKey, [
      savedDraft,
      ...existingDrafts.filter((draft) => draft.id !== draftId),
    ]);
    writeStoredDraft(
      trainingDraftKey(selectedSport.id ?? "", selectedSpecialization.id ?? ""),
      trainingPrompt,
    );
    setTrainingEditorSource("draft");
    setTrainingDraftId(draftId);
    setTrainingActive(false);
    showSuccess("Bozza salvata con successo.");
    setBusyKey(null);
  };

  const saveAreaConfig = async () => {
    if (!selectedArea) {
      setMessage("Seleziona un'area.");
      return;
    }
    let questionnaireLayoutJson: unknown;
    try {
      questionnaireLayoutJson = JSON.parse(areaLayoutText);
    } catch {
      setMessage("Il layout questionario non e un JSON valido.");
      return;
    }
    setBusyKey("save");
    setMessage(null);
    const draftsKey = areaConfigDraftsKey(
      selectedArea.id,
      selectedSportId,
      selectedSpecializationId,
    );
    const existingDrafts = readStoredAreaConfigDrafts(draftsKey);
    const draftId =
      areaConfigEditorSource === "draft" && areaConfigDraftId
        ? areaConfigDraftId
        : `draft-${Date.now()}`;
    const draftName =
      areaConfigEditorSource === "draft"
        ? existingDrafts.find((draft) => draft.id === draftId)?.name ??
          "Bozza proposta area"
        : `Bozza ${areaDisplayName(selectedArea.name)} ${existingDrafts.length + 1}`;
    const savedDraft: StoredAreaConfigDraft = {
      id: draftId,
      name: draftName,
      initialContext: areaInitialContext,
      responseFormatPrompt: areaResponseFormat,
      questionnaireLayoutJson,
      updatedAt: new Date().toISOString(),
    };
    writeStoredAreaConfigDrafts(draftsKey, [
      savedDraft,
      ...existingDrafts.filter((draft) => draft.id !== draftId),
    ]);
    setAreaConfigEditorSource("draft");
    setAreaConfigDraftId(draftId);
    showSuccess("Bozza salvata con successo.");
    setBusyKey(null);
  };

  const saveCurrentPrompt = () => {
    if (mode === "goal") {
      return saveGoalPrompt();
    }
    if (mode === "sport-area") {
      return saveSportAreaPrompt();
    }
    if (mode === "training") {
      return saveTrainingPrompt();
    }
    return saveAreaConfig();
  };

  const saveDraft = () => {
    if (!hasChanges) {
      setMessage("Non ci sono modifiche da salvare.");
      return;
    }
    if (draftAlreadySaved) {
      setMessage("La bozza e gia salvata.");
      return;
    }
    if (currentPrompt.trim().length === 0) {
      setMessage("Scrivi il contenuto del prompt prima di salvare la bozza.");
      return;
    }
    return saveCurrentPrompt();
  };

  const openPromptMode = (promptMode: PromptMode) => {
    setMode(promptMode);
    setPromptListMode(promptMode);
    setSportAreaPromptListAreaId(null);
    setSportAreaPromptListSportId(null);
    setSportAreaPromptListSpecializationId(null);
    setSportAreaEditorSource("active");
    setSportAreaDraftId(null);
    setAreaConfigPromptListAreaId(null);
    setAreaConfigPromptListSportId(null);
    setAreaConfigPromptListSpecializationId(null);
    setAreaConfigEditorSource("active");
    setAreaConfigDraftId(null);
    setTrainingPromptListSportId(null);
    setTrainingPromptListSpecializationId(null);
    setTrainingEditorSource("active");
    setTrainingDraftId(null);
    setEditorOpen(false);
  };

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
  ) => {
    if (promptConfig) {
      setGoalDraft(promptConfig);
    }
    if (options?.areaId) {
      setSelectedAreaId(options.areaId);
    }
    if (options?.sportId) {
      setSelectedSportId(options.sportId);
    }
    if (options?.specializationId) {
      setSelectedSpecializationId(options.specializationId);
    }
    if (mode === "sport-area") {
      setSportAreaEditorSource(options?.sportAreaSource ?? "active");
      setSportAreaDraftId(options?.sportAreaDraftId ?? null);
    }
    if (mode === "area-config") {
      setAreaConfigEditorSource(options?.areaConfigSource ?? "active");
      setAreaConfigDraftId(options?.areaConfigDraftId ?? null);
    }
    if (mode === "training") {
      setTrainingEditorSource(options?.trainingSource ?? "active");
      setTrainingDraftId(options?.trainingDraftId ?? null);
    }
    setEditorOpen(true);
  };

  const createNewDraft = () => {
    if (mode === "goal") {
      setGoalDraft((prev) => ({
        ...prev,
        id: undefined,
        name: prev.name ? `${prev.name} bozza` : "nuova bozza",
        basePrompt: "",
        version: undefined,
        isActive: false,
        updatedAt: undefined,
      }));
    } else if (mode === "sport-area") {
      setSportAreaPrompt("");
      setSportAreaActive(false);
      setSportAreaEnabled(true);
      setSportAreaEditorSource("new");
      setSportAreaDraftId(null);
    } else if (mode === "training") {
      setTrainingPrompt("");
      setTrainingActive(false);
      setTrainingEditorSource("new");
      setTrainingDraftId(null);
    } else {
      setAreaInitialContext("");
      setAreaResponseFormat("");
      setAreaLayoutText("{}");
      setAreaConfigEditorSource("new");
      setAreaConfigDraftId(null);
    }
    setPromptListMode(mode);
    setEditorOpen(true);
    setMessage(null);
  };

  const getPromptOverview = (promptMode: PromptMode) => {
    if (promptMode === "goal") {
      return {
        title: "Validazione obiettivo",
        description:
          "Controlla obiettivo, sicurezza e coerenza prima della generazione del percorso.",
        where: "Onboarding atleta",
        version: settings?.goalPromptConfig?.version
          ? `v${settings.goalPromptConfig.version}`
          : "-",
        updatedAt: formatDate(settings?.goalPromptConfig?.updatedAt),
      };
    }
    if (promptMode === "sport-area") {
      return {
        title: "Configurazione aree performance",
        description:
          "Adatta le aree della performance allo sport, alla specializzazione e allo scenario.",
        where: "Scelta aree e driver AI",
        version: selectedSportPrompt?.version ? `v${selectedSportPrompt.version}` : "-",
        updatedAt: formatDate(selectedSportPrompt?.updatedAt),
      };
    }
    if (promptMode === "area-config") {
      return {
        title: "Generazione proposta area",
        description:
          "Definisce la proposta operativa e il questionario prodotti per ogni area.",
        where: "Generazione consigli area",
        version: selectedAreaConfig
          ? `v${selectedAreaConfig.version ?? 1}`
          : "-",
        updatedAt: formatDate(selectedAreaConfig?.updatedAt),
      };
    }
    return {
      title: "Allenamento specifico",
      description:
        "Trasforma obiettivo e dati atleta in attivita pratiche, progressive e misurabili.",
      where: "Allenamento specifico atleta",
      version: selectedSpecialization?.trainingPromptVersion
        ? `v${selectedSpecialization.trainingPromptVersion}`
        : "-",
      updatedAt: formatDate(selectedSpecialization?.updatedAt),
    };
  };

  const renderPromptOverview = () => (
    <PromptOverviewGrid
      getOverview={getPromptOverview}
      onOpen={openPromptMode}
    />
  );

  const renderSportContextPicker = (params: {
    title: string;
    description: string;
    selectedSportId: string | null;
    selectedSpecializationId: string | null;
    onSportChange: (sportId: string, specializationId: string) => void;
    onOpen: (sportId: string, specializationId: string) => void;
  }) => {
    const pickerSportId = params.selectedSportId ?? allFilterValue;
    const pickerSpecializationId =
      params.selectedSpecializationId ?? allFilterValue;
    const pickerSport =
      pickerSportId !== allFilterValue
        ? sports.find((sport) => sport.id === pickerSportId) ?? null
        : null;
    const pickerSpecializations = pickerSport
      ? pickerSport.specializations.map((specialization) => ({
          sport: pickerSport,
          specialization,
        }))
      : sports.flatMap((sport) =>
          sport.specializations.map((specialization) => ({
            sport,
            specialization,
          })),
        );
    const filteredContexts = getFilteredSportContexts(
      pickerSportId,
      pickerSpecializationId,
    );

    return (
      <section className="pf-stack">
        <section className="pf-panel pf-prompt-current-panel">
          <div className="pf-panel-header pf-prompt-current-header">
            <div>
              <h2>{params.title}</h2>
              <p className="pf-muted">{params.description}</p>
            </div>
          </div>

          {sports.length === 0 ? (
            <EmptyState
              title="Nessuno sport disponibile"
              description="Configura prima almeno uno sport e una specializzazione."
            />
          ) : (
            <div className="pf-stack">
              <div className="pf-two-col">
                <label className="pf-field">
                  Sport
                  <select
                    className="pf-select"
                    value={pickerSportId}
                    onChange={(event) => {
                      const nextSportId = event.target.value;
                      params.onSportChange(
                        nextSportId,
                        nextSportId === allFilterValue
                          ? allFilterValue
                          : pickerSpecializationId,
                      );
                    }}
                  >
                    <option value={allFilterValue}>Tutti</option>
                    {sports.map((sport) => (
                      <option key={sport.id} value={sport.id}>
                        {sport.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pf-field">
                  Specializzazione
                  <select
                    className="pf-select"
                    value={pickerSpecializationId}
                    onChange={(event) =>
                      params.onSportChange(pickerSportId, event.target.value)
                    }
                    disabled={pickerSpecializations.length === 0}
                  >
                    <option value={allFilterValue}>Tutti</option>
                    {pickerSpecializations.map(({ sport, specialization }) => (
                      <option
                        key={`${sport.id}:${specialization.id}`}
                        value={specialization.id}
                      >
                        {pickerSport
                          ? specialization.label
                          : `${specialization.label} - ${sport.label}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {filteredContexts.length === 0 ? (
                <EmptyState
                  title="Nessun prompt filtrabile"
                  description="Il filtro selezionato non contiene specializzazioni."
                />
              ) : (
                <div className="pf-actions">
                  <button
                    type="button"
                    className="pf-button"
                    onClick={() =>
                      params.onOpen(pickerSportId, pickerSpecializationId)
                    }
                  >
                    Apri prompt
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </section>
    );
  };

  const renderSportFilterControls = (params: {
    selectedSportId: string | null;
    selectedSpecializationId: string | null;
    onSportChange: (sportId: string, specializationId: string) => void;
  }) => {
    const filterSportId = params.selectedSportId ?? allFilterValue;
    const filterSpecializationId =
      params.selectedSpecializationId ?? allFilterValue;
    const filterSport =
      filterSportId !== allFilterValue
        ? sports.find((sport) => sport.id === filterSportId) ?? null
        : null;
    const specializationOptions = filterSport
      ? filterSport.specializations.map((specialization) => ({
          sport: filterSport,
          specialization,
        }))
      : sports.flatMap((sport) =>
          sport.specializations.map((specialization) => ({
            sport,
            specialization,
          })),
        );

    return (
      <div className="pf-two-col">
        <label className="pf-field">
          Sport
          <select
            className="pf-select"
            value={filterSportId}
            onChange={(event) => {
              const nextSportId = event.target.value;
              params.onSportChange(
                nextSportId,
                nextSportId === allFilterValue
                  ? allFilterValue
                  : filterSpecializationId,
              );
            }}
          >
            <option value={allFilterValue}>Tutti</option>
            {sports.map((sport) => (
              <option key={sport.id} value={sport.id}>
                {sport.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pf-field">
          Specializzazione
          <select
            className="pf-select"
            value={filterSpecializationId}
            onChange={(event) =>
              params.onSportChange(filterSportId, event.target.value)
            }
            disabled={specializationOptions.length === 0}
          >
            <option value={allFilterValue}>Tutti</option>
            {specializationOptions.map(({ sport, specialization }) => (
              <option
                key={`${sport.id}:${specialization.id}`}
                value={specialization.id}
              >
                {filterSport
                  ? specialization.label
                  : `${specialization.label} - ${sport.label}`}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  };

  const renderCreatedPromptsList = () => {
    const selectedMode = promptModes.find((item) => item.id === promptListMode);
    const listTitle = selectedMode?.title ?? "Prompt";

    if (promptListMode === "goal") {
      return (
        <section className="pf-stack">
          <section className="pf-panel pf-prompt-current-panel">
            <div className="pf-panel-header pf-prompt-current-header">
              <div>
                <h2>{listTitle}</h2>
                <p className="pf-muted">
                  Lista dei prompt creati. Quello evidenziato in giallo e il
                  prompt attualmente usato dal sistema.
                </p>
              </div>
              <div className="pf-actions pf-prompt-current-actions">
                <button
                  className="pf-button"
                  type="button"
                  onClick={createNewDraft}
                >
                  Crea nuova bozza
                </button>
              </div>
            </div>

            {goalPromptConfigs.length === 0 ? (
              <EmptyState
                title="Nessun prompt creato"
                description="Crea una nuova bozza per iniziare."
              />
            ) : (
              <div className="pf-grid pf-created-prompts-grid">
                {goalPromptConfigs.map((item) => (
                  <article
                    key={item.id ?? item.name}
                    className={`pf-card pf-created-prompt-card ${
                      item.isActive ? "in-use" : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openPromptDetail(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openPromptDetail(item);
                      }
                    }}
                  >
                    {item.isActive && (
                      <span className="pf-created-prompt-badge">In uso</span>
                    )}
                    <div className="pf-prompt-card-title">
                      <h3>{item.name || "Validazione obiettivo"}</h3>
                    </div>
                    <p>
                      Prompt di validazione obiettivo per controllare chiarezza,
                      coerenza e sicurezza prima della generazione del percorso.
                    </p>
                    <div className="pf-created-prompt-footer">
                      <div className="pf-prompt-overview-meta">
                        <span>
                          Versione
                          <strong>{item.version ? `v${item.version}` : "-"}</strong>
                        </span>
                        <span>
                          Ultima modifica
                          <strong>{formatDate(item.updatedAt)}</strong>
                        </span>
                        <span>
                          Stato
                          <strong>{item.isActive ? "In uso" : "Bozza / non attivo"}</strong>
                        </span>
                      </div>
                      {!item.isActive && (
                        <div className="pf-created-prompt-actions">
                          <button
                            type="button"
                            className="pf-button-secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              openPromptDetail(item);
                            }}
                          >
                            Apri prompt
                          </button>
                          <button
                            type="button"
                            className="pf-button"
                            disabled={busyKey === `activate-${item.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              requestActivateGoalPrompt(item);
                            }}
                          >
                            {busyKey === `activate-${item.id}`
                              ? "Attivazione..."
                              : "Rendi attivo"}
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      );
    }

    if (promptListMode === "sport-area") {
      const selectedListArea =
        areas.find((area) => area.id === sportAreaPromptListAreaId) ?? null;

      if (!selectedListArea) {
        return (
          <section className="pf-stack">
            <section className="pf-panel pf-prompt-current-panel">
              <div className="pf-panel-header pf-prompt-current-header">
                <div>
                  <h2>Aree della performance</h2>
                  <p className="pf-muted">
                    Scegli un'area per vedere i prompt disponibili e quale e
                    attualmente in uso.
                  </p>
                </div>
              </div>

              <div className="pf-grid pf-created-prompts-grid pf-created-prompts-list">
                {areas.map((area) => {
                  const prompt = selectedSpecialization?.prompts.find(
                    (item) => item.areaId === area.id,
                  );
                  const draftsCount = sportAreaDraftsFor(
                    selectedSport,
                    selectedSpecialization,
                    area,
                    prompt,
                  ).length;
                  return (
                    <article
                      key={area.id}
                      className="pf-card pf-created-prompt-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedAreaId(area.id);
                        setSportAreaPromptListAreaId(area.id);
                        setSportAreaPromptListSportId(allFilterValue);
                        setSportAreaPromptListSpecializationId(allFilterValue);
                        setSportAreaEditorSource("active");
                        setSportAreaDraftId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedAreaId(area.id);
                          setSportAreaPromptListAreaId(area.id);
                          setSportAreaPromptListSportId(allFilterValue);
                          setSportAreaPromptListSpecializationId(allFilterValue);
                          setSportAreaEditorSource("active");
                          setSportAreaDraftId(null);
                        }
                      }}
                    >
                      <div className="pf-prompt-card-title">
                        <h3>{areaDisplayName(area.name)}</h3>
                      </div>
                      <p>
                        Area della performance configurata per lo sport e la
                        specializzazione selezionati.
                      </p>
                      <div className="pf-created-prompt-footer">
                        <div className="pf-prompt-overview-meta">
                          <span>
                            Prompt attivo
                            <strong>{prompt ? "Presente" : "Da creare"}</strong>
                          </span>
                          <span>
                            Stato area
                            <strong>
                              {prompt?.isEnabledDriver ?? true
                                ? "Attiva"
                                : "Disattiva"}
                            </strong>
                          </span>
                          <span>
                            Bozze
                            <strong>{draftsCount}</strong>
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </section>
        );
      }

      if (
        !sportAreaPromptListSportId ||
        !sportAreaPromptListSpecializationId
      ) {
        return renderSportContextPicker({
          title: `Sport per ${areaDisplayName(selectedListArea.name)}`,
          description:
            "Scegli sport e specializzazione di riferimento prima di aprire i prompt di questa area.",
          selectedSportId: sportAreaPromptListSportId,
          selectedSpecializationId: sportAreaPromptListSpecializationId,
          onSportChange: (sportId, specializationId) => {
            setSportAreaPromptListSportId(sportId || null);
            setSportAreaPromptListSpecializationId(specializationId || null);
          },
          onOpen: (sportId, specializationId) => {
            if (sportId !== allFilterValue && specializationId !== allFilterValue) {
              setSelectedSportId(sportId);
              setSelectedSpecializationId(specializationId);
            }
            setSportAreaPromptListSportId(sportId);
            setSportAreaPromptListSpecializationId(specializationId);
            setSportAreaEditorSource("active");
            setSportAreaDraftId(null);
          },
        });
      }

      const selectedContexts = getFilteredSportContexts(
        sportAreaPromptListSportId,
        sportAreaPromptListSpecializationId,
      );
      const showSportAreaSportGroups =
        sportAreaPromptListSportId === allFilterValue &&
        sportAreaPromptListSpecializationId === allFilterValue;
      const showSportAreaSpecializationGroups =
        !!sportAreaPromptListSportId &&
        sportAreaPromptListSportId !== allFilterValue &&
        sportAreaPromptListSpecializationId === allFilterValue;
      const canCreateSportAreaDraft =
        selectedContexts.length === 1 &&
        sportAreaPromptListSportId !== allFilterValue &&
        sportAreaPromptListSpecializationId !== allFilterValue;
      const sportAreaPromptEntries = selectedContexts.flatMap(
        ({ sport, specialization }) => {
          const activePrompt = specialization.prompts.find(
            (item) => item.areaId === selectedListArea.id,
          );
          return [
            ...(activePrompt
              ? [
                  {
                    kind: "active" as const,
                    sport,
                    specialization,
                    prompt: activePrompt,
                  },
                ]
              : []),
            ...sportAreaDraftsFor(
              sport,
              specialization,
              selectedListArea,
              activePrompt,
            ).map((draft) => ({
              kind: "draft" as const,
              sport,
              specialization,
              draft,
            })),
          ];
        },
      );

      if (showSportAreaSportGroups) {
        return (
          <section className="pf-stack">
            <section className="pf-panel pf-prompt-current-panel">
              <div className="pf-panel-header pf-prompt-current-header">
                <div>
                  <h2>Prompt {areaDisplayName(selectedListArea.name)}</h2>
                  <p className="pf-muted">
                    Scegli uno sport per vedere le specializzazioni e i prompt
                    disponibili per questa area.
                  </p>
                </div>
              </div>

              {renderSportFilterControls({
                selectedSportId: sportAreaPromptListSportId,
                selectedSpecializationId: sportAreaPromptListSpecializationId,
                onSportChange: (sportId, specializationId) => {
                  setSportAreaPromptListSportId(sportId);
                  setSportAreaPromptListSpecializationId(specializationId);
                },
              })}

              <div className="pf-grid pf-created-prompts-grid">
                {sports.map((sport) => {
                  const promptCount = sport.specializations.reduce(
                    (total, specialization) => {
                      const activePrompt = specialization.prompts.find(
                        (item) => item.areaId === selectedListArea.id,
                      );
                      const draftsCount = activePrompt
                        ? sportAreaDraftsFor(
                            sport,
                            specialization,
                            selectedListArea,
                            activePrompt,
                          ).length
                        : 0;
                      return total + (activePrompt ? 1 : 0) + draftsCount;
                    },
                    0,
                  );

                  return (
                    <article
                      key={sport.id}
                      className="pf-card pf-created-prompt-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSportAreaPromptListSportId(sport.id ?? null);
                        setSportAreaPromptListSpecializationId(allFilterValue);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSportAreaPromptListSportId(sport.id ?? null);
                          setSportAreaPromptListSpecializationId(allFilterValue);
                        }
                      }}
                    >
                      <div className="pf-prompt-card-title">
                        <h3>{sport.label}</h3>
                      </div>
                      <p>
                        Apri per vedere i prompt divisi per specializzazione.
                      </p>
                      <div className="pf-created-prompt-footer">
                        <div className="pf-prompt-overview-meta">
                          <span>
                            Specializzazioni
                            <strong>{sport.specializations.length}</strong>
                          </span>
                          <span>
                            Prompt
                            <strong>{promptCount}</strong>
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </section>
        );
      }

      if (showSportAreaSpecializationGroups) {
        const sportGroup =
          sports.find((sport) => sport.id === sportAreaPromptListSportId) ??
          null;

        return (
          <section className="pf-stack">
            <section className="pf-panel pf-prompt-current-panel">
              <div className="pf-panel-header pf-prompt-current-header">
                <div>
                  <h2>{sportGroup?.label ?? "Sport"}</h2>
                  <p className="pf-muted">
                    Scegli una specializzazione per vedere i prompt disponibili
                    per {areaDisplayName(selectedListArea.name)}.
                  </p>
                </div>
              </div>

              {renderSportFilterControls({
                selectedSportId: sportAreaPromptListSportId,
                selectedSpecializationId: sportAreaPromptListSpecializationId,
                onSportChange: (sportId, specializationId) => {
                  setSportAreaPromptListSportId(sportId);
                  setSportAreaPromptListSpecializationId(specializationId);
                },
              })}

              <div className="pf-grid pf-created-prompts-grid">
                {selectedContexts.map(({ sport, specialization }) => {
                  const activePrompt = specialization.prompts.find(
                    (item) => item.areaId === selectedListArea.id,
                  );
                  const draftsCount = sportAreaDraftsFor(
                    sport,
                    specialization,
                    selectedListArea,
                    activePrompt,
                  ).length;
                  const promptCount = (activePrompt ? 1 : 0) + draftsCount;

                  return (
                    <article
                      key={`${sport.id}:${specialization.id}`}
                      className="pf-card pf-created-prompt-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSportAreaPromptListSpecializationId(
                          specialization.id ?? null,
                        );
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSportAreaPromptListSpecializationId(
                            specialization.id ?? null,
                          );
                        }
                      }}
                    >
                      <div className="pf-prompt-card-title">
                        <h3>{specialization.label}</h3>
                      </div>
                      <p>{sport.label}</p>
                      <div className="pf-created-prompt-footer">
                        <div className="pf-prompt-overview-meta">
                          <span>
                            Prompt
                            <strong>{promptCount}</strong>
                          </span>
                          <span>
                            Stato
                            <strong>{activePrompt ? "In uso" : "Da creare"}</strong>
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </section>
        );
      }

      return (
        <section className="pf-stack">
          <section className="pf-panel pf-prompt-current-panel">
            <div className="pf-panel-header pf-prompt-current-header">
              <div>
                <h2>Prompt {areaDisplayName(selectedListArea.name)}</h2>
                <p className="pf-muted">
                  Prompt disponibili per questa area. Quello marcato in uso e
                  quello attivo per gli utenti.
                </p>
              </div>
              {canCreateSportAreaDraft && (
                <div className="pf-actions pf-prompt-current-actions">
                  <button
                    className="pf-button"
                    type="button"
                    onClick={() => {
                      const context = selectedContexts[0];
                      setSelectedAreaId(selectedListArea.id);
                      setSelectedSportId(context.sport.id ?? "");
                      setSelectedSpecializationId(
                        context.specialization.id ?? "",
                      );
                      createNewDraft();
                    }}
                  >
                    Crea nuova bozza
                  </button>
                </div>
              )}
            </div>

            {renderSportFilterControls({
              selectedSportId: sportAreaPromptListSportId,
              selectedSpecializationId: sportAreaPromptListSpecializationId,
              onSportChange: (sportId, specializationId) => {
                setSportAreaPromptListSportId(sportId);
                setSportAreaPromptListSpecializationId(specializationId);
              },
            })}

            <div className="pf-grid pf-created-prompts-grid">
              {sportAreaPromptEntries.map((entry) => (
                <article
                  key={
                    entry.kind === "active"
                      ? `active:${entry.sport.id}:${entry.specialization.id}`
                      : `draft:${entry.sport.id}:${entry.specialization.id}:${entry.draft.id}`
                  }
                  className={`pf-card pf-created-prompt-card ${
                    entry.kind === "active" ? "in-use" : ""
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    openPromptDetail(undefined, {
                      areaId: selectedListArea.id,
                      sportId: entry.sport.id ?? "",
                      specializationId: entry.specialization.id ?? "",
                      sportAreaSource:
                        entry.kind === "active" ? "active" : "draft",
                      sportAreaDraftId:
                        entry.kind === "draft" ? entry.draft.id : undefined,
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPromptDetail(undefined, {
                        areaId: selectedListArea.id,
                        sportId: entry.sport.id ?? "",
                        specializationId: entry.specialization.id ?? "",
                        sportAreaSource:
                          entry.kind === "active" ? "active" : "draft",
                        sportAreaDraftId:
                          entry.kind === "draft" ? entry.draft.id : undefined,
                      });
                    }
                  }}
                >
                  {entry.kind === "active" && (
                    <span className="pf-created-prompt-badge">In uso</span>
                  )}
                  <div className="pf-prompt-card-title">
                    <h3>
                      {entry.kind === "active"
                        ? entry.specialization.label
                        : entry.draft.name.startsWith("Precedente")
                          ? "Bozza precedente"
                          : entry.draft.name}
                    </h3>
                  </div>
                  <p>
                    {entry.kind === "active"
                      ? entry.sport.label
                      : `${entry.specialization.label} / ${entry.sport.label}`}
                  </p>
                  <div className="pf-created-prompt-footer">
                    <div className="pf-prompt-overview-meta">
                      <span>
                        Versione
                        <strong>
                          {entry.kind === "active"
                            ? entry.prompt.version
                              ? `v${entry.prompt.version}`
                              : "-"
                            : "Bozza"}
                        </strong>
                      </span>
                      <span>
                        Ultima modifica
                        <strong>
                          {formatDate(
                            entry.kind === "active"
                              ? entry.prompt.updatedAt
                              : entry.draft.updatedAt,
                          )}
                        </strong>
                      </span>
                      <span>
                        Stato
                        <strong>
                          {entry.kind === "active" ? "In uso" : "Non attivo"}
                        </strong>
                      </span>
                    </div>
                  </div>
                </article>
              ))}

              {sportAreaPromptEntries.length === 0 && (
                <EmptyState
                  title="Nessun prompt per questa area"
                  description="Crea una nuova bozza per iniziare."
                />
              )}
            </div>
          </section>
        </section>
      );
    }

    if (promptListMode === "area-config") {
      const selectedListArea =
        areas.find((area) => area.id === areaConfigPromptListAreaId) ?? null;

      if (!selectedListArea) {
        return (
          <section className="pf-stack">
            <section className="pf-panel pf-prompt-current-panel">
              <div className="pf-panel-header pf-prompt-current-header">
                <div>
                  <h2>Aree della performance</h2>
                  <p className="pf-muted">
                    Scegli un'area per vedere le configurazioni di proposta
                    disponibili e quella attualmente in uso.
                  </p>
                </div>
              </div>

              <div className="pf-grid pf-created-prompts-grid pf-created-prompts-list">
                {areas.map((area) => {
                  const config = areaConfigs.find(
                    (item) => item.areaId === area.id,
                  );
                  const draftsCount = readStoredAreaConfigDrafts(
                    areaConfigDraftsKey(area.id),
                  ).length;
                  return (
                    <article
                      key={area.id}
                      className="pf-card pf-created-prompt-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedAreaId(area.id);
                        setAreaConfigPromptListAreaId(area.id);
                        setAreaConfigPromptListSportId(allFilterValue);
                        setAreaConfigPromptListSpecializationId(allFilterValue);
                        setAreaConfigEditorSource("active");
                        setAreaConfigDraftId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedAreaId(area.id);
                          setAreaConfigPromptListAreaId(area.id);
                          setAreaConfigPromptListSportId(allFilterValue);
                          setAreaConfigPromptListSpecializationId(allFilterValue);
                          setAreaConfigEditorSource("active");
                          setAreaConfigDraftId(null);
                        }
                      }}
                    >
                      <div className="pf-prompt-card-title">
                        <h3>{areaDisplayName(area.name)}</h3>
                      </div>
                      <p>
                        Configurazione usata per generare proposta operativa e
                        questionario di monitoraggio dell'area.
                      </p>
                      <div className="pf-created-prompt-footer">
                        <div className="pf-prompt-overview-meta">
                          <span>
                            Prompt attivo
                            <strong>{config ? "Presente" : "Da creare"}</strong>
                          </span>
                          <span>
                            Versione
                            <strong>{config ? "v1" : "-"}</strong>
                          </span>
                          <span>
                            Bozze
                            <strong>{draftsCount}</strong>
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </section>
        );
      }

      if (
        !areaConfigPromptListSportId ||
        !areaConfigPromptListSpecializationId
      ) {
        return renderSportContextPicker({
          title: `Sport per ${areaDisplayName(selectedListArea.name)}`,
          description:
            "Scegli sport e specializzazione di riferimento prima di aprire i prompt di proposta per questa area.",
          selectedSportId: areaConfigPromptListSportId,
          selectedSpecializationId: areaConfigPromptListSpecializationId,
          onSportChange: (sportId, specializationId) => {
            setAreaConfigPromptListSportId(sportId || null);
            setAreaConfigPromptListSpecializationId(specializationId || null);
          },
          onOpen: (sportId, specializationId) => {
            if (sportId !== allFilterValue && specializationId !== allFilterValue) {
              setSelectedSportId(sportId);
              setSelectedSpecializationId(specializationId);
            }
            setAreaConfigPromptListSportId(sportId);
            setAreaConfigPromptListSpecializationId(specializationId);
            setAreaConfigEditorSource("active");
            setAreaConfigDraftId(null);
          },
        });
      }

      const selectedContexts = getFilteredSportContexts(
        areaConfigPromptListSportId,
        areaConfigPromptListSpecializationId,
      );
      const showAreaConfigSportGroups =
        areaConfigPromptListSportId === allFilterValue &&
        areaConfigPromptListSpecializationId === allFilterValue;
      const showAreaConfigSpecializationGroups =
        !!areaConfigPromptListSportId &&
        areaConfigPromptListSportId !== allFilterValue &&
        areaConfigPromptListSpecializationId === allFilterValue;
      const canCreateAreaConfigDraft =
        selectedContexts.length === 1 &&
        areaConfigPromptListSportId !== allFilterValue &&
        areaConfigPromptListSpecializationId !== allFilterValue;
      const activeConfig = areaConfigs.find(
        (item) => item.areaId === selectedListArea.id,
      );
      const areaConfigDraftEntries = selectedContexts.flatMap(
        ({ sport, specialization }) =>
          readStoredAreaConfigDrafts(
            areaConfigDraftsKey(
              selectedListArea.id,
              sport.id,
              specialization.id,
            ),
          ).map((draft) => ({
            sport,
            specialization,
            draft,
          })),
      );

      if (showAreaConfigSportGroups) {
        return (
          <section className="pf-stack">
            <section className="pf-panel pf-prompt-current-panel">
              <div className="pf-panel-header pf-prompt-current-header">
                <div>
                  <h2>Prompt {areaDisplayName(selectedListArea.name)}</h2>
                  <p className="pf-muted">
                    Scegli uno sport per vedere le zone disponibili per questa
                    area.
                  </p>
                </div>
              </div>

              {renderSportFilterControls({
                selectedSportId: areaConfigPromptListSportId,
                selectedSpecializationId: areaConfigPromptListSpecializationId,
                onSportChange: (sportId, specializationId) => {
                  setAreaConfigPromptListSportId(sportId);
                  setAreaConfigPromptListSpecializationId(specializationId);
                },
              })}

              <div className="pf-grid pf-created-prompts-grid">
                {sports.map((sport) => {
                  const draftsCount = sport.specializations.reduce(
                    (total, specialization) =>
                      total +
                      readStoredAreaConfigDrafts(
                        areaConfigDraftsKey(
                          selectedListArea.id,
                          sport.id,
                          specialization.id,
                        ),
                      ).length,
                    0,
                  );

                  return (
                    <article
                      key={sport.id}
                      className="pf-card pf-created-prompt-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setAreaConfigPromptListSportId(sport.id ?? null);
                        setAreaConfigPromptListSpecializationId(allFilterValue);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setAreaConfigPromptListSportId(sport.id ?? null);
                          setAreaConfigPromptListSpecializationId(allFilterValue);
                        }
                      }}
                    >
                      <div className="pf-prompt-card-title">
                        <h3>{sport.label}</h3>
                      </div>
                      <p>
                        Apri per vedere le zone di questo sport.
                      </p>
                      <div className="pf-created-prompt-footer">
                        <div className="pf-prompt-overview-meta">
                          <span>
                            Specializzazioni
                            <strong>{sport.specializations.length}</strong>
                          </span>
                          <span>
                            Bozze
                            <strong>{draftsCount}</strong>
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </section>
        );
      }

      if (showAreaConfigSpecializationGroups) {
        const sportGroup =
          sports.find((sport) => sport.id === areaConfigPromptListSportId) ??
          null;

        return (
          <section className="pf-stack">
            <section className="pf-panel pf-prompt-current-panel">
              <div className="pf-panel-header pf-prompt-current-header">
                <div>
                  <h2>{sportGroup?.label ?? "Sport"}</h2>
                  <p className="pf-muted">
                    Scegli una zona per vedere i prompt di proposta relativi a{" "}
                    {areaDisplayName(selectedListArea.name)}.
                  </p>
                </div>
              </div>

              {renderSportFilterControls({
                selectedSportId: areaConfigPromptListSportId,
                selectedSpecializationId: areaConfigPromptListSpecializationId,
                onSportChange: (sportId, specializationId) => {
                  setAreaConfigPromptListSportId(sportId);
                  setAreaConfigPromptListSpecializationId(specializationId);
                },
              })}

              <div className="pf-grid pf-created-prompts-grid">
                {selectedContexts.map(({ sport, specialization }) => {
                  const draftsCount = readStoredAreaConfigDrafts(
                    areaConfigDraftsKey(
                      selectedListArea.id,
                      sport.id,
                      specialization.id,
                    ),
                  ).length;
                  const promptCount = (activeConfig ? 1 : 0) + draftsCount;

                  return (
                    <article
                      key={`${sport.id}:${specialization.id}`}
                      className="pf-card pf-created-prompt-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setAreaConfigPromptListSpecializationId(
                          specialization.id ?? null,
                        );
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setAreaConfigPromptListSpecializationId(
                            specialization.id ?? null,
                          );
                        }
                      }}
                    >
                      <div className="pf-prompt-card-title">
                        <h3>{specialization.label}</h3>
                      </div>
                      <p>{sport.label}</p>
                      <div className="pf-created-prompt-footer">
                        <div className="pf-prompt-overview-meta">
                          <span>
                            Prompt
                            <strong>{promptCount}</strong>
                          </span>
                          <span>
                            Stato
                            <strong>{activeConfig ? "In uso" : "Da creare"}</strong>
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </section>
        );
      }

      return (
        <section className="pf-stack">
          <section className="pf-panel pf-prompt-current-panel">
            <div className="pf-panel-header pf-prompt-current-header">
              <div>
                <h2>Prompt {areaDisplayName(selectedListArea.name)}</h2>
                <p className="pf-muted">
                  Configurazioni disponibili per questa area. Quella marcata in
                  uso genera le proposte per gli utenti.
                </p>
              </div>
              {canCreateAreaConfigDraft && (
                <div className="pf-actions pf-prompt-current-actions">
                  <button
                    className="pf-button"
                    type="button"
                    onClick={() => {
                      const context = selectedContexts[0];
                      setSelectedAreaId(selectedListArea.id);
                      setSelectedSportId(context.sport.id ?? "");
                      setSelectedSpecializationId(
                        context.specialization.id ?? "",
                      );
                      createNewDraft();
                    }}
                  >
                    Crea nuova bozza
                  </button>
                </div>
              )}
            </div>

            {renderSportFilterControls({
              selectedSportId: areaConfigPromptListSportId,
              selectedSpecializationId: areaConfigPromptListSpecializationId,
              onSportChange: (sportId, specializationId) => {
                setAreaConfigPromptListSportId(sportId);
                setAreaConfigPromptListSpecializationId(specializationId);
              },
            })}

            <div className="pf-grid pf-created-prompts-grid">
              {activeConfig && selectedContexts.map(({ sport, specialization }) => (
                <article
                  key={`active:${sport.id}:${specialization.id}`}
                  className="pf-card pf-created-prompt-card in-use"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    openPromptDetail(undefined, {
                      areaId: selectedListArea.id,
                      sportId: sport.id ?? "",
                      specializationId: specialization.id ?? "",
                      areaConfigSource: "active",
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPromptDetail(undefined, {
                        areaId: selectedListArea.id,
                        sportId: sport.id ?? "",
                        specializationId: specialization.id ?? "",
                        areaConfigSource: "active",
                      });
                    }
                  }}
                >
                  <span className="pf-created-prompt-badge">In uso</span>
                  <div className="pf-prompt-card-title">
                    <h3>{specialization.label}</h3>
                  </div>
                  <p>{sport.label}</p>
                  <div className="pf-created-prompt-footer">
                    <div className="pf-prompt-overview-meta">
                      <span>
                        Versione
                        <strong>v1</strong>
                      </span>
                      <span>
                        Ultima modifica
                        <strong>{formatDate(activeConfig.updatedAt)}</strong>
                      </span>
                      <span>
                        Stato
                        <strong>In uso</strong>
                      </span>
                    </div>
                  </div>
                </article>
              ))}

              {areaConfigDraftEntries.map(({ sport, specialization, draft }) => (
                <article
                  key={`${sport.id}:${specialization.id}:${draft.id}`}
                  className="pf-card pf-created-prompt-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    openPromptDetail(undefined, {
                      areaId: selectedListArea.id,
                      sportId: sport.id ?? "",
                      specializationId: specialization.id ?? "",
                      areaConfigSource: "draft",
                      areaConfigDraftId: draft.id,
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPromptDetail(undefined, {
                        areaId: selectedListArea.id,
                        sportId: sport.id ?? "",
                        specializationId: specialization.id ?? "",
                        areaConfigSource: "draft",
                        areaConfigDraftId: draft.id,
                      });
                    }
                  }}
                >
                  <div className="pf-prompt-card-title">
                    <h3>
                      {draft.name.startsWith("Precedente")
                        ? "Bozza precedente"
                        : draft.name}
                    </h3>
                  </div>
                  <p>{specialization.label} / {sport.label}</p>
                  <div className="pf-created-prompt-footer">
                    <div className="pf-prompt-overview-meta">
                      <span>
                        Versione
                        <strong>Bozza</strong>
                      </span>
                      <span>
                        Ultima modifica
                        <strong>{formatDate(draft.updatedAt)}</strong>
                      </span>
                      <span>
                        Stato
                        <strong>Non attivo</strong>
                      </span>
                    </div>
                  </div>
                </article>
              ))}

              {!activeConfig && areaConfigDraftEntries.length === 0 && (
                <EmptyState
                  title="Nessun prompt per questa area"
                  description="Crea una nuova bozza per iniziare."
                />
              )}
            </div>
          </section>
        </section>
      );
    }

    if (promptListMode === "training") {
      const selectedListSport =
        trainingPromptListSportId &&
        trainingPromptListSportId !== allFilterValue
          ? sports.find((sport) => sport.id === trainingPromptListSportId) ??
            null
          : null;
      const selectedListSpecialization =
        selectedListSport &&
        trainingPromptListSpecializationId &&
        trainingPromptListSpecializationId !== allFilterValue
          ? selectedListSport.specializations.find(
              (specialization) =>
                specialization.id === trainingPromptListSpecializationId,
            ) ?? null
          : null;

      if (!selectedListSport || !selectedListSpecialization) {
        const menuSportId =
          trainingPromptListSportId ?? selectedSportId ?? allFilterValue;
        const menuSpecializationId =
          trainingPromptListSpecializationId ??
          selectedSpecializationId ??
          allFilterValue;
        const menuSport =
          menuSportId !== allFilterValue
            ? sports.find((sport) => sport.id === menuSportId) ?? null
            : null;
        const menuSpecializations = menuSport
          ? menuSport.specializations.map((specialization) => ({
              sport: menuSport,
              specialization,
            }))
          : sports.flatMap((sport) =>
              sport.specializations.map((specialization) => ({
                sport,
                specialization,
              })),
            );
        const menuContexts = getFilteredSportContexts(
          menuSportId,
          menuSpecializationId,
        );
        const showTrainingSportGroups =
          menuSportId === allFilterValue &&
          menuSpecializationId === allFilterValue;

        return (
          <section className="pf-stack">
            <section className="pf-panel pf-prompt-current-panel">
              <div className="pf-panel-header pf-prompt-current-header">
                <div>
                  <h2>Contesti allenamento</h2>
                  <p className="pf-muted">
                    Scegli sport e specializzazione per vedere i prompt di
                    allenamento disponibili.
                  </p>
                </div>
              </div>

              {sports.length === 0 ? (
                <EmptyState
                  title="Nessun contesto disponibile"
                  description="Configura prima almeno uno sport e una specializzazione."
                />
              ) : (
                <div className="pf-stack">
                  <div className="pf-two-col">
                    <label className="pf-field">
                      Sport
                      <select
                        className="pf-select"
                        value={menuSportId}
                        onChange={(event) => {
                          const nextSportId = event.target.value;
                          setTrainingPromptListSportId(nextSportId);
                          setTrainingPromptListSpecializationId(
                            nextSportId === allFilterValue
                              ? allFilterValue
                              : menuSpecializationId,
                          );
                        }}
                      >
                        <option value={allFilterValue}>Tutti</option>
                        {sports.map((sport) => (
                          <option key={sport.id} value={sport.id}>
                            {sport.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="pf-field">
                      Specializzazione
                      <select
                        className="pf-select"
                        value={menuSpecializationId}
                        onChange={(event) =>
                          setTrainingPromptListSpecializationId(
                            event.target.value,
                          )
                        }
                        disabled={menuSpecializations.length === 0}
                      >
                        <option value={allFilterValue}>Tutti</option>
                        {menuSpecializations.map(({ sport, specialization }) => (
                          <option
                            key={`${sport.id}:${specialization.id}`}
                            value={specialization.id}
                          >
                            {menuSport
                              ? specialization.label
                              : `${specialization.label} - ${sport.label}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {showTrainingSportGroups ? (
                    <div className="pf-grid pf-created-prompts-grid">
                      {sports.map((sport) => {
                        const promptCount = sport.specializations.reduce(
                          (total, specialization) => {
                            const draftsCount = readStoredTrainingDrafts(
                              trainingDraftsKey(
                                sport.id ?? "",
                                specialization.id ?? "",
                              ),
                            ).length;
                            return (
                              total +
                              (specialization.trainingPrompt ? 1 : 0) +
                              draftsCount
                            );
                          },
                          0,
                        );

                        return (
                          <article
                            key={sport.id}
                            className="pf-card pf-created-prompt-card"
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setTrainingPromptListSportId(sport.id ?? null);
                              setTrainingPromptListSpecializationId(
                                allFilterValue,
                              );
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setTrainingPromptListSportId(sport.id ?? null);
                                setTrainingPromptListSpecializationId(
                                  allFilterValue,
                                );
                              }
                            }}
                          >
                            <div className="pf-prompt-card-title">
                              <h3>{sport.label}</h3>
                            </div>
                            <p>
                              Apri per vedere i prompt divisi per
                              specializzazione.
                            </p>
                            <div className="pf-created-prompt-footer">
                              <div className="pf-prompt-overview-meta">
                                <span>
                                  Specializzazioni
                                  <strong>{sport.specializations.length}</strong>
                                </span>
                                <span>
                                  Prompt
                                  <strong>{promptCount}</strong>
                                </span>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : menuContexts.length > 0 ? (
                    <div className="pf-grid pf-created-prompts-grid">
                      {menuContexts.map(({ sport, specialization }) => {
                        const menuDraftsCount = readStoredTrainingDrafts(
                          trainingDraftsKey(
                            sport.id ?? "",
                            specialization.id ?? "",
                          ),
                        ).length;
                        return (
                          <article
                            key={`${sport.id}:${specialization.id}`}
                            className="pf-card pf-created-prompt-card"
                          >
                            <div className="pf-prompt-card-title">
                              <h3>{specialization.label}</h3>
                            </div>
                            <p>{sport.label}</p>
                            <div className="pf-created-prompt-footer">
                              <div className="pf-prompt-overview-meta">
                                <span>
                                  Prompt attivo
                                  <strong>
                                    {specialization.trainingPrompt
                                      ? "Presente"
                                      : "Da creare"}
                                  </strong>
                                </span>
                                <span>
                                  Stato
                                  <strong>
                                    {specialization.trainingPromptActive
                                      ? "Attivo"
                                      : "Non attivo"}
                                  </strong>
                                </span>
                                <span>
                                  Bozze
                                  <strong>{menuDraftsCount}</strong>
                                </span>
                              </div>
                              <div className="pf-created-prompt-actions">
                                <button
                                  type="button"
                                  className="pf-button"
                                  onClick={() => {
                                    setSelectedSportId(sport.id ?? "");
                                    setSelectedSpecializationId(
                                      specialization.id ?? "",
                                    );
                                    setTrainingPromptListSportId(
                                      sport.id ?? null,
                                    );
                                    setTrainingPromptListSpecializationId(
                                      specialization.id ?? null,
                                    );
                                    setTrainingEditorSource("active");
                                    setTrainingDraftId(null);
                                  }}
                                >
                                  Apri prompt
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState
                      title="Nessuna specializzazione"
                      description="Seleziona uno sport con almeno una specializzazione."
                    />
                  )}
                </div>
              )}
            </section>
          </section>
        );
      }

      const trainingDrafts =
        selectedListSport.id && selectedListSpecialization.id
          ? readStoredTrainingDrafts(
              trainingDraftsKey(
                selectedListSport.id,
                selectedListSpecialization.id,
              ),
            )
          : [];

      return (
        <section className="pf-stack">
          <section className="pf-panel pf-prompt-current-panel">
            <div className="pf-panel-header pf-prompt-current-header">
              <div>
                <h2>Prompt {selectedListSpecialization.label}</h2>
                <p className="pf-muted">
                  Prompt disponibili per questo contesto di allenamento. Quello
                  marcato in uso e attivo per gli utenti.
                </p>
              </div>
              <div className="pf-actions pf-prompt-current-actions">
                <button
                  className="pf-button"
                  type="button"
                  onClick={() => {
                    setSelectedSportId(selectedListSport.id ?? "");
                    setSelectedSpecializationId(
                      selectedListSpecialization.id ?? "",
                    );
                    createNewDraft();
                  }}
                >
                  Crea nuova bozza
                </button>
              </div>
            </div>

            <div className="pf-grid pf-created-prompts-grid">
              {selectedListSpecialization.trainingPrompt && (
                <article
                  className="pf-card pf-created-prompt-card in-use"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    openPromptDetail(undefined, {
                      sportId: selectedListSport.id ?? "",
                      specializationId: selectedListSpecialization.id ?? "",
                      trainingSource: "active",
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPromptDetail(undefined, {
                        sportId: selectedListSport.id ?? "",
                        specializationId: selectedListSpecialization.id ?? "",
                        trainingSource: "active",
                      });
                    }
                  }}
                >
                  <span className="pf-created-prompt-badge">In uso</span>
                  <div className="pf-prompt-card-title">
                    <h3>Prompt attivo</h3>
                  </div>
                  <p>
                    Prompt attivo per trasformare obiettivo e dati atleta in
                    allenamento specifico.
                  </p>
                  <div className="pf-created-prompt-footer">
                    <div className="pf-prompt-overview-meta">
                      <span>
                        Versione
                        <strong>
                          {selectedListSpecialization.trainingPromptVersion
                            ? `v${selectedListSpecialization.trainingPromptVersion}`
                            : "-"}
                        </strong>
                      </span>
                      <span>
                        Ultima modifica
                        <strong>
                          {formatDate(selectedListSpecialization.updatedAt)}
                        </strong>
                      </span>
                      <span>
                        Stato
                        <strong>In uso</strong>
                      </span>
                    </div>
                  </div>
                </article>
              )}

              {trainingDrafts.map((draft) => (
                <article
                  key={draft.id}
                  className="pf-card pf-created-prompt-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    openPromptDetail(undefined, {
                      sportId: selectedListSport.id ?? "",
                      specializationId: selectedListSpecialization.id ?? "",
                      trainingSource: "draft",
                      trainingDraftId: draft.id,
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPromptDetail(undefined, {
                        sportId: selectedListSport.id ?? "",
                        specializationId: selectedListSpecialization.id ?? "",
                        trainingSource: "draft",
                        trainingDraftId: draft.id,
                      });
                    }
                  }}
                >
                  <div className="pf-prompt-card-title">
                    <h3>
                      {draft.name.startsWith("Precedente")
                        ? "Bozza precedente"
                        : draft.name}
                    </h3>
                  </div>
                  <p>
                    {selectedListSpecialization.label} / {selectedListSport.label}
                  </p>
                  <div className="pf-created-prompt-footer">
                    <div className="pf-prompt-overview-meta">
                      <span>
                        Versione
                        <strong>Bozza</strong>
                      </span>
                      <span>
                        Ultima modifica
                        <strong>{formatDate(draft.updatedAt)}</strong>
                      </span>
                      <span>
                        Stato
                        <strong>Non attivo</strong>
                      </span>
                    </div>
                  </div>
                </article>
              ))}

              {!selectedListSpecialization.trainingPrompt &&
                trainingDrafts.length === 0 && (
                  <EmptyState
                    title="Nessun prompt per questo contesto"
                    description="Crea una nuova bozza per iniziare."
                  />
                )}
            </div>
          </section>
        </section>
      );
    }

    return (
      <section className="pf-stack">
        <section className="pf-panel pf-prompt-current-panel">
          <div className="pf-panel-header pf-prompt-current-header">
            <div>
              <h2>{listTitle}</h2>
              <p className="pf-muted">
                Prompt configurato per il contesto selezionato. Aprilo per
                vedere i dettagli completi.
              </p>
            </div>
            <div className="pf-actions pf-prompt-current-actions">
              <button
                className="pf-button"
                type="button"
                onClick={createNewDraft}
              >
                Crea nuova bozza
              </button>
            </div>
          </div>

          <div className="pf-grid pf-created-prompts-grid">
            <button
              type="button"
              className="pf-card pf-created-prompt-card in-use"
              onClick={() => openPromptDetail()}
            >
              <span className="pf-created-prompt-badge">In uso</span>
              <div className="pf-prompt-card-title">
                <h3>{listTitle}</h3>
              </div>
              <p>{getPromptOverview(promptListMode ?? "goal").description}</p>
              <div className="pf-prompt-overview-meta">
                <span>
                  Versione
                  <strong>{versionLabel ? `v${versionLabel}` : "-"}</strong>
                </span>
                <span>
                  Ultima modifica
                  <strong>{formatDate(updatedAt)}</strong>
                </span>
                <span>
                  Stato
                  <strong>In uso</strong>
                </span>
              </div>
            </button>
          </div>
        </section>
      </section>
    );
  };

  const renderSportSelectors = (includeArea: boolean) => {
    return (
      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Contesto del prompt</h2>
            <p className="pf-muted">
              Seleziona sport, specializzazione e area per modificare il prompt corretto.
            </p>
          </div>
        </div>
        <div className="pf-stack">
          <div className="pf-two-col">
            <label className="pf-field">
              Sport
              <select
                className="pf-select"
                value={selectedSportId}
                onChange={(event) => setSelectedSportId(event.target.value)}
              >
                {sports.map((sport) => (
                  <option key={sport.id} value={sport.id}>
                    {sport.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="pf-field">
              Specializzazione
              <select
                className="pf-select"
                value={selectedSpecializationId}
                onChange={(event) =>
                  setSelectedSpecializationId(event.target.value)
                }
              >
                {(selectedSport?.specializations ?? []).map((specialization) => (
                  <option key={specialization.id} value={specialization.id}>
                    {specialization.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {includeArea && (
            <>
              <div className="pf-grid">
                {areas.map((area) => {
                  const areaPrompt = selectedSpecialization?.prompts.find(
                    (prompt) => prompt.areaId === area.id,
                  );
                  const areaEnabled = areaPrompt?.isEnabledDriver ?? true;
                  const isSelected = selectedAreaId === area.id;
                  return (
                    <div
                      key={area.id}
                      className={`pf-config-row pf-area-selector-card ${
                        isSelected ? "selected" : ""
                      }`}
                      style={{
                        borderColor:
                          isSelected ? "var(--pf-accent)" : undefined,
                      }}
                    >
                      <button
                        type="button"
                        className="pf-area-selector-main"
                        onClick={() => setSelectedAreaId(area.id)}
                      >
                        <span>
                          <strong>{areaDisplayName(area.name)}</strong>
                          <small>
                            {areaEnabled
                              ? "Area attiva nella valutazione"
                              : "Area esclusa dalla valutazione"}
                          </small>
                        </span>
                      </button>
                      <div className="pf-area-toggle-group">
                        <button
                          type="button"
                          className={`pf-area-toggle-button ${
                            !areaEnabled ? "active" : ""
                          }`}
                          disabled={
                            areaEnabled || busyKey === `area-toggle-${area.id}`
                          }
                          onClick={() => {
                            setSelectedAreaId(area.id);
                            void updateSportAreaEnabled(area.id, true);
                          }}
                        >
                          Attiva
                        </button>
                        <button
                          type="button"
                          className={`pf-area-toggle-button ${
                            areaEnabled ? "active" : ""
                          }`}
                          disabled={
                            !areaEnabled || busyKey === `area-toggle-${area.id}`
                          }
                          onClick={() => {
                            setSelectedAreaId(area.id);
                            void updateSportAreaEnabled(area.id, false);
                          }}
                        >
                          Disattiva
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>
    );
  };

  const renderEditor = () => {
    if (!settings) {
      return (
        <EmptyState
          title="Caricamento prompt"
          description="Recupero configurazione da Gestione prompt."
        />
      );
    }

    if (!editorOpen) {
      if (promptListMode) {
        return renderCreatedPromptsList();
      }
      return renderPromptOverview();
    }

    return (
      <section className="pf-stack">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Dettaglio prompt</h2>
              <p className="pf-muted">{editorDescription}</p>
            </div>
          </div>

          <div className="pf-stack">
            <section className="pf-prompt-status-grid" aria-label="Stato prompt">
              <div>
                <span>Stato</span>
                <strong>{statusLabel}</strong>
              </div>
              <div>
                <span>Versione</span>
                <strong>{versionLabel ? `v${versionLabel}` : "-"}</strong>
              </div>
              <div>
                <span>Ultima modifica</span>
                <strong>{formatDate(updatedAt)}</strong>
              </div>
              <div className="pf-prompt-status-action">
                <span>Attivazione</span>
                <button
                  type="button"
                  className="pf-button-secondary"
                  disabled={
                    currentPromptIsActive || busyKey?.startsWith("activate-")
                  }
                  onClick={requestActivateCurrentPrompt}
                >
                  {currentPromptIsActive ? "Prompt attivo" : "Rendi attivo"}
                </button>
              </div>
            </section>

            {mode === "goal" && (
              <>
                <label className="pf-field">
                  Nome prompt
                  <input
                    className="pf-input"
                    value={goalDraft.name}
                    onChange={(event) =>
                      setGoalDraft((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="pf-field">
                  Prompt di validazione obiettivo
                  <textarea
                    className="pf-textarea pf-prompt-textarea"
                    rows={16}
                    value={goalDraft.basePrompt}
                    onChange={(event) =>
                      setGoalDraft((prev) => ({
                        ...prev,
                        basePrompt: event.target.value,
                      }))
                    }
                  />
                </label>
              </>
            )}

            {mode === "sport-area" && (
              <>
                <label className="pf-field">
                  Istruzioni per l'area: {currentAreaName}
                  <textarea
                    className="pf-textarea pf-prompt-textarea"
                    rows={18}
                    value={sportAreaPrompt}
                    onChange={(event) => setSportAreaPrompt(event.target.value)}
                  />
                </label>
              </>
            )}

            {mode === "training" && (
              <>
                <label className="pf-field">
                  Istruzioni allenamento - {selectedSport?.label ?? "Sport"} /{" "}
                  {selectedSpecialization?.label ?? "Specializzazione"}
                  <textarea
                    className="pf-textarea pf-prompt-textarea"
                    rows={18}
                    value={trainingPrompt}
                    onChange={(event) => setTrainingPrompt(event.target.value)}
                  />
                </label>
              </>
            )}

            {mode === "area-config" && (
              <>
                <label className="pf-field">
                  Istruzioni di generazione - {currentAreaName}
                  <textarea
                    className="pf-textarea pf-prompt-textarea"
                    rows={9}
                    value={areaInitialContext}
                    onChange={(event) =>
                      setAreaInitialContext(event.target.value)
                    }
                  />
                </label>
                <label className="pf-field">
                  Formato della proposta
                  <textarea
                    className="pf-textarea pf-prompt-textarea"
                    rows={7}
                    value={areaResponseFormat}
                    onChange={(event) =>
                      setAreaResponseFormat(event.target.value)
                    }
                  />
                </label>
                <label className="pf-field">
                  Questionario di monitoraggio
                  <textarea
                    className="pf-textarea pf-mono pf-prompt-textarea"
                    rows={8}
                    value={areaLayoutText}
                    onChange={(event) => setAreaLayoutText(event.target.value)}
                  />
                </label>
              </>
            )}

            <div className="pf-form-actions">
              <button
                className="pf-button-secondary pf-save-draft-button"
                type="button"
                disabled={busyKey === "save" || !canSaveDraft}
                onClick={saveDraft}
              >
                {busyKey === "save" ? "Salvataggio..." : "Salva bozza"}
              </button>
            </div>
          </div>
        </article>
      </section>
    );
  };

  const promptBackAction = editorOpen
    ? {
        onClick: () => {
          setEditorOpen(false);
          setMessage(null);
        },
      }
    : promptListMode === "area-config" && areaConfigPromptListAreaId
      ? {
          onClick: () => {
            if (
              areaConfigPromptListSportId === allFilterValue &&
              areaConfigPromptListSpecializationId === allFilterValue
            ) {
              setAreaConfigPromptListAreaId(null);
            } else if (
              areaConfigPromptListSportId &&
              areaConfigPromptListSportId !== allFilterValue &&
              areaConfigPromptListSpecializationId &&
              areaConfigPromptListSpecializationId !== allFilterValue
            ) {
              setAreaConfigPromptListSpecializationId(allFilterValue);
            } else if (
              areaConfigPromptListSportId &&
              areaConfigPromptListSportId !== allFilterValue &&
              areaConfigPromptListSpecializationId === allFilterValue
            ) {
              setAreaConfigPromptListSportId(allFilterValue);
              setAreaConfigPromptListSpecializationId(allFilterValue);
            } else if (areaConfigPromptListSpecializationId) {
              setAreaConfigPromptListSportId(null);
              setAreaConfigPromptListSpecializationId(null);
            } else {
              setAreaConfigPromptListAreaId(null);
            }
            setAreaConfigEditorSource("active");
            setAreaConfigDraftId(null);
            setMessage(null);
          },
        }
    : promptListMode === "training" && trainingPromptListSpecializationId
      ? {
          onClick: () => {
            if (
              trainingPromptListSportId &&
              trainingPromptListSportId !== allFilterValue &&
              trainingPromptListSpecializationId &&
              trainingPromptListSpecializationId !== allFilterValue
            ) {
              setTrainingPromptListSpecializationId(allFilterValue);
            } else if (
              trainingPromptListSportId &&
              trainingPromptListSportId !== allFilterValue &&
              trainingPromptListSpecializationId === allFilterValue
            ) {
              setTrainingPromptListSportId(allFilterValue);
              setTrainingPromptListSpecializationId(allFilterValue);
            } else {
              setTrainingPromptListSportId(null);
              setTrainingPromptListSpecializationId(null);
            }
            setTrainingEditorSource("active");
            setTrainingDraftId(null);
            setMessage(null);
          },
        }
    : promptListMode === "sport-area" && sportAreaPromptListAreaId
      ? {
          onClick: () => {
            if (
              sportAreaPromptListSportId === allFilterValue &&
              sportAreaPromptListSpecializationId === allFilterValue
            ) {
              setSportAreaPromptListAreaId(null);
            } else if (
              sportAreaPromptListSportId &&
              sportAreaPromptListSportId !== allFilterValue &&
              sportAreaPromptListSpecializationId &&
              sportAreaPromptListSpecializationId !== allFilterValue
            ) {
              setSportAreaPromptListSpecializationId(allFilterValue);
            } else if (
              sportAreaPromptListSportId &&
              sportAreaPromptListSportId !== allFilterValue &&
              sportAreaPromptListSpecializationId === allFilterValue
            ) {
              setSportAreaPromptListSportId(allFilterValue);
              setSportAreaPromptListSpecializationId(allFilterValue);
            } else if (sportAreaPromptListSpecializationId) {
              setSportAreaPromptListSportId(null);
              setSportAreaPromptListSpecializationId(null);
            } else {
              setSportAreaPromptListAreaId(null);
            }
            setSportAreaEditorSource("active");
            setSportAreaDraftId(null);
            setMessage(null);
          },
        }
    : promptListMode
      ? {
          onClick: () => {
            setPromptListMode(null);
            setSportAreaPromptListAreaId(null);
            setSportAreaPromptListSportId(null);
            setSportAreaPromptListSpecializationId(null);
            setAreaConfigPromptListAreaId(null);
            setAreaConfigPromptListSportId(null);
            setAreaConfigPromptListSpecializationId(null);
            setTrainingPromptListSportId(null);
            setTrainingPromptListSpecializationId(null);
            setMessage(null);
          },
        }
      : undefined;
  const currentHeaderOverview = getPromptOverview(mode);
  const promptListHeaderOverview = promptListMode
    ? getPromptOverview(promptListMode)
    : null;
  const pageHeader = editorOpen
    ? {
        eyebrow: "DETTAGLIO PROMPT",
        title: currentHeaderOverview.title,
        description: editorDescription,
      }
    : promptListHeaderOverview
      ? {
          eyebrow: "LISTA PROMPT",
          title:
            promptListMode === "sport-area" && sportAreaPromptListAreaId
              ? `Prompt ${areaDisplayName(
                  areas.find((area) => area.id === sportAreaPromptListAreaId)
                    ?.name,
                )}`
              : promptListMode === "area-config" && areaConfigPromptListAreaId
                ? `Prompt ${areaDisplayName(
                    areas.find((area) => area.id === areaConfigPromptListAreaId)
                      ?.name,
                  )}`
                : promptListMode === "training" &&
                    trainingPromptListSpecializationId
                  ? `Prompt ${
                      sports
                        .find((sport) => sport.id === trainingPromptListSportId)
                        ?.specializations.find(
                          (specialization) =>
                            specialization.id ===
                            trainingPromptListSpecializationId,
                        )?.label ?? "allenamento"
                    }`
              : promptListHeaderOverview.title,
          description:
            promptListMode === "goal"
              ? "Lista dei prompt creati. Aprine uno per vedere dettagli, modifiche e attivazione."
              : promptListMode === "sport-area" && !sportAreaPromptListAreaId
                ? "Seleziona un'area della performance per vedere i prompt disponibili."
                : promptListMode === "sport-area"
                  ? "Prompt disponibili per l'area selezionata. Aprine uno per dettagli, modifica e attivazione."
                  : promptListMode === "area-config" && !areaConfigPromptListAreaId
                    ? "Seleziona un'area della performance per vedere le configurazioni disponibili."
                    : promptListMode === "area-config"
                      ? "Prompt disponibili per l'area selezionata. Aprine uno per dettagli, modifica e attivazione."
                      : promptListMode === "training" &&
                          !trainingPromptListSpecializationId
                        ? "Seleziona sport e specializzazione per vedere i prompt disponibili."
                        : promptListMode === "training"
                          ? "Prompt disponibili per il contesto selezionato. Aprine uno per dettagli, modifica e attivazione."
              : "Prompt configurato per il contesto selezionato. Aprilo per vedere i dettagli completi.",
        }
      : {
          eyebrow: "GESTIONE PROMPT",
          title: "Prompt",
          description: "Scegli prompt, contesto, modifica e salva la bozza.",
        };

  return (
    <ProductShell
      eyebrow={pageHeader.eyebrow}
      title={pageHeader.title}
      description={pageHeader.description}
      actions={
        <>
          <button
            className="pf-button-secondary"
            type="button"
            disabled={busyKey === "export-active-prompts"}
            onClick={() => setExportConfirmOpen(true)}
          >
            Export prompt attivi
          </button>
          <button className="pf-button-secondary" type="button" onClick={loadSettings}>
            Aggiorna
          </button>
        </>
      }
      backAction={promptBackAction}
    >
      <div className="pf-prompt-management">
        {message && <div className="pf-alert warning">{message}</div>}
        {editorOpen &&
          mode === "sport-area" &&
          promptListMode !== "sport-area" &&
          !sportAreaPromptListAreaId &&
          renderSportSelectors(true)}
        {editorOpen &&
          mode === "training" &&
          promptListMode !== "training" &&
          !trainingPromptListSpecializationId &&
          renderSportSelectors(false)}
        {editorOpen &&
          mode === "area-config" &&
          promptListMode !== "area-config" &&
          !areaConfigPromptListAreaId &&
          renderSportSelectors(true)}
        {renderEditor()}
        {activationTarget && (
          <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
            <section className="pf-modal pf-confirm-modal">
              <div className="pf-panel-header">
                <div>
                  <h2>Attivare prompt?</h2>
                  <p className="pf-muted">
                    Sei sicuro di voler attivare? Il prompt verra attivato per
                    tutti gli utenti.
                  </p>
                </div>
              </div>
              <div className="pf-form-actions">
                <button
                  type="button"
                  className="pf-button"
                  disabled={busyKey?.startsWith("activate-")}
                  onClick={confirmActivation}
                >
                  {busyKey?.startsWith("activate-")
                    ? "Attivazione..."
                    : "Conferma"}
                </button>
                <button
                  type="button"
                  className="pf-button-secondary"
                  disabled={busyKey?.startsWith("activate-")}
                  onClick={() => setActivationTarget(null)}
                >
                  Annulla
                </button>
              </div>
            </section>
          </div>
        )}
        {exportConfirmOpen && (
          <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
            <section className="pf-modal pf-confirm-modal">
              <div className="pf-panel-header">
                <div>
                  <h2>Esportare prompt attivi?</h2>
                  <p className="pf-muted">
                    Il file contiene prompt AI e configurazioni correnti con
                    valore sensibile/IP. Le versioni storiche, i log, i dati
                    utente e i segreti non verranno esportati.
                  </p>
                </div>
              </div>
              <div className="pf-form-actions">
                <button
                  type="button"
                  className="pf-button"
                  disabled={busyKey === "export-active-prompts"}
                  onClick={() => void confirmExportActivePrompts()}
                >
                  {busyKey === "export-active-prompts"
                    ? "Export..."
                    : "Conferma export"}
                </button>
                <button
                  type="button"
                  className="pf-button-secondary"
                  disabled={busyKey === "export-active-prompts"}
                  onClick={() => setExportConfirmOpen(false)}
                >
                  Annulla
                </button>
              </div>
            </section>
          </div>
        )}
        {successPopup && (
          <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
            <section className="pf-modal pf-confirm-modal">
              <div className="pf-panel-header">
                <div>
                  <h2>Azione completata</h2>
                  <p className="pf-muted">{successPopup}</p>
                </div>
              </div>
              <div className="pf-form-actions">
                <button
                  type="button"
                  className="pf-button"
                  onClick={() => setSuccessPopup(null)}
                >
                  OK
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </ProductShell>
  );
}
