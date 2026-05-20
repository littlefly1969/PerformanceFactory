"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ProductShell } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type CaseMode = "standard" | "real" | "users";
type ProviderChoice = "configured" | "stub" | "openai" | "gemini";
type Area = { id: string; name: string };
type Golden = {
  id: string;
  label: string;
  description?: string | null;
  athleteLevel?: string | null;
  area?: Area;
  contextJson?: unknown;
};
type GoalPromptConfig = {
  id?: string;
  name?: string;
  basePrompt: string;
  version?: number;
  isActive?: boolean;
};
type AreaGenerationConfig = {
  areaId: string;
  initialContext: string;
  responseFormatPrompt: string;
  questionnaireLayoutJson: unknown;
};
type SportPrompt = {
  areaId: string;
  basePrompt: string;
  isEnabledDriver: boolean;
  isActive: boolean;
};
type SportSpecialization = {
  id?: string;
  label?: string;
  trainingPrompt?: string | null;
  trainingPromptActive: boolean;
  isActive: boolean;
  prompts: SportPrompt[];
};
type SportCatalogItem = {
  id?: string;
  label?: string;
  isActive: boolean;
  specializations: SportSpecialization[];
};
type OnboardingTemplate = {
  id: string;
  key: string;
  scope: "GENERAL" | "AREA";
  label: string;
  helpText?: string | null;
  inputType: "TEXT" | "NUMBER" | "SELECT" | "SCORE";
  optionsJson?: unknown;
  required: boolean;
  orderIndex: number;
  isActive: boolean;
};
type PromptSettings = {
  goalPromptConfig?: GoalPromptConfig | null;
  goalPromptConfigs?: GoalPromptConfig[];
  areaGenerationConfigs: AreaGenerationConfig[];
  sports: SportCatalogItem[];
  onboardingTemplates?: OnboardingTemplate[];
};
type AuditRow = {
  id: string;
  athleteLabel: string;
  createdAt: string;
  provider: string;
  model?: string;
  area: Area | null;
};
type TestResult = {
  provider: string;
  model: string;
  outputText: string;
  latencyMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
};
type TestRunSnapshot = {
  promptName: string;
  promptText: string;
  version: string;
  provider: ProviderChoice;
  caseLabel: string;
  areaName: string | null;
  athleteLevel: string | null;
  context: string;
};
type TestRunHistoryItem = {
  id: string;
  goldenId: string;
  createdAt: string;
  snapshot: TestRunSnapshot;
  result: TestResult;
};
type SimulationChatMessage = {
  role: "assistant" | "user";
  content: string;
};
type AnamnesisTestUser = {
  id: string;
  label: string;
  answers: Record<string, string | number>;
  createdAt: string;
  updatedAt: string;
};
type SimulationSpecialistQuestion = {
  id: string;
  area: string | null;
  text: string;
};
type SimulationSpecialistQuestionsPayload = {
  areaQuestions?: Array<{
    areaId?: string;
    areaName?: string;
    questions?: Array<{ text?: string; orderIndex?: number }>;
  }>;
};
type SimulationPhaseId =
  | "prompt-choice"
  | "anamnesis"
  | "goal"
  | "area-questions"
  | "area-proposal"
  | "training";

const promptOptions = [
  "Validazione obiettivo",
  "Configurazione aree performance",
  "Generazione proposta area",
  "Allenamento specifico",
];
const simulationPhases: Array<{
  id: SimulationPhaseId;
  title: string;
  promptName: string | null;
  description: string;
}> = [
  {
    id: "prompt-choice",
    title: "Prompt da testare",
    promptName: null,
    description: "Scegli quale prompt vuoi testare per avviare il flusso corretto.",
  },
  {
    id: "anamnesis",
    title: "Utente e anamnesi",
    promptName: null,
    description: "Scegli un utente test salvato oppure compila manualmente l'anamnesi.",
  },
  {
    id: "goal",
    title: "Obiettivo",
    promptName: null,
    description: "Inserisci l'obiettivo come farebbe l'utente nel flusso reale.",
  },
  {
    id: "area-questions",
    title: "Domande AI",
    promptName: "Configurazione aree performance",
    description: "Genera le domande SCORE reali e rispondi con scala 1-5 come nel flusso utente.",
  },
  {
    id: "area-proposal",
    title: "Test prompt obiettivo",
    promptName: "Validazione obiettivo",
    description: "Scegli il prompt obiettivo e testalo con i dati raccolti.",
  },
  {
    id: "training",
    title: "Fasi successive",
    promptName: "Allenamento specifico",
    description: "Spazio per estendere la simulazione ai prompt successivi.",
  },
];
const testHistoryStorageKey = "pf-ai-tuner-standard-test-history-v1";
const anamnesisTestUsersStorageKey = "pf-ai-tuner-anamnesis-test-users-v1";
const specialistScoreOptions = [1, 2, 3, 4, 5];

