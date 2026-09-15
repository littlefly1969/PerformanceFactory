import { API_BASE, secureFetch } from "@/app/lib/api";
import { downloadResponseBody } from "@/app/lib/download";
import type { Dispatch, SetStateAction } from "react";
import {
  readStoredSportAreaDrafts,
  sportAreaDraftsKey,
} from "./prompt-draft-storage";
import { formatDate, readError } from "./prompt-management-model";
import type { AreaGenerationConfig } from "./prompt-model";
import {
  allFilterValue,
  areaDisplayName,
  defaultSportAreaPromptText,
  type ActivationTarget,
  type Area,
  type GoalPromptConfig,
  type PromptMode,
  type PromptSettings,
  type SportCatalogItem,
  type SportPrompt,
  type SportSpecialization,
} from "./prompt-model";
export async function confirmActivationAction(actionState: {
  activationTarget: ActivationTarget | null;
  performActivateGoalPrompt: (
    promptConfig: GoalPromptConfig,
    options?: { forceSaveActive?: boolean },
  ) => Promise<boolean>;
  hasChanges: boolean;
  activateSportAreaPrompt: () => Promise<boolean>;
  activateAreaConfigPrompt: () => Promise<boolean>;
  activateTrainingPrompt: () => Promise<boolean>;
  setActivationTarget: Dispatch<SetStateAction<ActivationTarget | null>>;
  showSuccess: (text: string) => void;
}) {
  const {
    activationTarget,
    performActivateGoalPrompt,
    hasChanges,
    activateSportAreaPrompt,
    activateAreaConfigPrompt,
    activateTrainingPrompt,
    setActivationTarget,
    showSuccess,
  } = actionState;

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
}

export async function confirmExportActivePromptsAction(actionState: {
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setExportConfirmOpen: Dispatch<SetStateAction<boolean>>;
  showSuccess: (text: string) => void;
}) {
  const { setBusyKey, setMessage, setExportConfirmOpen, showSuccess } =
    actionState;

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
}

export function saveCurrentPromptAction(actionState: {
  mode: PromptMode;
  saveGoalPrompt: () => Promise<void>;
  saveSportAreaPrompt: () => Promise<void>;
  saveTrainingPrompt: () => Promise<void>;
  saveAreaConfig: () => Promise<void>;
}) {
  const {
    mode,
    saveGoalPrompt,
    saveSportAreaPrompt,
    saveTrainingPrompt,
    saveAreaConfig,
  } = actionState;

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
}

export function saveDraftAction(actionState: {
  hasChanges: boolean;
  setMessage: Dispatch<SetStateAction<string | null>>;
  draftAlreadySaved: boolean;
  currentPrompt: string;
  saveCurrentPrompt: () => Promise<void>;
}) {
  const {
    hasChanges,
    setMessage,
    draftAlreadySaved,
    currentPrompt,
    saveCurrentPrompt,
  } = actionState;

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
}

export function openPromptModeAction(
  actionState: {
    setMode: Dispatch<SetStateAction<PromptMode>>;
    setPromptListMode: Dispatch<SetStateAction<PromptMode | null>>;
    setSportAreaPromptListAreaId: Dispatch<SetStateAction<string | null>>;
    setSportAreaPromptListSportId: Dispatch<SetStateAction<string | null>>;
    setSportAreaPromptListSpecializationId: Dispatch<
      SetStateAction<string | null>
    >;
    setSportAreaEditorSource: Dispatch<
      SetStateAction<"active" | "draft" | "new">
    >;
    setSportAreaDraftId: Dispatch<SetStateAction<string | null>>;
    setAreaConfigPromptListAreaId: Dispatch<SetStateAction<string | null>>;
    setAreaConfigPromptListSportId: Dispatch<SetStateAction<string | null>>;
    setAreaConfigPromptListSpecializationId: Dispatch<
      SetStateAction<string | null>
    >;
    setAreaConfigEditorSource: Dispatch<
      SetStateAction<"active" | "draft" | "new">
    >;
    setAreaConfigDraftId: Dispatch<SetStateAction<string | null>>;
    setTrainingPromptListSportId: Dispatch<SetStateAction<string | null>>;
    setTrainingPromptListSpecializationId: Dispatch<
      SetStateAction<string | null>
    >;
    setTrainingEditorSource: Dispatch<
      SetStateAction<"active" | "draft" | "new">
    >;
    setTrainingDraftId: Dispatch<SetStateAction<string | null>>;
    setEditorOpen: Dispatch<SetStateAction<boolean>>;
  },
  promptMode: PromptMode,
) {
  const {
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
  } = actionState;

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
}

