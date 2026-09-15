import { API_BASE, secureFetch } from "@/app/lib/api";
import type { Dispatch, SetStateAction } from "react";
import {
  makeHistoryDraftId,
  readStoredSportAreaDrafts,
  removeStoredDraft,
  sportAreaDraftKey,
  sportAreaDraftsKey,
  writeStoredDraft,
  writeStoredSportAreaDrafts,
} from "./prompt-draft-storage";
import { readError } from "./prompt-management-model";
import {
  areaDisplayName,
  type Area,
  type SportCatalogItem,
  type SportPrompt,
  type SportSpecialization,
  type StoredSportAreaDraft,
} from "./prompt-model";
export async function activateSportAreaPromptAction(actionState: {
  selectedSport: SportCatalogItem | null;
  selectedSpecialization: SportSpecialization | null;
  selectedArea: Area | null;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  saveSportPayload: (payload: SportCatalogItem) => Promise<void>;
  areas: Area[];
  sportAreaPrompt: string;
  sportAreaEnabled: boolean;
  selectedSportPrompt: SportPrompt | null;
  sportAreaDraftId: string | null;
  setSportAreaActive: Dispatch<SetStateAction<boolean>>;
  setSportAreaEditorSource: Dispatch<
    SetStateAction<"active" | "draft" | "new">
  >;
  setSportAreaDraftId: Dispatch<SetStateAction<string | null>>;
  loadSettings: () => Promise<void>;
}) {
  const {
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
  } = actionState;

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
            const existing = specialization.prompts.find(
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
        preservedActiveDrafts.filter((draft) => draft.id !== sportAreaDraftId),
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
}

export async function saveSportAreaPromptAction(actionState: {
  selectedSport: SportCatalogItem | null;
  selectedSpecialization: SportSpecialization | null;
  selectedArea: Area | null;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  sportAreaEditorSource: "active" | "draft" | "new";
  sportAreaDraftId: string | null;
  sportAreaPrompt: string;
  setSportAreaEditorSource: Dispatch<
    SetStateAction<"active" | "draft" | "new">
  >;
  setSportAreaDraftId: Dispatch<SetStateAction<string | null>>;
  setSportAreaActive: Dispatch<SetStateAction<boolean>>;
  showSuccess: (text: string) => void;
}) {
  const {
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
  } = actionState;

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
      ? (existingDrafts.find((draft) => draft.id === draftId)?.name ??
        "Bozza prompt")
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
}

export async function updateSportAreaEnabledAction(
  actionState: {
    selectedSport: SportCatalogItem | null;
    selectedSpecialization: SportSpecialization | null;
    setMessage: Dispatch<SetStateAction<string | null>>;
    areas: Area[];
    setBusyKey: Dispatch<SetStateAction<string | null>>;
    saveSportPayload: (payload: SportCatalogItem) => Promise<void>;
    selectedAreaId: string;
    setSportAreaEnabled: Dispatch<SetStateAction<boolean>>;
    loadSettings: () => Promise<void>;
    showSuccess: (text: string) => void;
  },
  areaId: string,
  enabled: boolean,
) {
  const {
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
  } = actionState;

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
            const existing = specialization.prompts.find(
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
}

export async function saveSportPayloadAction(
  actionState: Record<string, never>,
  payload: SportCatalogItem,
) {
  const response = await secureFetch(`${API_BASE}/ai-tuning/sports`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
}
