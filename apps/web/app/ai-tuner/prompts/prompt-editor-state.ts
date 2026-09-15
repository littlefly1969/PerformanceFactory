import {
  areaConfigDraftsKey,
  readStoredAreaConfigDrafts,
  readStoredDraft,
  readStoredSportAreaDrafts,
  readStoredTrainingDrafts,
  sportAreaDraftKey,
  sportAreaDraftsKey,
  trainingDraftKey,
  trainingDraftsKey,
} from "./prompt-draft-storage";
import type {
  AreaGenerationConfig,
  StoredSportAreaDraft,
} from "./prompt-model";
import {
  areaDisplayName,
  stringifyJson,
  type Area,
  type GoalPromptConfig,
  type PromptMode,
  type PromptSettings,
  type SportCatalogItem,
  type SportPrompt,
  type SportSpecialization,
} from "./prompt-model";
export function derivePromptEditor(state: {
  mode: PromptMode;
  goalDraft: GoalPromptConfig;
  sportAreaPrompt: string;
  trainingPrompt: string;
  areaInitialContext: string;
  areaResponseFormat: string;
  areaLayoutText: string;
  settings: PromptSettings | null;
  selectedSportPrompt: SportPrompt | null;
  selectedSpecialization: SportSpecialization | null;
  selectedAreaConfig: AreaGenerationConfig | null;
  selectedSportId: string;
  selectedSpecializationId: string;
  selectedAreaId: string;
  sportAreaDraftId: string | null;
  sportAreaDraftsFor: (
    sport: SportCatalogItem | null | undefined,
    specialization: SportSpecialization | null | undefined,
    area: Area | null | undefined,
    activePrompt: SportPrompt | null | undefined,
  ) => StoredSportAreaDraft[];
  selectedSport: SportCatalogItem | null;
  selectedArea: Area | null;
  trainingDraftId: string | null;
  areaConfigDraftId: string | null;
  goalPromptConfigs: GoalPromptConfig[];
  sportAreaEditorSource: "active" | "draft" | "new";
  trainingEditorSource: "active" | "draft" | "new";
  areaConfigEditorSource: "active" | "draft" | "new";
  sportAreaActive: boolean;
  trainingActive: boolean;
}) {
  const {
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
  } = state;
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
      ? (readStoredSportAreaDrafts(
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
        ))
      : null;
  const savedTrainingDraft =
    mode === "training" && selectedSportId && selectedSpecializationId
      ? (readStoredTrainingDrafts(
          trainingDraftsKey(selectedSportId, selectedSpecializationId),
        ).find((draft) => draft.id === trainingDraftId)?.trainingPrompt ??
        readStoredDraft(
          trainingDraftKey(selectedSportId, selectedSpecializationId),
        ))
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
      ? (goalPromptConfigs.find((item) => item.id === goalDraft.id) ?? null)
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
          : areaConfigEditorSource === "draft" ||
              areaConfigEditorSource === "new"
            ? undefined
            : selectedAreaConfig
              ? (selectedAreaConfig.version ?? 1)
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
  return {
    currentPromptText,
    activePromptText,
    currentPrompt,
    hasChanges,
    savedSportAreaDraft,
    savedTrainingDraft,
    savedAreaConfigDraft,
    savedAreaConfigDraftText,
    savedGoalDraft,
    draftAlreadySaved,
    canSaveDraft,
    currentAreaName,
    currentPromptIsActive,
    statusLabel,
    versionLabel,
    updatedAt,
    editorDescription,
  };
}
