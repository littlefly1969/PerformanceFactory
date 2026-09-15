import type { Dispatch, SetStateAction } from "react";
import {
  makeHistoryDraftId,
  readStoredTrainingDrafts,
  removeStoredDraft,
  trainingDraftKey,
  trainingDraftsKey,
  writeStoredDraft,
  writeStoredTrainingDrafts,
} from "./prompt-draft-storage";
import {
  type SportCatalogItem,
  type SportSpecialization,
  type StoredTrainingDraft,
} from "./prompt-model";
export async function activateTrainingPromptAction(actionState: {
  selectedSport: SportCatalogItem | null;
  selectedSpecialization: SportSpecialization | null;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  saveSportPayload: (payload: SportCatalogItem) => Promise<void>;
  trainingPrompt: string;
  trainingDraftId: string | null;
  setTrainingActive: Dispatch<SetStateAction<boolean>>;
  setTrainingEditorSource: Dispatch<SetStateAction<"active" | "draft" | "new">>;
  setTrainingDraftId: Dispatch<SetStateAction<string | null>>;
  loadSettings: () => Promise<void>;
}) {
  const {
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
  } = actionState;

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
        preservedActiveDrafts.filter((draft) => draft.id !== trainingDraftId),
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
}

export async function saveTrainingPromptAction(actionState: {
  selectedSport: SportCatalogItem | null;
  selectedSpecialization: SportSpecialization | null;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  trainingEditorSource: "active" | "draft" | "new";
  trainingDraftId: string | null;
  trainingPrompt: string;
  setTrainingEditorSource: Dispatch<SetStateAction<"active" | "draft" | "new">>;
  setTrainingDraftId: Dispatch<SetStateAction<string | null>>;
  setTrainingActive: Dispatch<SetStateAction<boolean>>;
  showSuccess: (text: string) => void;
}) {
  const {
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
  } = actionState;

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
      ? (existingDrafts.find((draft) => draft.id === draftId)?.name ??
        "Bozza allenamento")
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
}