export function openPromptDetailAction(
  actionState: {
    setGoalDraft: Dispatch<SetStateAction<GoalPromptConfig>>;
    setSelectedAreaId: Dispatch<SetStateAction<string>>;
    setSelectedSportId: Dispatch<SetStateAction<string>>;
    setSelectedSpecializationId: Dispatch<SetStateAction<string>>;
    mode: PromptMode;
    setSportAreaEditorSource: Dispatch<
      SetStateAction<"active" | "draft" | "new">
    >;
    setSportAreaDraftId: Dispatch<SetStateAction<string | null>>;
    setAreaConfigEditorSource: Dispatch<
      SetStateAction<"active" | "draft" | "new">
    >;
    setAreaConfigDraftId: Dispatch<SetStateAction<string | null>>;
    setTrainingEditorSource: Dispatch<
      SetStateAction<"active" | "draft" | "new">
    >;
    setTrainingDraftId: Dispatch<SetStateAction<string | null>>;
    setEditorOpen: Dispatch<SetStateAction<boolean>>;
  },
  promptConfig?: GoalPromptConfig | undefined,
  options?:
    | {
        areaId?: string;
        sportId?: string;
        specializationId?: string;
        sportAreaSource?: "active" | "draft" | "new";
        sportAreaDraftId?: string | null;
        areaConfigSource?: "active" | "draft" | "new";
        areaConfigDraftId?: string | null;
        trainingSource?: "active" | "draft" | "new";
        trainingDraftId?: string | null;
      }
    | undefined,
) {
  const {
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
  } = actionState;

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
}

export function createNewDraftAction(actionState: {
  mode: PromptMode;
  setGoalDraft: Dispatch<SetStateAction<GoalPromptConfig>>;
  setSportAreaPrompt: Dispatch<SetStateAction<string>>;
  setSportAreaActive: Dispatch<SetStateAction<boolean>>;
  setSportAreaEnabled: Dispatch<SetStateAction<boolean>>;
  setSportAreaEditorSource: Dispatch<
    SetStateAction<"active" | "draft" | "new">
  >;
  setSportAreaDraftId: Dispatch<SetStateAction<string | null>>;
  setTrainingPrompt: Dispatch<SetStateAction<string>>;
  setTrainingActive: Dispatch<SetStateAction<boolean>>;
  setTrainingEditorSource: Dispatch<SetStateAction<"active" | "draft" | "new">>;
  setTrainingDraftId: Dispatch<SetStateAction<string | null>>;
  setAreaInitialContext: Dispatch<SetStateAction<string>>;
  setAreaResponseFormat: Dispatch<SetStateAction<string>>;
  setAreaLayoutText: Dispatch<SetStateAction<string>>;
  setAreaConfigEditorSource: Dispatch<
    SetStateAction<"active" | "draft" | "new">
  >;
  setAreaConfigDraftId: Dispatch<SetStateAction<string | null>>;
  setPromptListMode: Dispatch<SetStateAction<PromptMode | null>>;
  setEditorOpen: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const {
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
  } = actionState;

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
}

export function getPromptOverviewAction(
  actionState: {
    settings: PromptSettings | null;
    selectedSportPrompt: SportPrompt | null;
    selectedAreaConfig: AreaGenerationConfig | null;
    selectedSpecialization: SportSpecialization | null;
  },
  promptMode: PromptMode,
) {
  const {
    settings,
    selectedSportPrompt,
    selectedAreaConfig,
    selectedSpecialization,
  } = actionState;

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
      version: selectedSportPrompt?.version
        ? `v${selectedSportPrompt.version}`
        : "-",
      updatedAt: formatDate(selectedSportPrompt?.updatedAt),
    };
  }
  if (promptMode === "area-config") {
    return {
      title: "Generazione proposta area",
      description:
        "Definisce la proposta operativa e il questionario prodotti per ogni area.",
      where: "Generazione consigli area",
      version: selectedAreaConfig ? `v${selectedAreaConfig.version ?? 1}` : "-",
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
}

export function getFilteredSportContextsAction(
  actionState: {
    sports: SportCatalogItem[];
  },
  sportFilterId: string | null,
  specializationFilterId: string | null,
) {
  const { sports } = actionState;

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
}

export function sportAreaDraftsForAction(
  actionState: Record<string, never>,
  sport: SportCatalogItem | null | undefined,
  specialization: SportSpecialization | null | undefined,
  area: Area | null | undefined,
  activePrompt: SportPrompt | null | undefined,
) {
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
}
