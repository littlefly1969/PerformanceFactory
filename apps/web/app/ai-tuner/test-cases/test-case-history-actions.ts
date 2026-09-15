import { API_BASE, secureFetch } from "@/app/lib/api";
import { useRouter } from "next/navigation";
import type { Dispatch, SetStateAction } from "react";
import {
  Golden,
  PromptSettings,
  ProviderChoice,
  SportSpecialization,
  TestResult,
  TestRunHistoryItem,
  TestRunSnapshot,
  readError,
  testHistoryStorageKey,
} from "./test-cases-model";
export function saveHistoryItemAction(
  actionState: {
    setTestHistory: Dispatch<SetStateAction<TestRunHistoryItem[]>>;
  },
  item: TestRunHistoryItem,
) {
  const { setTestHistory } = actionState;

  setTestHistory((current) => {
    const next = [item, ...current].slice(0, 80);
    window.localStorage.setItem(testHistoryStorageKey, JSON.stringify(next));
    return next;
  });
}

export function removeHistoryItemAction(
  actionState: {
    setTestHistory: Dispatch<SetStateAction<TestRunHistoryItem[]>>;
    activeHistoryId: string;
    setResult: Dispatch<SetStateAction<TestResult | null>>;
    setRunSnapshot: Dispatch<SetStateAction<TestRunSnapshot | null>>;
    router: ReturnType<typeof useRouter>;
    selectedCaseId: string;
  },
  id: string,
) {
  const {
    setTestHistory,
    activeHistoryId,
    setResult,
    setRunSnapshot,
    router,
    selectedCaseId,
  } = actionState;

  if (!window.confirm("Rimuovere questo test dallo storico?")) return;
  setTestHistory((current) => {
    const next = current.filter((item) => item.id !== id);
    window.localStorage.setItem(testHistoryStorageKey, JSON.stringify(next));
    return next;
  });
  if (activeHistoryId === id) {
    setResult(null);
    setRunSnapshot(null);
    router.replace(
      selectedCaseId
        ? `/ai-tuner/test-cases?mode=standard&caseId=${selectedCaseId}`
        : "/ai-tuner/test-cases",
      { scroll: false },
    );
  }
}

