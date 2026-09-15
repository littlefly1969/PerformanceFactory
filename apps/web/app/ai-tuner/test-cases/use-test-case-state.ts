import { API_BASE, secureFetch } from "@/app/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AnamnesisTestUser,
  AuditRow,
  CaseMode,
  Golden,
  PromptSettings,
  ProviderChoice,
  SimulationChatMessage,
  SimulationPhaseId,
  TestResult,
  TestRunHistoryItem,
  TestRunSnapshot,
  abbreviateTitle,
  anamnesisTestUsersStorageKey,
  promptOptions,
  testHistoryStorageKey,
} from "./test-cases-model";
export function useTestCaseState() {
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
    currentMode === "standard" ? (searchParams.get("caseId") ?? "") : "";
  const activeHistoryId =
    currentMode === "standard" ? (searchParams.get("historyId") ?? "") : "";
  useEffect(() => {
    const queryMode = searchParams.get("mode");
    const queryHistoryId = searchParams.get("historyId") ?? "";
    if (
      queryMode === "standard" ||
      queryMode === "real" ||
      queryMode === "users"
    ) {
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
  return {
    router,
    searchParams,
    goldens,
    setGoldens,
    audits,
    setAudits,
    promptSettings,
    setPromptSettings,
    mode,
    setMode,
    prompt,
    setPrompt,
    version,
    setVersion,
    provider,
    setProvider,
    running,
    setRunning,
    message,
    setMessage,
    result,
    setResult,
    runSnapshot,
    setRunSnapshot,
    testHistory,
    setTestHistory,
    simulationOpen,
    setSimulationOpen,
    simulationPhase,
    setSimulationPhase,
    simulationPromptName,
    setSimulationPromptName,
    simulationGoal,
    setSimulationGoal,
    simulationAnswers,
    setSimulationAnswers,
    simulationSportId,
    setSimulationSportId,
    simulationSpecializationId,
    setSimulationSpecializationId,
    anamnesisTestUsers,
    setAnamnesisTestUsers,
    selectedAnamnesisUserId,
    setSelectedAnamnesisUserId,
    anamnesisUserLabel,
    setAnamnesisUserLabel,
    simulationGoalPromptId,
    setSimulationGoalPromptId,
    simulationAiQuestionsResult,
    setSimulationAiQuestionsResult,
    simulationSpecialistScores,
    setSimulationSpecialistScores,
    simulationTestResult,
    setSimulationTestResult,
    simulationTestSnapshot,
    setSimulationTestSnapshot,
    simulationDialogOpen,
    setSimulationDialogOpen,
    simulationChatMessages,
    setSimulationChatMessages,
    simulationChatInput,
    setSimulationChatInput,
    refiningSimulationDialog,
    setRefiningSimulationDialog,
    usersEditorOpen,
    setUsersEditorOpen,
    queryModeParam,
    currentMode,
    selectedCaseId,
    activeHistoryId,
    selectedGolden,
    sortedTestHistory,
    selectedGoldenAllHistory,
    activeGeneralQuestions,
    activeSports,
    goalPromptConfigs,
    selectedSimulationGoalPrompt,
    selectedSimulationSport,
    activeSimulationSpecializations,
    selectedSimulationSpecialization,
    areaLabelById,
    pageTitle,
    pageDescription,
  };
}