const readError = async (response: Response) => {
  try {
    const data = (await response.json()) as { message?: string; error?: string };
    return data.message ?? data.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const parseJsonObject = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

const normalizeScoreQuestionText = (text?: string) =>
  (text ?? "")
    .replace(/\s*\((?:Scala|scala)[^)]*\)\s*/g, "")
    .replace(/\*\*/g, "")
    .trim();

const isScoreQuestionText = (text: string) =>
  /^(quanto|in che misura|quanto ritieni|quanto ti senti|quanto sei|quanto riesci|quanto spesso|quanto e|quanto è)\b/i.test(
    text,
  ) && text.includes("?");

const abbreviateTitle = (value: string, maxLength = 46) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}...` : value;

export default function TestCasesPage() {
  return (
    <Suspense fallback={null}>
      <TestCasesContent />
    </Suspense>
  );
}

function TestCasesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [goldens, setGoldens] = useState<Golden[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [promptSettings, setPromptSettings] = useState<PromptSettings | null>(
    null,
  );
  const [mode, setMode] = useState<CaseMode | null>(null);
  const [prompt, setPrompt] = useState(promptOptions[0]);
  const [version, setVersion] = useState("Versione attiva");
  const [provider, setProvider] = useState<ProviderChoice>("configured");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [runSnapshot, setRunSnapshot] = useState<TestRunSnapshot | null>(null);
  const [testHistory, setTestHistory] = useState<TestRunHistoryItem[]>([]);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [simulationPhase, setSimulationPhase] =
    useState<SimulationPhaseId>("prompt-choice");
  const [simulationPromptName, setSimulationPromptName] = useState(
    promptOptions[0],
  );
  const [simulationGoal, setSimulationGoal] = useState("");
  const [simulationAnswers, setSimulationAnswers] = useState<
    Record<string, string | number>
  >({});
  const [simulationSportId, setSimulationSportId] = useState("");
  const [simulationSpecializationId, setSimulationSpecializationId] =
    useState("");
  const [anamnesisTestUsers, setAnamnesisTestUsers] = useState<
    AnamnesisTestUser[]
  >([]);
  const [selectedAnamnesisUserId, setSelectedAnamnesisUserId] = useState("");
  const [anamnesisUserLabel, setAnamnesisUserLabel] = useState("");
  const [simulationGoalPromptId, setSimulationGoalPromptId] = useState("");
  const [simulationAiQuestionsResult, setSimulationAiQuestionsResult] =
    useState<TestResult | null>(null);
  const [simulationSpecialistScores, setSimulationSpecialistScores] = useState<
    Record<string, number>
  >({});
  const [simulationTestResult, setSimulationTestResult] =
    useState<TestResult | null>(null);
  const [simulationTestSnapshot, setSimulationTestSnapshot] =
    useState<TestRunSnapshot | null>(null);
  const [simulationDialogOpen, setSimulationDialogOpen] = useState(false);
  const [simulationChatMessages, setSimulationChatMessages] = useState<
    SimulationChatMessage[]
  >([]);
  const [simulationChatInput, setSimulationChatInput] = useState("");
  const [refiningSimulationDialog, setRefiningSimulationDialog] =
    useState(false);
  const [usersEditorOpen, setUsersEditorOpen] = useState(false);
  const queryModeParam = searchParams.get("mode");
  const currentMode: CaseMode | null =
    queryModeParam === "standard" ||
    queryModeParam === "real" ||
    queryModeParam === "users"
      ? queryModeParam
      : mode;
  const selectedCaseId =
    currentMode === "standard" ? searchParams.get("caseId") ?? "" : "";
  const activeHistoryId =
    currentMode === "standard" ? searchParams.get("historyId") ?? "" : "";

  useEffect(() => {
    const queryMode = searchParams.get("mode");
    const queryHistoryId = searchParams.get("historyId") ?? "";
    if (queryMode === "standard" || queryMode === "real" || queryMode === "users") {
      setMode(queryMode);
      if (queryMode !== "standard" || !queryHistoryId) {
        setResult(null);
        setRunSnapshot(null);
      }
      setMessage(null);
      return;
    }
    setMode(null);
    setResult(null);
    setRunSnapshot(null);
    setMessage(null);
  }, [searchParams]);

  useEffect(() => {
    const load = async () => {
      const [goldensRes, auditsRes, promptSettingsRes] = await Promise.all([
        secureFetch(`${API_BASE}/ai-tuning/golden-contexts`),
        secureFetch(`${API_BASE}/ai-tuning/audits?page=1`),
        secureFetch(`${API_BASE}/ai-tuning/prompt-settings`),
      ]);
      if (goldensRes.ok) {
        const data = (await goldensRes.json()) as Golden[];
        setGoldens(data);
      }
      if (auditsRes.ok) {
        const data = (await auditsRes.json()) as { items: AuditRow[] };
        setAudits(data.items);
      }
      if (promptSettingsRes.ok) {
        setPromptSettings((await promptSettingsRes.json()) as PromptSettings);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(testHistoryStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as TestRunHistoryItem[];
      if (Array.isArray(parsed)) {
        setTestHistory(parsed);
      }
    } catch {
      setTestHistory([]);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(anamnesisTestUsersStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AnamnesisTestUser[];
      if (Array.isArray(parsed)) {
        setAnamnesisTestUsers(parsed);
      }
    } catch {
      setAnamnesisTestUsers([]);
    }
  }, []);

  useEffect(() => {
    if (!message || currentMode !== "users") return;
    const timeout = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [currentMode, message]);

  const selectedGolden = useMemo(
    () => goldens.find((item) => item.id === selectedCaseId) ?? null,
    [goldens, selectedCaseId],
  );
  const sortedTestHistory = useMemo(
    () =>
      [...testHistory].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [testHistory],
  );
  const selectedGoldenAllHistory = useMemo(
    () => sortedTestHistory.filter((item) => item.goldenId === selectedCaseId),
    [selectedCaseId, sortedTestHistory],
  );
  const activeGeneralQuestions = useMemo(
    () =>
      (promptSettings?.onboardingTemplates ?? [])
        .filter((item) => item.scope === "GENERAL" && item.isActive)
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [promptSettings?.onboardingTemplates],
  );
  const activeSports = useMemo(
    () => (promptSettings?.sports ?? []).filter((sport) => sport.isActive),
    [promptSettings?.sports],
  );
  const goalPromptConfigs = useMemo(
    () =>
      [
        ...(promptSettings?.goalPromptConfigs ?? []),
        ...(promptSettings?.goalPromptConfig
          ? [promptSettings.goalPromptConfig]
          : []),
      ].filter(
        (item, index, items) =>
          item.basePrompt?.trim() &&
          items.findIndex((candidate) => candidate.id === item.id) === index,
      ),
    [promptSettings],
  );
  const selectedSimulationGoalPrompt =
    goalPromptConfigs.find((item) => item.id === simulationGoalPromptId) ??
    goalPromptConfigs.find((item) => item.isActive) ??
    goalPromptConfigs[0] ??
    null;
  const selectedSimulationSport =
    activeSports.find((sport) => sport.id === simulationSportId) ??
    activeSports[0] ??
    null;
  const activeSimulationSpecializations = useMemo(
    () =>
      selectedSimulationSport?.specializations.filter(
        (specialization) => specialization.isActive,
      ) ?? [],
    [selectedSimulationSport],
  );
  const selectedSimulationSpecialization =
    activeSimulationSpecializations.find(
      (specialization) => specialization.id === simulationSpecializationId,
    ) ??
    activeSimulationSpecializations[0] ??
    null;
  const areaLabelById = useMemo(() => {
    const next = new Map<string, string>();
    goldens.forEach((item) => {
      if (item.area?.id && item.area.name) {
        next.set(item.area.id, item.area.name);
      }
    });
    audits.forEach((item) => {
      if (item.area?.id && item.area.name) {
        next.set(item.area.id, item.area.name);
      }
    });
    return next;
  }, [audits, goldens]);
  const pageTitle = selectedCaseId
    ? selectedGolden
      ? abbreviateTitle(selectedGolden.label)
      : "Caso test standard"
    : currentMode === "standard"
      ? "Storico test"
      : currentMode === "real"
        ? "Casi reali"
        : currentMode === "users"
          ? "Utenti test"
        : "Test su casi";
  const pageDescription = selectedCaseId
    ? "Configura ed esegui test su questo caso standard."
    : currentMode === "users"
      ? "Crea e modifica profili anamnestici riutilizzabili nei test onboarding."
      : currentMode === "standard"
        ? "Consulta i test eseguiti e avvia un nuovo test prompt."
      : "Prova i prompt su profili standard o su risposte reali gia generate dal sistema.";

  useEffect(() => {
    if (!activeHistoryId || currentMode !== "standard") return;
    const historyItem = testHistory.find((item) => item.id === activeHistoryId);
    if (!historyItem) return;
    setPrompt(historyItem.snapshot.promptName);
    setVersion(historyItem.snapshot.version);
    setProvider(historyItem.snapshot.provider);
    setRunSnapshot(historyItem.snapshot);
    setResult(historyItem.result);
    setMessage(null);
  }, [activeHistoryId, currentMode, testHistory]);

  useEffect(() => {
    if (!simulationSportId && activeSports[0]?.id) {
      setSimulationSportId(activeSports[0].id);
    }
  }, [activeSports, simulationSportId]);

  useEffect(() => {
    if (!simulationGoalPromptId && selectedSimulationGoalPrompt?.id) {
      setSimulationGoalPromptId(selectedSimulationGoalPrompt.id);
    }
  }, [selectedSimulationGoalPrompt, simulationGoalPromptId]);

  useEffect(() => {
    if (
      selectedSimulationSport &&
      !activeSimulationSpecializations.some(
        (item) => item.id === simulationSpecializationId,
      ) &&
      activeSimulationSpecializations[0]?.id
    ) {
      setSimulationSpecializationId(activeSimulationSpecializations[0].id);
    }
  }, [
    activeSimulationSpecializations,
    selectedSimulationSport,
    simulationSpecializationId,
  ]);

  const saveHistoryItem = (item: TestRunHistoryItem) => {
    setTestHistory((current) => {
      const next = [item, ...current].slice(0, 80);
      window.localStorage.setItem(testHistoryStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const removeHistoryItem = (id: string) => {
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
  };

  const openHistoryResult = (item: TestRunHistoryItem) => {
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
  };

  const resolvePromptText = (promptName = prompt) => {
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
            item.areaId === targetAreaId &&
            item.isActive &&
            item.isEnabledDriver,
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
  };

  const promptLooksLikeCaseDescription = (text: string) => {
    const normalizedPrompt = text.trim();
    const normalizedDescription = selectedGolden?.description?.trim();
    if (!normalizedPrompt || !normalizedDescription) return false;
    return normalizedPrompt === normalizedDescription;
  };

  const visiblePromptText = () => {
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
  };

  const runStandardTest = async (
    options: { keepCurrentResult?: boolean } = {},
  ) => {
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
  };

  const persistAnamnesisTestUsers = (items: AnamnesisTestUser[]) => {
    setAnamnesisTestUsers(items);
    window.localStorage.setItem(
      anamnesisTestUsersStorageKey,
      JSON.stringify(items),
    );
  };

  const applySavedAnamnesisUser = (userId: string) => {
    setSelectedAnamnesisUserId(userId);
    if (!userId) {
      setAnamnesisUserLabel("");
      setSimulationAnswers({});
      return;
    }
    const user = anamnesisTestUsers.find((item) => item.id === userId);
    if (!user) return;
    setAnamnesisUserLabel(user.label);
    setSimulationAnswers(user.answers);
    setUsersEditorOpen(true);
  };

  const startNewAnamnesisTestUser = () => {
    setSelectedAnamnesisUserId("");
    setAnamnesisUserLabel("");
    setSimulationAnswers({});
    setUsersEditorOpen(true);
    setMessage(null);
  };

  const saveAnamnesisTestUser = () => {
    const label = anamnesisUserLabel.trim();
    if (!label) {
      setMessage("Inserisci un nome per salvare l'utente anamnestico.");
      return;
    }
    const now = new Date().toISOString();
    const id =
      selectedAnamnesisUserId ||
      `anamnesis-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nextUser: AnamnesisTestUser = {
      id,
      label,
      answers: simulationAnswers,
      createdAt:
        anamnesisTestUsers.find((item) => item.id === id)?.createdAt ?? now,
      updatedAt: now,
    };
    const next = [
      nextUser,
      ...anamnesisTestUsers.filter((item) => item.id !== id),
    ].slice(0, 50);
    persistAnamnesisTestUsers(next);
    setSelectedAnamnesisUserId(id);
    setUsersEditorOpen(false);
    setMessage("Utente anamnestico salvato.");
  };

  const deleteAnamnesisTestUser = () => {
    if (!selectedAnamnesisUserId) return;
    const next = anamnesisTestUsers.filter(
      (item) => item.id !== selectedAnamnesisUserId,
    );
    persistAnamnesisTestUsers(next);
    setSelectedAnamnesisUserId("");
    setAnamnesisUserLabel("");
    setSimulationAnswers({});
    setUsersEditorOpen(false);
    setMessage("Utente anamnestico rimosso.");
  };

  const openNewSimulation = () => {
    setSimulationPhase("prompt-choice");
    setSelectedAnamnesisUserId("");
    setAnamnesisUserLabel("");
    setSimulationAnswers({});
    setSimulationGoal("");
    setSimulationAiQuestionsResult(null);
    setSimulationSpecialistScores({});
    setSimulationTestResult(null);
    setSimulationTestSnapshot(null);
    setSimulationDialogOpen(false);
    setSimulationChatMessages([]);
    setSimulationChatInput("");
    setRefiningSimulationDialog(false);
    setMessage(null);
    setSimulationOpen(true);
  };

  const normalizeQuestionOptions = (value: unknown) =>
    Array.isArray(value)
      ? value
          .map((item) => {
            if (
              typeof item === "object" &&
              item !== null &&
              "value" in item &&
              "label" in item
            ) {
              const option = item as { value: string | number; label: string };
              return option;
            }
            if (typeof item === "string" || typeof item === "number") {
              return { value: item, label: String(item) };
            }
            return null;
          })
          .filter((item): item is { value: string | number; label: string } =>
            Boolean(item),
          )
      : [];

  const simulationAnswersForContext = () =>
    activeGeneralQuestions.map((question) => ({
      questionId: question.id,
      key: question.key,
      question: question.label,
      answer: simulationAnswers[question.id] ?? null,
      required: question.required,
      inputType: question.inputType,
    }));

  const simulationSpecialistQuestions = useMemo(() => {
    const text = simulationAiQuestionsResult?.outputText ?? "";
    if (!text.trim()) return [];
    const parsed = parseJsonObject(text) as SimulationSpecialistQuestionsPayload | null;
    if (parsed?.areaQuestions?.length) {
      return parsed.areaQuestions.flatMap((area) =>
        [...(area.questions ?? [])]
          .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
          .slice(0, 3)
          .map((question, index) => ({
            id: `specialist-${area.areaId ?? area.areaName ?? "area"}-${index}`,
            area:
              area.areaName ??
              (area.areaId ? areaLabelById.get(area.areaId) ?? area.areaId : null),
            text: normalizeScoreQuestionText(question.text),
          }))
          .filter((question) => isScoreQuestionText(question.text)),
      );
    }

    const questions: SimulationSpecialistQuestion[] = [];
    const questionsByArea = new Map<string, number>();
    let currentArea: string | null = null;

    text.split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;

      const areaMatch =
        line.match(/^\d+[.)]\s*\*\*(.+?)\*\*:?\s*$/) ??
        line.match(/^\*\*(.+?)\*\*:?\s*$/);
      if (areaMatch?.[1]) {
        currentArea = areaMatch[1].replace(/:$/, "").trim();
        return;
      }

      const numberedHeadingMatch = line.match(/^\d+[.)]\s+(.+?)\s*:?\s*$/);
      if (numberedHeadingMatch?.[1] && !line.includes("?")) {
        currentArea = numberedHeadingMatch[1].replace(/\*\*/g, "").trim();
        return;
      }

      const questionMatch =
        line.match(/^[-*•]\s+(.+)/) ?? line.match(/^\d+[.)]\s+(.+)/);
      const questionText = normalizeScoreQuestionText(
        (questionMatch?.[1] ?? line).replace(/^\d+[.)]\s*/, "").trim(),
      );
      if (!questionMatch || !isScoreQuestionText(questionText)) return;

      const areaKey = currentArea ?? "Domande";
      const areaCount = questionsByArea.get(areaKey) ?? 0;
      if (areaCount >= 3) return;
      questionsByArea.set(areaKey, areaCount + 1);

      questions.push({
        id: `specialist-${questions.length}`,
        area: currentArea,
        text: questionText,
      });
    });

    return questions;
  }, [areaLabelById, simulationAiQuestionsResult?.outputText]);

  const simulationSpecialistAnswersForContext = () =>
    simulationSpecialistQuestions.map((question) => ({
      questionId: question.id,
      area: question.area,
      question: question.text,
      answerType: "SCORE_1_5",
      score: simulationSpecialistScores[question.id] ?? null,
    }));

  const buildSimulationContext = (
    phase: (typeof simulationPhases)[number],
    promptName: string,
  ) =>
    JSON.stringify(
      {
        tipoCaso: "Simulazione onboarding utente",
        faseOnboarding: phase.title,
        promptDaTestare: promptName,
        casoStandard: selectedGolden
          ? {
              label: selectedGolden.label,
              area: selectedGolden.area?.name ?? null,
              livelloAtleta: selectedGolden.athleteLevel ?? null,
            }
          : null,
        utenteAnamnestico: selectedAnamnesisUserId
          ? anamnesisTestUsers.find((item) => item.id === selectedAnamnesisUserId)
              ?.label
          : "Manuale",
        sport: selectedSimulationSport?.label ?? null,
        specializzazione: selectedSimulationSpecialization?.label ?? null,
        obiettivoUtente: simulationGoal.trim() || null,
        anamnesi: simulationAnswersForContext(),
        risposteDomandeAi: simulationSpecialistAnswersForContext(),
        istruzioneTest:
          "Esegui il prompt come se questi dati arrivassero dalla procedura reale dell'utente. Non inventare dati mancanti.",
      },
      null,
      2,
    );

  const runSimulationPhaseTest = async (phaseId = simulationPhase) => {
    const phase = simulationPhases.find((item) => item.id === phaseId);
    if (!phase) {
      setMessage("Fase test non disponibile.");
      return;
    }
    const phasePromptName =
      phase.id === "area-proposal" ? simulationPromptName : phase.promptName;
    if (!phasePromptName) {
      setMessage("La fase anamnesi raccoglie dati: non ha un prompt AI diretto da eseguire.");
      return;
    }
    const promptText =
      phasePromptName === "Validazione obiettivo" &&
      selectedSimulationGoalPrompt?.basePrompt
        ? selectedSimulationGoalPrompt.basePrompt.trim()
        : resolvePromptText(phasePromptName);
    if (!promptText || promptLooksLikeCaseDescription(promptText)) {
      setMessage(
        `Prompt reale non disponibile per ${phasePromptName}: controlla che sia configurato e attivo.`,
      );
      return;
    }
    if (phase.id !== "goal" && !simulationGoal.trim()) {
      setMessage("Inserisci almeno un obiettivo utente prima di testare questa fase.");
      return;
    }

    const context = buildSimulationContext(phase, phasePromptName);
    const snapshot: TestRunSnapshot = {
      promptName: phasePromptName,
      promptText,
      version,
      provider,
      caseLabel: selectedGolden
        ? `Simulazione onboarding - ${selectedGolden.label}`
        : "Simulazione onboarding",
      areaName: selectedGolden?.area?.name ?? null,
      athleteLevel: selectedGolden?.athleteLevel ?? null,
      context,
    };

    setRunning(true);
    setMessage(null);
    setSimulationTestResult(null);
    setSimulationTestSnapshot(null);
    setSimulationDialogOpen(false);
    setSimulationChatMessages([]);
    setSimulationChatInput("");
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
    setPrompt(phasePromptName);
    setSimulationTestSnapshot(snapshot);
    setSimulationTestResult(nextResult);
    setSimulationChatMessages([
      { role: "assistant", content: nextResult.outputText },
    ]);
    setSimulationChatInput("");
    setSimulationDialogOpen(true);
    saveHistoryItem({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      goldenId: selectedGolden?.id ?? "onboarding-simulation",
      createdAt: new Date().toISOString(),
      snapshot,
      result: nextResult,
    });
  };

  const generateSimulationAiQuestions = async () => {
    const phase = simulationPhases.find((item) => item.id === "area-questions");
    const promptText = resolvePromptText("Configurazione aree performance");
    if (!phase || !promptText) {
      setMessage(
        "Prompt per le domande AI non disponibile: controlla la configurazione aree performance.",
      );
      return false;
    }
    if (!simulationGoal.trim()) {
      setMessage("Inserisci l'obiettivo prima di generare le domande AI.");
      return false;
    }
    const enabledAreaPrompts =
      selectedSimulationSpecialization?.prompts.filter(
        (item) => item.isActive && item.isEnabledDriver,
      ) ?? [];
    const questionAreas = enabledAreaPrompts.map((item) => ({
      areaId: item.areaId,
      areaName: areaLabelById.get(item.areaId) ?? item.areaId,
    }));
    const context = buildSimulationContext(phase, "Configurazione aree performance");
    setRunning(true);
    setMessage(null);
    setSimulationAiQuestionsResult(null);
    setSimulationSpecialistScores({});
    const response = await secureFetch(`${API_BASE}/ai-tuning/prompt-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        prompt: [
          promptText,
          "",
          [
            "Genera le stesse domande anamnestiche specialistiche del flusso reale di validazione obiettivo.",
            "Rispondi solo con JSON valido, senza markdown e senza testo fuori JSON.",
            "Formato obbligatorio: {\"areaQuestions\":[{\"areaId\":\"...\",\"areaName\":\"...\",\"questions\":[{\"text\":\"Quanto ...?\",\"orderIndex\":1},{\"text\":\"In che misura ...?\",\"orderIndex\":2},{\"text\":\"Quanto ritieni ...?\",\"orderIndex\":3}]}]}",
            "Per ogni area genera esattamente 3 domande SCORE. La UI fara rispondere con scala 1-5.",
            "Ogni domanda deve essere rispondibile solo con un numero 1-5: usa formule come \"Quanto...\", \"In che misura...\", \"Quanto ritieni...\", \"Quanto ti senti...\".",
            "Non usare domande aperte o testuali: vietate formule come \"Quali sono\", \"Descrivi\", \"Elenca\", \"Spiega\", \"Che tipo\".",
            "Non scrivere scale, punteggi o opzioni nel testo della domanda.",
            `Aree ufficiali da usare: ${JSON.stringify(questionAreas)}.`,
          ].join("\n"),
        ].join("\n"),
        context,
      }),
    });
    setRunning(false);

    if (!response.ok) {
      setMessage(`Generazione domande non riuscita: ${await readError(response)}`);
      return false;
    }
    setSimulationAiQuestionsResult((await response.json()) as TestResult);
    setSimulationPhase("area-questions");
    return true;
  };

  const continueSimulationDialog = async () => {
    const userReply = simulationChatInput.trim();
    if (
      !userReply ||
      refiningSimulationDialog ||
      !simulationTestSnapshot ||
      !simulationTestResult
    ) {
      return;
    }

    const nextMessages: SimulationChatMessage[] = [
      ...simulationChatMessages,
      { role: "user", content: userReply },
    ];
    setSimulationChatMessages(nextMessages);
    setSimulationChatInput("");
    setRefiningSimulationDialog(true);

    const context = JSON.stringify(
      {
        simulazione: JSON.parse(simulationTestSnapshot.context),
        conversazione: nextMessages,
        richiesta:
          "Continua la conversazione come farebbe l'assistente obiettivo nel flusso utente. Usa il contesto gia raccolto, rispondi al nuovo dettaglio e chiedi solo eventuali informazioni ancora necessarie. Non generare un piano di allenamento.",
      },
      null,
      2,
    );
    const response = await secureFetch(`${API_BASE}/ai-tuning/prompt-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        prompt: simulationTestSnapshot.promptText,
        context,
      }),
    });

    if (!response.ok) {
      const errorText = await readError(response);
      setSimulationChatMessages((current) => [
        ...current,
        { role: "assistant", content: errorText },
      ]);
      setRefiningSimulationDialog(false);
      return;
    }

    const nextResult = (await response.json()) as TestResult;
    setSimulationTestResult(nextResult);
    setSimulationChatMessages((current) => [
      ...current,
      { role: "assistant", content: nextResult.outputText },
    ]);
    setRefiningSimulationDialog(false);
  };

  const goToNextSimulationStep = async () => {
    if (simulationPhase === "prompt-choice") {
      setPrompt(simulationPromptName);
      if (simulationPromptName === "Validazione obiettivo") {
        setSimulationPhase("anamnesis");
        return;
      }
      if (simulationPromptName === "Configurazione aree performance") {
        setSimulationPhase("goal");
        return;
      }
      setSimulationPhase("goal");
      return;
    }
    if (simulationPhase === "anamnesis") {
      setSimulationPhase("goal");
      return;
    }
    if (simulationPhase === "goal") {
      await generateSimulationAiQuestions();
      return;
    }
    if (simulationPhase === "area-questions") {
      const missingScores = simulationSpecialistQuestions.some(
        (question) => simulationSpecialistScores[question.id] === undefined,
      );
      if (simulationSpecialistQuestions.length > 0 && missingScores) {
        setMessage("Rispondi a tutte le domande AI con un punteggio da 0 a 5.");
        return;
      }
      setMessage(null);
      setSimulationPhase("area-proposal");
      return;
    }
    if (simulationPhase === "area-proposal") {
      await runSimulationPhaseTest("area-proposal");
    }
  };

  const renderSimulationQuestionInput = (question: OnboardingTemplate) => {
    const value = simulationAnswers[question.id] ?? "";
    if (question.inputType === "TEXT") {
      return (
        <textarea
          className="pf-textarea"
          rows={3}
          value={String(value)}
          onChange={(event) =>
            setSimulationAnswers((current) => ({
              ...current,
              [question.id]: event.target.value,
            }))
          }
        />
      );
    }
    if (question.inputType === "NUMBER") {
      return (
        <input
          className="pf-input"
          type="number"
          value={value}
          onChange={(event) =>
            setSimulationAnswers((current) => ({
              ...current,
              [question.id]: event.target.value,
            }))
          }
        />
      );
    }
    const options = normalizeQuestionOptions(question.optionsJson);
    return (
      <select
        className="pf-select"
        value={String(value)}
        onChange={(event) =>
          setSimulationAnswers((current) => ({
            ...current,
            [question.id]: event.target.value,
          }))
        }
      >
        <option value="">Seleziona</option>
        {(options.length
          ? options
          : [
              { value: 1, label: "1" },
              { value: 2, label: "2" },
              { value: 3, label: "3" },
              { value: 4, label: "4" },
              { value: 5, label: "5" },
            ]
        ).map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    );
  };

  const renderTestHistory = ({
    title,
    description,
    emptyMessage,
    items,
    showCase,
  }: {
    title: string;
    description: string;
    emptyMessage: string;
    items: TestRunHistoryItem[];
    showCase?: boolean;
  }) => (
    <section className="pf-panel pf-test-history-panel">
      <div className="pf-panel-header">
        <div>
          <h2>{title}</h2>
          <p className="pf-muted">{description}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="pf-alert warning">{emptyMessage}</div>
      ) : (
        <div className="pf-card pf-test-history-table-wrap">
          <table className="pf-table pf-test-history-table">
            <thead>
              <tr>
                <th>Data</th>
                {showCase && <th>Caso</th>}
                <th>Prompt</th>
                <th>Versione</th>
                <th>Provider / modello</th>
                <th>Tempo</th>
                <th>Token</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="pf-clickable-table-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => openHistoryResult(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openHistoryResult(item);
                    }
                  }}
                >
                  <td>{formatDate(item.createdAt)}</td>
                  {showCase && <td>{item.snapshot.caseLabel}</td>}
                  <td>{item.snapshot.promptName}</td>
                  <td>{item.snapshot.version}</td>
                  <td>
                    {item.result.provider} / {item.result.model}
                  </td>
                  <td>{item.result.latencyMs} ms</td>
                  <td>{item.result.totalTokens ?? "n/d"}</td>
                  <td>
                    <button
                      type="button"
                      className="pf-button-secondary pf-history-remove-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeHistoryItem(item.id);
                      }}
                    >
                      Rimuovi
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  const renderSimulationModal = () => {
    const currentPhase =
      simulationPhases.find((item) => item.id === simulationPhase) ??
      simulationPhases[0];
    const currentPromptText =
      simulationPhase === "area-proposal"
        ? simulationPromptName === "Validazione obiettivo"
          ? selectedSimulationGoalPrompt?.basePrompt?.trim() ?? null
          : resolvePromptText(simulationPromptName)
        : currentPhase.promptName
          ? resolvePromptText(currentPhase.promptName)
          : null;
    const nextLabel =
      simulationPhase === "prompt-choice"
        ? "Avanti"
        : simulationPhase === "anamnesis"
            ? "Avanti"
            : simulationPhase === "goal"
              ? running
                ? "Generazione..."
                : "Avanti"
              : simulationPhase === "area-questions"
                ? "Avanti"
                : simulationPhase === "area-proposal"
                  ? running
                    ? "Test in corso..."
                    : "Testa prompt obiettivo"
                  : "Avanti";

    return (
      <>
      <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
        <section className="pf-modal pf-onboarding-test-modal">
          <div className="pf-panel-header">
            <div>
              <h2>Simulazione onboarding</h2>
              <p className="pf-muted">
                Compila i dati come farebbe un utente e testa i prompt nelle
                varie fasi.
              </p>
            </div>
            <button
              className="pf-button-secondary"
              type="button"
              onClick={() => {
                setSimulationDialogOpen(false);
                setSimulationOpen(false);
              }}
            >
              Chiudi
            </button>
          </div>

          <div className="pf-onboarding-test-layout">
            <aside className="pf-onboarding-phase-list">
              {simulationPhases.slice(0, 5).map((phase) => (
                <button
                  className={`pf-onboarding-phase-button ${
                    phase.id === simulationPhase ? "active" : ""
                  }`}
                  key={phase.id}
                  type="button"
                  onClick={() => setSimulationPhase(phase.id)}
                >
                  <span>{phase.title}</span>
                  <small>{phase.promptName ?? "Raccolta dati"}</small>
                </button>
              ))}
            </aside>

            <div className="pf-onboarding-test-content">
              <section className="pf-panel">
                <div className="pf-panel-header">
                  <div>
                    <h2>{currentPhase.title}</h2>
                    <p className="pf-muted">{currentPhase.description}</p>
                  </div>
                </div>

                {simulationPhase === "prompt-choice" && (
                  <div className="pf-stack">
                    <label className="pf-field">
                      Prompt da testare
                      <select
                        className="pf-select"
                        value={simulationPromptName}
                        onChange={(event) =>
                          setSimulationPromptName(event.target.value)
                        }
                      >
                        {promptOptions.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <div className="pf-prompt-info-card">
                      <div>
                        <span>Flusso avviato</span>
                        <strong>
                          {simulationPromptName === "Validazione obiettivo"
                            ? "Anamnesi o utente test, poi obiettivo"
                            : "Contesto utente, poi prompt selezionato"}
                        </strong>
                      </div>
                      <div>
                        <span>Utenti anamnestici</span>
                        <strong>{anamnesisTestUsers.length}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {simulationPhase === "anamnesis" && (
                  <div className="pf-stack">
                    <label className="pf-field">
                      Utente test salvato
                      <select
                        className="pf-select"
                        value={selectedAnamnesisUserId}
                        onChange={(event) =>
                          applySavedAnamnesisUser(event.target.value)
                        }
                      >
                        <option value="">Compilazione manuale</option>
                        {anamnesisTestUsers.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="pf-onboarding-sim-grid">
                      <label className="pf-field">
                        Sport
                        <select
                          className="pf-select"
                          value={selectedSimulationSport?.id ?? ""}
                          onChange={(event) => {
                            setSimulationSportId(event.target.value);
                            setSimulationSpecializationId("");
                          }}
                        >
                          {activeSports.map((sport) => (
                            <option key={sport.id ?? sport.label} value={sport.id ?? ""}>
                              {sport.label ?? "Sport"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="pf-field">
                        Specializzazione
                        <select
                          className="pf-select"
                          value={selectedSimulationSpecialization?.id ?? ""}
                          onChange={(event) =>
                            setSimulationSpecializationId(event.target.value)
                          }
                        >
                          {activeSimulationSpecializations.map(
                            (specialization) => (
                              <option
                                key={
                                  specialization.id ?? specialization.label
                                }
                                value={specialization.id ?? ""}
                              >
                                {specialization.label ?? "Specializzazione"}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                    </div>

                    {activeGeneralQuestions.length === 0 ? (
                      <div className="pf-alert warning">
                        Nessuna domanda anamnesi attiva. Configurale nella
                        sezione Anamnesi.
                      </div>
                    ) : (
                      <div className="pf-onboarding-question-list">
                        {activeGeneralQuestions.map((question) => (
                          <label className="pf-field" key={question.id}>
                            {question.label}
                            {question.helpText && (
                              <span className="pf-field-hint">
                                {question.helpText}
                              </span>
                            )}
                            {renderSimulationQuestionInput(question)}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {simulationPhase === "goal" && (
                  <div className="pf-stack">
                    <label className="pf-field">
                      Obiettivo scritto dall'utente
                      <textarea
                        className="pf-textarea"
                        rows={5}
                        value={simulationGoal}
                        onChange={(event) => setSimulationGoal(event.target.value)}
                        placeholder="Esempio: Voglio preparare una mezza maratona tra 4 mesi..."
                      />
                    </label>

                    <div className="pf-prompt-info-card">
                      <div>
                        <span>Sport</span>
                        <strong>{selectedSimulationSport?.label ?? "-"}</strong>
                      </div>
                      <div>
                        <span>Specializzazione</span>
                        <strong>
                          {selectedSimulationSpecialization?.label ?? "-"}
                        </strong>
                      </div>
                      <div>
                        <span>Anamnesi</span>
                        <strong>{activeGeneralQuestions.length} domande configurate</strong>
                      </div>
                      <div>
                        <span>Utente anamnestico</span>
                        <strong>{anamnesisUserLabel.trim() || "Manuale"}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {simulationPhase === "area-questions" && (
                  <div className="pf-stack">
                    {!simulationAiQuestionsResult ? (
                      <div className="pf-alert warning">
                        Premi Avanti dallo step Obiettivo per generare le
                        domande AI.
                      </div>
                    ) : simulationSpecialistQuestions.length === 0 ? (
                      <details className="pf-panel pf-test-result-disclosure" open>
                        <summary>
                          <span>Domande proposte dall'AI</span>
                          <small>
                            {simulationAiQuestionsResult.provider} /{" "}
                            {simulationAiQuestionsResult.model}
                          </small>
                        </summary>
                        <pre className="pf-readonly-code">
                          {simulationAiQuestionsResult.outputText}
                        </pre>
                      </details>
                    ) : (
                      <div className="pf-onboarding-question-list">
                        {simulationSpecialistQuestions.map((question) => (
                          <article
                            className="pf-card pf-simulation-question-card"
                            key={question.id}
                          >
                            <div className="pf-card-top">
                              <div>
                                {question.area && <h3>{question.area}</h3>}
                                <p className="pf-muted">{question.text}</p>
                              </div>
                              {simulationSpecialistScores[question.id] !==
                                undefined && (
                                <span className="pf-badge success">OK</span>
                              )}
                            </div>
                            <div className="pf-option-grid">
                              {specialistScoreOptions.map((score) => (
                                <button
                                  className={
                                    simulationSpecialistScores[question.id] ===
                                    score
                                      ? "pf-button"
                                      : "pf-button-secondary"
                                  }
                                  key={score}
                                  type="button"
                                  onClick={() =>
                                    setSimulationSpecialistScores((current) => ({
                                      ...current,
                                      [question.id]: score,
                                    }))
                                  }
                                >
                                  {score}
                                </button>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {simulationPhase === "area-proposal" && (
                  <div className="pf-stack">
                    <div className="pf-onboarding-sim-grid">
                      {simulationPromptName === "Validazione obiettivo" ? (
                        <label className="pf-field">
                          Prompt obiettivo da usare
                          <select
                            className="pf-select"
                            value={selectedSimulationGoalPrompt?.id ?? ""}
                            onChange={(event) => {
                              setSimulationGoalPromptId(event.target.value);
                              setSimulationTestResult(null);
                              setSimulationTestSnapshot(null);
                            }}
                          >
                            {goalPromptConfigs.map((config, index) => (
                              <option
                                key={config.id ?? `goal-${index}`}
                                value={config.id ?? ""}
                              >
                                {config.name ?? "Prompt obiettivo"}{" "}
                                {config.version ? `v${config.version}` : ""}
                                {config.isActive ? " - attivo" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <div className="pf-field">
                          Prompt da testare
                          <div className="pf-readonly-field">
                            {simulationPromptName}
                          </div>
                        </div>
                      )}
                      <label className="pf-field">
                        Provider AI
                        <select
                          className="pf-select"
                          value={provider}
                          onChange={(event) => {
                            setProvider(event.target.value as ProviderChoice);
                            setSimulationTestResult(null);
                            setSimulationTestSnapshot(null);
                          }}
                        >
                          <option value="configured">Provider configurato</option>
                          <option value="stub">Stub</option>
                          <option value="gemini">Gemini</option>
                          <option value="openai">OpenAI</option>
                        </select>
                      </label>
                    </div>
                    <label className="pf-field">
                      Versione prompt
                      <select
                        className="pf-select"
                        value={version}
                        onChange={(event) => {
                          setVersion(event.target.value);
                          setSimulationTestResult(null);
                          setSimulationTestSnapshot(null);
                        }}
                      >
                        <option>Versione attiva</option>
                        <option>Bozza corrente</option>
                        <option>Versione precedente</option>
                        <option>Versione duplicata / sperimentale</option>
                      </select>
                    </label>
                    {currentPromptText ? (
                      <details className="pf-panel pf-test-result-disclosure" open>
                        <summary>
                          <span>Prompt selezionato</span>
                          <small>Testo reale che verra testato.</small>
                        </summary>
                        <pre className="pf-readonly-code">{currentPromptText}</pre>
                      </details>
                    ) : (
                      <div className="pf-alert warning">
                        Nessun prompt disponibile.
                      </div>
                    )}
                    {simulationTestResult && simulationTestSnapshot && (
                      <article className="pf-panel pf-simulation-ai-output">
                        <div className="pf-panel-header">
                          <div>
                            <h2>Risposta AI</h2>
                            <p className="pf-muted">
                              Output generato con i dati della simulazione
                              onboarding.
                            </p>
                          </div>
                          <div className="pf-form-actions">
                            <span className="pf-badge success">
                              {simulationTestResult.provider} /{" "}
                              {simulationTestResult.model}
                            </span>
                            <button
                              className="pf-button-secondary"
                              type="button"
                              onClick={() => setSimulationDialogOpen(true)}
                            >
                              Apri dialogo
                            </button>
                          </div>
                        </div>
                        <pre className="pf-readonly-code">
                          {simulationTestResult.outputText}
                        </pre>
                      </article>
                    )}
                  </div>
                )}
                {message && <div className="pf-alert warning">{message}</div>}
                <div className="pf-form-actions">
                  <button
                    className="pf-button"
                    type="button"
                    disabled={running}
                    onClick={() => goToNextSimulationStep()}
                  >
                    {nextLabel}
                  </button>
                  {simulationPhase !== "prompt-choice" && (
                    <button
                      className="pf-button-secondary"
                      type="button"
                      disabled={running}
                      onClick={() =>
                        setSimulationPhase(
                          simulationPhase === "area-proposal"
                            ? "area-questions"
                            : simulationPhase === "area-questions"
                              ? "goal"
                              : simulationPhase === "goal"
                                ? simulationPromptName ===
                                  "Validazione obiettivo"
                                  ? "anamnesis"
                                  : "prompt-choice"
                                : "prompt-choice",
                        )
                      }
                    >
                      Indietro
                    </button>
                  )}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
      {simulationDialogOpen && simulationTestSnapshot && (
        <div className="pf-modal-backdrop pf-simulation-dialog-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal pf-goal-modal pf-simulation-dialog-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Dialogo utente simulato</p>
                <h2>Risposta AI</h2>
                <p className="pf-muted">
                  Continua la conversazione come farebbe l'utente se l'AI
                  richiede dettagli aggiuntivi.
                </p>
              </div>
              <button
                className="pf-button-secondary"
                type="button"
                onClick={() => setSimulationDialogOpen(false)}
              >
                Chiudi
              </button>
            </div>

            <div className="pf-goal-draft">
              <span>Obiettivo</span>
              <strong>{simulationGoal}</strong>
            </div>

            <div className="pf-goal-chat">
              {simulationChatMessages.map((item, index) => (
                <div
                  className={`pf-goal-message ${item.role}`}
                  key={`${item.role}-${index}`}
                >
                  <span>{item.role === "assistant" ? "AI" : "Tu"}</span>
                  <p>{item.content}</p>
                </div>
              ))}
            </div>

            <label className="pf-field">
              Aggiungi dettagli o rispondi all'AI
              <textarea
                className="pf-textarea"
                rows={3}
                value={simulationChatInput}
                onChange={(event) => setSimulationChatInput(event.target.value)}
                placeholder="Scrivi come farebbe l'utente, senza riscrivere tutto l'obiettivo."
              />
            </label>

            <div className="pf-actions">
              <button
                className="pf-button-secondary"
                type="button"
                disabled={refiningSimulationDialog || !simulationChatInput.trim()}
                onClick={() => void continueSimulationDialog()}
              >
                {refiningSimulationDialog ? "Analisi..." : "Invia risposta"}
              </button>
              <button
                className="pf-button"
                type="button"
                onClick={() => setSimulationDialogOpen(false)}
              >
                Conferma e chiudi
              </button>
            </div>
          </section>
        </div>
      )}
      </>
    );
  };

  return (
    <ProductShell
      eyebrow="GESTIONE AI"
      title={pageTitle}
      description={pageDescription}
    >
      <div className="pf-stack pf-test-cases" style={{ gap: 18 }}>
        {!mode && (
          <>
            <section className="pf-grid">
              <Link
                className="pf-card pf-test-case-card"
                href="/ai-tuner/test-cases?mode=standard"
              >
                <div className="pf-prompt-card-title">
                  <h3>Storico test</h3>
                </div>
                <p>Consulta i test eseguiti e avvia un nuovo caso test.</p>
              </Link>
              <Link
                className="pf-card pf-test-case-card"
                href="/ai-tuner/test-cases?mode=real"
              >
                <div className="pf-prompt-card-title">
                  <h3>Casi reali</h3>
                </div>
                <p>Consulta solo i casi reali generati dagli utenti.</p>
              </Link>
              <Link
                className="pf-card pf-test-case-card"
                href="/ai-tuner/test-cases?mode=users"
              >
                <div className="pf-prompt-card-title">
                  <h3>Utenti</h3>
                </div>
                <p>Configura profili anamnestici riutilizzabili nei test.</p>
              </Link>
            </section>

            {renderTestHistory({
              title: "Storico test",
              description:
                "Tutti i test eseguiti sui casi standard. Clicca una riga per aprire il risultato.",
              emptyMessage: "Non ci sono ancora test eseguiti.",
              items: sortedTestHistory,
              showCase: true,
            })}
          </>
        )}

        {currentMode === "standard" && !selectedCaseId && (
          <section className="pf-panel pf-standard-cases-panel">
            <div className="pf-panel-header">
              <div>
                <h2>Storico test</h2>
                <p className="pf-muted">
                  Test prompt gia eseguiti. Clicca una riga per riaprire il
                  risultato.
                </p>
              </div>
              <div className="pf-actions pf-standard-cases-create">
                <button
                  className="pf-button"
                  type="button"
                  onClick={openNewSimulation}
                >
                  Nuovo caso test
                </button>
              </div>
            </div>

            {renderTestHistory({
              title: "Test eseguiti",
              description:
                "Tutti i test prompt salvati nello storico locale di questa postazione.",
              emptyMessage: "Non ci sono ancora test eseguiti.",
              items: sortedTestHistory,
              showCase: true,
            })}
          </section>
        )}

        {currentMode === "standard" && selectedCaseId && result && runSnapshot && (
          <section className="pf-panel pf-test-result-screen">
            <div className="pf-panel-header">
              <div>
                <h2>Risultato test</h2>
                <p className="pf-muted">
                  Caso standard: {runSnapshot.caseLabel}
                </p>
              </div>
              <div className="pf-actions">
                <button
                  type="button"
                  className="pf-button"
                  disabled={running}
                  onClick={() => runStandardTest({ keepCurrentResult: true })}
                >
                  {running ? "Test in corso..." : "Riprova test"}
                </button>
                <button
                  type="button"
                  className="pf-button-secondary"
                  onClick={() => {
                    setResult(null);
                    setRunSnapshot(null);
                    setMessage(null);
                    router.replace(
                      `/ai-tuner/test-cases?mode=standard&caseId=${selectedCaseId}`,
                      { scroll: false },
                    );
                  }}
                >
                  Modifica impostazioni
                </button>
              </div>
            </div>

            {message && <div className="pf-alert warning">{message}</div>}

            <div className="pf-test-result-layout">
              <aside className="pf-panel pf-test-result-summary">
                <h2>Riepilogo test</h2>
                <div className="pf-prompt-info-card">
                  <div>
                    <span>Prompt</span>
                    <strong>{runSnapshot.promptName}</strong>
                  </div>
                  <div>
                    <span>Versione</span>
                    <strong>{runSnapshot.version}</strong>
                  </div>
                  <div>
                    <span>Provider richiesto</span>
                    <strong>{runSnapshot.provider}</strong>
                  </div>
                  <div>
                    <span>Area</span>
                    <strong>{runSnapshot.areaName ?? "Non indicata"}</strong>
                  </div>
                  <div>
                    <span>Livello atleta</span>
                    <strong>{runSnapshot.athleteLevel ?? "Non indicato"}</strong>
                  </div>
                  <div>
                    <span>Tempo risposta</span>
                    <strong>{result.latencyMs} ms</strong>
                  </div>
                </div>
              </aside>

              <section className="pf-test-result-accordion">
                <details className="pf-panel pf-test-result-disclosure" open>
                  <summary>
                    <span>Risposta AI</span>
                    <small>
                      {result.provider} / {result.model} - Token totali:{" "}
                      {result.totalTokens ?? "n/d"}
                    </small>
                  </summary>
                  <pre className="pf-readonly-code pf-ai-answer-output">
                    {result.outputText}
                  </pre>
                </details>

                <details className="pf-panel pf-test-result-disclosure">
                  <summary>
                    <span>Prompt usato per il test</span>
                    <small>Testo reale del prompt selezionato.</small>
                  </summary>
                  <pre className="pf-readonly-code">{visiblePromptText()}</pre>
                </details>

                <details className="pf-panel pf-test-result-disclosure">
                  <summary>
                    <span>Contesto del caso test</span>
                    <small>Dati del caso passati insieme al prompt.</small>
                  </summary>
                  <pre className="pf-readonly-code">{runSnapshot.context}</pre>
                </details>
              </section>
            </div>
          </section>
        )}

        {currentMode === "standard" && selectedCaseId && !result && (
          <section className="pf-panel">
            <div className="pf-panel-header">
              <div>
                <h2>Test su caso standard</h2>
                <p className="pf-muted">
                  Configura il prompt da provare sul caso selezionato.
                </p>
              </div>
              <Link
                className="pf-button-secondary"
                href="/ai-tuner/test-cases?mode=standard"
              >
                Torna ai casi standard
              </Link>
            </div>

            {!selectedGolden ? (
              <div className="pf-alert warning">
                Caso test standard non trovato.
              </div>
            ) : (
              <div className="pf-stack">
                <Link
                  className="pf-card pf-standard-case-summary"
                  href={`/ai-tuner/golden-contexts?edit=${selectedGolden.id}&returnTo=${encodeURIComponent(
                    `/ai-tuner/test-cases?mode=standard&caseId=${selectedGolden.id}`,
                  )}`}
                >
                  <h3>{selectedGolden.label}</h3>
                  <p className="pf-muted">
                    {selectedGolden.area?.name ?? "Area non indicata"} -{" "}
                    {selectedGolden.athleteLevel ?? "livello non indicato"}
                  </p>
                  {selectedGolden.description && (
                    <p>{selectedGolden.description}</p>
                  )}
                </Link>

                <section className="pf-panel pf-start-test-panel">
                  <div className="pf-panel-header">
                    <div>
                      <h2>Avvia simulazione onboarding</h2>
                      <p className="pf-muted">
                        Parti dal caso selezionato, scegli o compila l'utente
                        test e segui il flusso operativo reale.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="pf-button"
                      disabled={running}
                      onClick={openNewSimulation}
                    >
                      Inizia test
                    </button>
                  </div>
                  {message && <div className="pf-alert warning">{message}</div>}
                </section>

                {renderTestHistory({
                  title: "Storico test eseguiti",
                  description:
                    "Test eseguiti con questo caso. Clicca una riga per riaprire il risultato.",
                  emptyMessage:
                    "Non ci sono ancora test eseguiti con questo caso.",
                  items: selectedGoldenAllHistory,
                })}
              </div>
            )}
          </section>
        )}

        {currentMode === "users" && (
          <section className="pf-panel pf-test-users-panel">
            <div className="pf-panel-header">
              <div>
                <h2>Utenti test</h2>
                <p className="pf-muted">
                  Profili anamnestici salvati per precompilare il flusso
                  onboarding nei test prompt.
                </p>
              </div>
              <button
                className="pf-button"
                type="button"
                onClick={startNewAnamnesisTestUser}
              >
                Nuovo utente
              </button>
            </div>

            {message && <div className="pf-alert warning">{message}</div>}

            <div className="pf-test-users-layout">
              <section className="pf-panel">
                <div className="pf-panel-header">
                  <div>
                    <h2>Archivio utenti</h2>
                    <p className="pf-muted">
                      Profili anamnestici salvati. Apri una scheda per
                      consultarla o modificarla.
                    </p>
                  </div>
                </div>
                {anamnesisTestUsers.length === 0 ? (
                  <div className="pf-alert warning">
                    Non ci sono ancora utenti anamnestici salvati.
                  </div>
                ) : (
                  <div className="pf-test-users-list">
                    {anamnesisTestUsers.map((user) => (
                      <article
                        className="pf-card pf-test-user-card"
                        key={user.id}
                      >
                        <div>
                          <h3>{user.label}</h3>
                          <p className="pf-muted">
                            {Object.keys(user.answers).length} risposte
                            anamnestiche - Aggiornato {formatDate(user.updatedAt)}
                          </p>
                        </div>
                        <div className="pf-test-user-actions">
                          <button
                            className="pf-button-secondary"
                            type="button"
                            onClick={() => applySavedAnamnesisUser(user.id)}
                          >
                            Apri scheda
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {usersEditorOpen && (
                <section className="pf-panel">
                  <div className="pf-panel-header">
                    <div>
                      <h2>
                        {selectedAnamnesisUserId
                          ? "Modifica utente"
                          : "Nuovo utente"}
                      </h2>
                      <p className="pf-muted">
                        Qui salvi solo dati anamnestici, non sport,
                        specializzazione o JSON completo del caso test.
                      </p>
                    </div>
                  </div>

                  <div className="pf-stack">
                    <label className="pf-field">
                      Nome utente test
                      <input
                        className="pf-input"
                        value={anamnesisUserLabel}
                        onChange={(event) =>
                          setAnamnesisUserLabel(event.target.value)
                        }
                        placeholder="Es. Anamnesi runner principiante"
                      />
                    </label>

                    {activeGeneralQuestions.length === 0 ? (
                      <div className="pf-alert warning">
                        Nessuna domanda anamnesi attiva. Configurale nella
                        sezione Anamnesi.
                      </div>
                    ) : (
                      <div className="pf-onboarding-question-list">
                        {activeGeneralQuestions.map((question) => (
                          <label className="pf-field" key={question.id}>
                            {question.label}
                            {question.helpText && (
                              <span className="pf-field-hint">
                                {question.helpText}
                              </span>
                            )}
                            {renderSimulationQuestionInput(question)}
                          </label>
                        ))}
                      </div>
                    )}

                    <div className="pf-form-actions">
                      <button
                        className="pf-button"
                        type="button"
                        onClick={saveAnamnesisTestUser}
                      >
                        Salva utente
                      </button>
                      {selectedAnamnesisUserId && (
                        <button
                          className="pf-button-danger"
                          type="button"
                          onClick={deleteAnamnesisTestUser}
                        >
                          Elimina utente
                        </button>
                      )}
                      <button
                        className="pf-button-secondary"
                        type="button"
                        onClick={() => setUsersEditorOpen(false)}
                      >
                        Chiudi scheda
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </section>
        )}

        {currentMode === "real" && (
          <section className="pf-panel">
            <div className="pf-panel-header">
              <div>
                <h2>Casi reali</h2>
                <p className="pf-muted">
                  Generazioni AI prodotte dagli utenti reali della piattaforma.
                </p>
              </div>
            </div>

            {audits.length === 0 ? (
              <div className="pf-alert warning">
                Non ci sono ancora casi reali recenti.
              </div>
            ) : (
              <div className="pf-card">
                <table className="pf-table">
                  <thead>
                    <tr>
                      <th>Atleta</th>
                      <th>Area</th>
                      <th>Provider / modello</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audits.map((item) => (
                      <tr key={item.id}>
                        <td>{item.athleteLabel}</td>
                        <td>{item.area?.name ?? "senza area"}</td>
                        <td>
                          {item.provider}
                          {item.model ? ` / ${item.model}` : ""}
                        </td>
                        <td>{formatDate(item.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        {simulationOpen && renderSimulationModal()}
      </div>
    </ProductShell>
  );
}