export function openHistoryResultAction(
  actionState: {
    setPrompt: Dispatch<SetStateAction<string>>;
    setVersion: Dispatch<SetStateAction<string>>;
    setProvider: Dispatch<SetStateAction<ProviderChoice>>;
    setRunSnapshot: Dispatch<SetStateAction<TestRunSnapshot | null>>;
    setResult: Dispatch<SetStateAction<TestResult | null>>;
    setMessage: Dispatch<SetStateAction<string | null>>;
    router: ReturnType<typeof useRouter>;
  },
  item: TestRunHistoryItem,
) {
  const {
    setPrompt,
    setVersion,
    setProvider,
    setRunSnapshot,
    setResult,
    setMessage,
    router,
  } = actionState;

  setPrompt(item.snapshot.promptName);
  setVersion(item.snapshot.version);
  setProvider(item.snapshot.provider);
  setRunSnapshot(item.snapshot);
  setResult(item.result);
  setMessage(null);
  router.replace(
    `/ai-tuner/test-cases?mode=standard&caseId=${item.goldenId}&historyId=${item.id}`,
    { scroll: false },
  );
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function resolvePromptTextAction(
  actionState: {
    prompt: string;
    promptSettings: PromptSettings | null;
    selectedGolden: Golden | null;
    selectedSimulationSpecialization: SportSpecialization;
    areaLabelById: Map<string, string>;
  },
  promptName: string,
) {
  const {
    promptSettings,
    selectedGolden,
    selectedSimulationSpecialization,
    areaLabelById,
  } = actionState;

  if (!promptSettings) {
    return null;
  }
  if (promptName === "Validazione obiettivo") {
    return promptSettings.goalPromptConfig?.basePrompt?.trim() || null;
  }

  if (promptName === "Generazione proposta area") {
    const areaConfig = promptSettings.areaGenerationConfigs.find(
      (item) => item.areaId === selectedGolden?.area?.id,
    );
    if (!areaConfig) {
      return null;
    }
    return [
      "[Istruzioni di generazione]",
      areaConfig.initialContext,
      "",
      "[Formato della proposta]",
      areaConfig.responseFormatPrompt,
      "",
      "[Questionario di monitoraggio]",
      JSON.stringify(areaConfig.questionnaireLayoutJson ?? {}, null, 2),
    ].join("\n");
  }

  const activeSpecializations =
    promptSettings.sports
      .filter((sport) => sport.isActive)
      .flatMap((sport) =>
        sport.specializations.filter(
          (specialization) => specialization.isActive,
        ),
      ) ?? [];

  if (promptName === "Configurazione aree performance") {
    const targetAreaId = selectedGolden?.area?.id ?? null;
    const specializationPrompts =
      selectedSimulationSpecialization?.prompts.filter(
        (item) =>
          item.isActive &&
          item.isEnabledDriver &&
          (!targetAreaId || item.areaId === targetAreaId),
      ) ?? [];
    const sportPrompt = activeSpecializations
      .flatMap((specialization) => specialization.prompts)
      .find(
        (item) =>
          item.areaId === targetAreaId && item.isActive && item.isEnabledDriver,
      );
    if (targetAreaId) {
      return sportPrompt?.basePrompt?.trim() || null;
    }
    if (specializationPrompts.length > 0) {
      return specializationPrompts
        .map((item, index) =>
          [
            `[Prompt area ${areaLabelById.get(item.areaId) ?? item.areaId ?? index + 1}]`,
            item.basePrompt.trim(),
          ].join("\n"),
        )
        .join("\n\n");
    }
    return null;
  }

  const trainingPrompt = activeSpecializations.find(
    (specialization) =>
      specialization.trainingPromptActive && specialization.trainingPrompt,
  )?.trainingPrompt;
  return trainingPrompt?.trim() || null;
}

export function promptLooksLikeCaseDescriptionAction(
  actionState: {
    selectedGolden: Golden | null;
  },
  text: string,
) {
  const { selectedGolden } = actionState;

  const normalizedPrompt = text.trim();
  const normalizedDescription = selectedGolden?.description?.trim();
  if (!normalizedPrompt || !normalizedDescription) return false;
  return normalizedPrompt === normalizedDescription;
}

export function visiblePromptTextAction(actionState: {
  runSnapshot: TestRunSnapshot | null;
  promptLooksLikeCaseDescription: (text: string) => boolean;
  resolvePromptText: (promptName?: string) => string | null;
}) {
  const { runSnapshot, promptLooksLikeCaseDescription, resolvePromptText } =
    actionState;

  if (!runSnapshot) return "";
  const storedPrompt = runSnapshot.promptText.trim();
  if (
    storedPrompt &&
    !storedPrompt.startsWith("Prompt da testare:") &&
    !promptLooksLikeCaseDescription(storedPrompt)
  ) {
    return storedPrompt;
  }
  return (
    resolvePromptText(runSnapshot.promptName) ??
    "Prompt reale non disponibile per questo risultato storico."
  );
}

export async function runStandardTestAction(
  actionState: {
    selectedGolden: Golden | null;
    setMessage: Dispatch<SetStateAction<string | null>>;
    version: string;
    resolvePromptText: (promptName?: string) => string | null;
    promptLooksLikeCaseDescription: (text: string) => boolean;
    setRunning: Dispatch<SetStateAction<boolean>>;
    setResult: Dispatch<SetStateAction<TestResult | null>>;
    setRunSnapshot: Dispatch<SetStateAction<TestRunSnapshot | null>>;
    prompt: string;
    provider: ProviderChoice;
    saveHistoryItem: (item: TestRunHistoryItem) => void;
  },
  options: { keepCurrentResult?: boolean },
) {
  const {
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
  } = actionState;

  if (!selectedGolden) {
    setMessage("Prima crea o seleziona un caso test standard.");
    return;
  }
  const context = JSON.stringify(
    {
      tipoCaso: "Caso test standard",
      caso: selectedGolden.label,
      area: selectedGolden.area?.name ?? null,
      livelloAtleta: selectedGolden.athleteLevel ?? null,
      datiSinteticiAtleta: selectedGolden.contextJson ?? {},
      versionePrompt: version,
    },
    null,
    2,
  );
  const promptText = resolvePromptText();
  if (!promptText || promptLooksLikeCaseDescription(promptText)) {
    setMessage(
      "Prompt reale non disponibile: controlla che il prompt selezionato sia configurato e attivo prima di eseguire il test.",
    );
    return;
  }
  setRunning(true);
  setMessage(null);
  if (!options.keepCurrentResult) {
    setResult(null);
    setRunSnapshot(null);
  }
  const snapshot: TestRunSnapshot = {
    promptName: prompt,
    promptText,
    version,
    provider,
    caseLabel: selectedGolden.label,
    areaName: selectedGolden.area?.name ?? null,
    athleteLevel: selectedGolden.athleteLevel ?? null,
    context,
  };

  const response = await secureFetch(`${API_BASE}/ai-tuning/prompt-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      prompt: promptText,
      context,
    }),
  });
  setRunning(false);

  if (!response.ok) {
    setMessage(`Test non riuscito: ${await readError(response)}`);
    return;
  }
  const nextResult = (await response.json()) as TestResult;
  setRunSnapshot(snapshot);
  setResult(nextResult);
  saveHistoryItem({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    goldenId: selectedGolden.id,
    createdAt: new Date().toISOString(),
    snapshot,
    result: nextResult,
  });
}
