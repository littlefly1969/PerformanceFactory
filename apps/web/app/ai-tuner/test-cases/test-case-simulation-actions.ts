import { API_BASE, secureFetch } from "@/app/lib/api";
import type { Dispatch, SetStateAction } from "react";
import {
  AnamnesisTestUser,
  GoalPromptConfig,
  Golden,
  OnboardingTemplate,
  ProviderChoice,
  SimulationChatMessage,
  SimulationPhaseId,
  SportCatalogItem,
  SportSpecialization,
  TestResult,
  TestRunHistoryItem,
  TestRunSnapshot,
  readError,
  simulationPhases,
} from "./test-cases-model";
export function normalizeQuestionOptionsAction(
  actionState: Record<string, never>,
  value: unknown,
) {
  return Array.isArray(value)
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
}

export function simulationAnswersForContextAction(actionState: {
  activeGeneralQuestions: OnboardingTemplate[];
  simulationAnswers: Record<string, string | number>;
}) {
  const { activeGeneralQuestions, simulationAnswers } = actionState;
  return activeGeneralQuestions.map((question) => ({
    questionId: question.id,
    key: question.key,
    question: question.label,
    answer: simulationAnswers[question.id] ?? null,
    required: question.required,
    inputType: question.inputType,
  }));
}

export function simulationSpecialistAnswersForContextAction(actionState: {
  simulationSpecialistQuestions: {
    id: string;
    area: string | null;
    text: string;
  }[];
  simulationSpecialistScores: Record<string, number>;
}) {
  const { simulationSpecialistQuestions, simulationSpecialistScores } =
    actionState;
  return simulationSpecialistQuestions.map((question) => ({
    questionId: question.id,
    area: question.area,
    question: question.text,
    answerType: "SCORE_1_5",
    score: simulationSpecialistScores[question.id] ?? null,
  }));
}

export function buildSimulationContextAction(
  actionState: {
    selectedGolden: Golden | null;
    selectedAnamnesisUserId: string;
    anamnesisTestUsers: AnamnesisTestUser[];
    selectedSimulationSport: SportCatalogItem;
    selectedSimulationSpecialization: SportSpecialization;
    simulationGoal: string;
    simulationAnswersForContext: () => {
      questionId: string;
      key: string;
      question: string;
      answer: string | number;
      required: boolean;
      inputType: "TEXT" | "NUMBER" | "SELECT" | "SCORE";
    }[];
    simulationSpecialistAnswersForContext: () => {
      questionId: string;
      area: string | null;
      question: string;
      answerType: string;
      score: number;
    }[];
  },
  phase: {
    id: SimulationPhaseId;
    title: string;
    promptName: string | null;
    description: string;
  },
  promptName: string,
) {
  const {
    selectedGolden,
    selectedAnamnesisUserId,
    anamnesisTestUsers,
    selectedSimulationSport,
    selectedSimulationSpecialization,
    simulationGoal,
    simulationAnswersForContext,
    simulationSpecialistAnswersForContext,
  } = actionState;
  return JSON.stringify(
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
}

export async function runSimulationPhaseTestAction(
  actionState: {
    simulationPhase: SimulationPhaseId;
    setMessage: Dispatch<SetStateAction<string | null>>;
    simulationPromptName: string;
    selectedSimulationGoalPrompt: GoalPromptConfig;
    resolvePromptText: (promptName?: string) => string | null;
    promptLooksLikeCaseDescription: (text: string) => boolean;
    simulationGoal: string;
    buildSimulationContext: (
      phase: (typeof simulationPhases)[number],
      promptName: string,
    ) => string;
    version: string;
    provider: ProviderChoice;
    selectedGolden: Golden | null;
    setRunning: Dispatch<SetStateAction<boolean>>;
    setSimulationTestResult: Dispatch<SetStateAction<TestResult | null>>;
    setSimulationTestSnapshot: Dispatch<SetStateAction<TestRunSnapshot | null>>;
    setSimulationDialogOpen: Dispatch<SetStateAction<boolean>>;
    setSimulationChatMessages: Dispatch<
      SetStateAction<SimulationChatMessage[]>
    >;
    setSimulationChatInput: Dispatch<SetStateAction<string>>;
    setPrompt: Dispatch<SetStateAction<string>>;
    saveHistoryItem: (item: TestRunHistoryItem) => void;
  },
  phaseId: SimulationPhaseId,
) {
  const {
    setMessage,
    simulationPromptName,
    selectedSimulationGoalPrompt,
    resolvePromptText,
    promptLooksLikeCaseDescription,
    simulationGoal,
    buildSimulationContext,
    version,
    provider,
    selectedGolden,
    setRunning,
    setSimulationTestResult,
    setSimulationTestSnapshot,
    setSimulationDialogOpen,
    setSimulationChatMessages,
    setSimulationChatInput,
    setPrompt,
    saveHistoryItem,
  } = actionState;

  const phase = simulationPhases.find((item) => item.id === phaseId);
  if (!phase) {
    setMessage("Fase test non disponibile.");
    return;
  }
  const phasePromptName =
    phase.id === "area-proposal" ? simulationPromptName : phase.promptName;
  if (!phasePromptName) {
    setMessage(
      "La fase anamnesi raccoglie dati: non ha un prompt AI diretto da eseguire.",
    );
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
    setMessage(
      "Inserisci almeno un obiettivo utente prima di testare questa fase.",
    );
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
}

export async function generateSimulationAiQuestionsAction(actionState: {
  resolvePromptText: (promptName?: string) => string | null;
  setMessage: Dispatch<SetStateAction<string | null>>;
  simulationGoal: string;
  selectedSimulationSpecialization: SportSpecialization;
  areaLabelById: Map<string, string>;
  buildSimulationContext: (
    phase: (typeof simulationPhases)[number],
    promptName: string,
  ) => string;
  setRunning: Dispatch<SetStateAction<boolean>>;
  setSimulationAiQuestionsResult: Dispatch<SetStateAction<TestResult | null>>;
  setSimulationSpecialistScores: Dispatch<
    SetStateAction<Record<string, number>>
  >;
  provider: ProviderChoice;
  setSimulationPhase: Dispatch<SetStateAction<SimulationPhaseId>>;
}) {
  const {
    resolvePromptText,
    setMessage,
    simulationGoal,
    selectedSimulationSpecialization,
    areaLabelById,
    buildSimulationContext,
    setRunning,
    setSimulationAiQuestionsResult,
    setSimulationSpecialistScores,
    provider,
    setSimulationPhase,
  } = actionState;

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
  const context = buildSimulationContext(
    phase,
    "Configurazione aree performance",
  );
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
          'Formato obbligatorio: {"areaQuestions":[{"areaId":"...","areaName":"...","questions":[{"text":"Quanto ...?","orderIndex":1},{"text":"In che misura ...?","orderIndex":2},{"text":"Quanto ritieni ...?","orderIndex":3}]}]}',
          "Per ogni area genera esattamente 3 domande SCORE. La UI fara rispondere con scala 1-5.",
          'Ogni domanda deve essere rispondibile solo con un numero 1-5: usa formule come "Quanto...", "In che misura...", "Quanto ritieni...", "Quanto ti senti...".',
          'Non usare domande aperte o testuali: vietate formule come "Quali sono", "Descrivi", "Elenca", "Spiega", "Che tipo".',
          "Non scrivere scale, punteggi o opzioni nel testo della domanda.",
          `Aree ufficiali da usare: ${JSON.stringify(questionAreas)}.`,
        ].join("\n"),
      ].join("\n"),
      context,
    }),
  });
  setRunning(false);

  if (!response.ok) {
    setMessage(
      `Generazione domande non riuscita: ${await readError(response)}`,
    );
    return false;
  }
  setSimulationAiQuestionsResult((await response.json()) as TestResult);
  setSimulationPhase("area-questions");
  return true;
}

