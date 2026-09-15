import { API_BASE, secureFetch } from "@/app/lib/api";
import type { Dispatch, SetStateAction } from "react";
import { readError } from "./prompt-management-model";
import {
  type ActivationTarget,
  type GoalPromptConfig,
  type PromptMode,
} from "./prompt-model";
export async function saveGoalPromptAction(actionState: {
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  goalDraft: GoalPromptConfig;
  hasChanges: boolean;
  uniqueGoalDraftName: (baseName: string, currentId?: string) => string;
  loadSettings: () => Promise<void>;
  setGoalDraft: Dispatch<SetStateAction<GoalPromptConfig>>;
  showSuccess: (text: string) => void;
}) {
  const {
    setBusyKey,
    setMessage,
    goalDraft,
    hasChanges,
    uniqueGoalDraftName,
    loadSettings,
    setGoalDraft,
    showSuccess,
  } = actionState;

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
}

export async function performActivateGoalPromptAction(
  actionState: {
    setGoalDraft: Dispatch<SetStateAction<GoalPromptConfig>>;
    setBusyKey: Dispatch<SetStateAction<string | null>>;
    setMessage: Dispatch<SetStateAction<string | null>>;
    loadSettings: () => Promise<void>;
  },
  promptConfig: GoalPromptConfig,
  options: { forceSaveActive?: boolean },
) {
  const { setGoalDraft, setBusyKey, setMessage, loadSettings } = actionState;

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
}

export function requestActivateCurrentPromptAction(actionState: {
  mode: PromptMode;
  goalDraft: GoalPromptConfig;
  setMessage: Dispatch<SetStateAction<string | null>>;
  currentPromptIsActive: boolean;
  setActivationTarget: Dispatch<SetStateAction<ActivationTarget | null>>;
  sportAreaEditorSource: "active" | "draft" | "new";
  areaConfigEditorSource: "active" | "draft" | "new";
  trainingEditorSource: "active" | "draft" | "new";
}) {
  const {
    mode,
    goalDraft,
    setMessage,
    currentPromptIsActive,
    setActivationTarget,
    sportAreaEditorSource,
    areaConfigEditorSource,
    trainingEditorSource,
  } = actionState;

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
}

export function requestActivateGoalPromptAction(
  actionState: {
    setActivationTarget: Dispatch<SetStateAction<ActivationTarget | null>>;
  },
  promptConfig: GoalPromptConfig,
) {
  const { setActivationTarget } = actionState;

  if (!promptConfig.isActive) {
    setActivationTarget({ kind: "goal", prompt: promptConfig });
  }
}

export function uniqueGoalDraftNameAction(
  actionState: {
    goalPromptConfigs: GoalPromptConfig[];
  },
  baseName: string,
  currentId?: string | undefined,
) {
  const { goalPromptConfigs } = actionState;

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
}
