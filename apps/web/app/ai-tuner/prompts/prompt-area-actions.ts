import { API_BASE, secureFetch } from "@/app/lib/api";
import type { Dispatch, SetStateAction } from "react";
import {
  areaConfigDraftsKey,
  makeHistoryDraftId,
  readStoredAreaConfigDrafts,
  writeStoredAreaConfigDrafts,
} from "./prompt-draft-storage";
import { readError } from "./prompt-management-model";
import type { AreaGenerationConfig } from "./prompt-model";
import {
  areaDisplayName,
  stringifyJson,
  type Area,
  type StoredAreaConfigDraft,
} from "./prompt-model";
export async function activateAreaConfigPromptAction(actionState: {
  selectedArea: Area | null;
  setMessage: Dispatch<SetStateAction<string | null>>;
  areaLayoutText: string;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  selectedAreaConfig: AreaGenerationConfig | null;
  areaInitialContext: string;
  areaResponseFormat: string;
  selectedSportId: string;
  selectedSpecializationId: string;
  areaConfigDraftId: string | null;
  setAreaConfigEditorSource: Dispatch<
    SetStateAction<"active" | "draft" | "new">
  >;
  setAreaConfigDraftId: Dispatch<SetStateAction<string | null>>;
  loadSettings: () => Promise<void>;
}) {
  const {
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
  } = actionState;

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
      preservedActiveDrafts.filter((draft) => draft.id !== areaConfigDraftId),
    );
  } else {
    writeStoredAreaConfigDrafts(draftsKey, preservedActiveDrafts);
  }
  setAreaConfigEditorSource("active");
  setAreaConfigDraftId(null);
  await loadSettings();
  setBusyKey(null);
  return true;
}

export async function saveAreaConfigAction(actionState: {
  selectedArea: Area | null;
  setMessage: Dispatch<SetStateAction<string | null>>;
  areaLayoutText: string;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  selectedSportId: string;
  selectedSpecializationId: string;
  areaConfigEditorSource: "active" | "draft" | "new";
  areaConfigDraftId: string | null;
  areaInitialContext: string;
  areaResponseFormat: string;
  setAreaConfigEditorSource: Dispatch<
    SetStateAction<"active" | "draft" | "new">
  >;
  setAreaConfigDraftId: Dispatch<SetStateAction<string | null>>;
  showSuccess: (text: string) => void;
}) {
  const {
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
  } = actionState;

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
      ? (existingDrafts.find((draft) => draft.id === draftId)?.name ??
        "Bozza proposta area")
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
}