export async function continueSimulationDialogAction(actionState: {
  simulationChatInput: string;
  refiningSimulationDialog: boolean;
  simulationTestSnapshot: TestRunSnapshot | null;
  simulationTestResult: TestResult | null;
  simulationChatMessages: SimulationChatMessage[];
  setSimulationChatMessages: Dispatch<SetStateAction<SimulationChatMessage[]>>;
  setSimulationChatInput: Dispatch<SetStateAction<string>>;
  setRefiningSimulationDialog: Dispatch<SetStateAction<boolean>>;
  provider: ProviderChoice;
  setSimulationTestResult: Dispatch<SetStateAction<TestResult | null>>;
}) {
  const {
    simulationChatInput,
    refiningSimulationDialog,
    simulationTestSnapshot,
    simulationTestResult,
    simulationChatMessages,
    setSimulationChatMessages,
    setSimulationChatInput,
    setRefiningSimulationDialog,
    provider,
    setSimulationTestResult,
  } = actionState;

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
}

export async function goToNextSimulationStepAction(actionState: {
  simulationPhase: SimulationPhaseId;
  setPrompt: Dispatch<SetStateAction<string>>;
  simulationPromptName: string;
  setSimulationPhase: Dispatch<SetStateAction<SimulationPhaseId>>;
  generateSimulationAiQuestions: () => Promise<boolean>;
  simulationSpecialistQuestions: {
    id: string;
    area: string | null;
    text: string;
  }[];
  simulationSpecialistScores: Record<string, number>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  runSimulationPhaseTest: (phaseId?: SimulationPhaseId) => Promise<void>;
}) {
  const {
    simulationPhase,
    setPrompt,
    simulationPromptName,
    setSimulationPhase,
    generateSimulationAiQuestions,
    simulationSpecialistQuestions,
    simulationSpecialistScores,
    setMessage,
    runSimulationPhaseTest,
  } = actionState;

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
}
