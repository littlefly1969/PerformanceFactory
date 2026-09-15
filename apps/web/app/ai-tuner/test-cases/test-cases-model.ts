export type CaseMode = "standard" | "real" | "users";

export type ProviderChoice = "configured" | "stub" | "openai" | "gemini";

export type Area = { id: string; name: string };

export type Golden = {
  id: string;
  label: string;
  description?: string | null;
  athleteLevel?: string | null;
  area?: Area;
  contextJson?: unknown;
};

export type GoalPromptConfig = {
  id?: string;
  name?: string;
  basePrompt: string;
  version?: number;
  isActive?: boolean;
};

export type AreaGenerationConfig = {
  areaId: string;
  initialContext: string;
  responseFormatPrompt: string;
  questionnaireLayoutJson: unknown;
};

export type SportPrompt = {
  areaId: string;
  basePrompt: string;
  isEnabledDriver: boolean;
  isActive: boolean;
};

export type SportSpecialization = {
  id?: string;
  label?: string;
  trainingPrompt?: string | null;
  trainingPromptActive: boolean;
  isActive: boolean;
  prompts: SportPrompt[];
};

export type SportCatalogItem = {
  id?: string;
  label?: string;
  isActive: boolean;
  specializations: SportSpecialization[];
};

export type OnboardingTemplate = {
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

export type PromptSettings = {
  goalPromptConfig?: GoalPromptConfig | null;
  goalPromptConfigs?: GoalPromptConfig[];
  areaGenerationConfigs: AreaGenerationConfig[];
  sports: SportCatalogItem[];
  onboardingTemplates?: OnboardingTemplate[];
};

export type AuditRow = {
  id: string;
  athleteLabel: string;
  createdAt: string;
  provider: string;
  model?: string;
  area: Area | null;
};

export type TestResult = {
  provider: string;
  model: string;
  outputText: string;
  latencyMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
};

export type TestRunSnapshot = {
  promptName: string;
  promptText: string;
  version: string;
  provider: ProviderChoice;
  caseLabel: string;
  areaName: string | null;
  athleteLevel: string | null;
  context: string;
};

export type TestRunHistoryItem = {
  id: string;
  goldenId: string;
  createdAt: string;
  snapshot: TestRunSnapshot;
  result: TestResult;
};

export type SimulationChatMessage = {
  role: "assistant" | "user";
  content: string;
};

export type AnamnesisTestUser = {
  id: string;
  label: string;
  answers: Record<string, string | number>;
  createdAt: string;
  updatedAt: string;
};

export type SimulationSpecialistQuestion = {
  id: string;
  area: string | null;
  text: string;
};

export type SimulationSpecialistQuestionsPayload = {
  areaQuestions?: Array<{
    areaId?: string;
    areaName?: string;
    questions?: Array<{ text?: string; orderIndex?: number }>;
  }>;
};

export type SimulationPhaseId =
  | "prompt-choice"
  | "anamnesis"
  | "goal"
  | "area-questions"
  | "area-proposal"
  | "training";

export const promptOptions = [
  "Validazione obiettivo",
  "Configurazione aree performance",
  "Generazione proposta area",
  "Allenamento specifico",
];

export const simulationPhases: Array<{
  id: SimulationPhaseId;
  title: string;
  promptName: string | null;
  description: string;
}> = [
  {
    id: "prompt-choice",
    title: "Prompt da testare",
    promptName: null,
    description:
      "Scegli quale prompt vuoi testare per avviare il flusso corretto.",
  },
  {
    id: "anamnesis",
    title: "Utente e anamnesi",
    promptName: null,
    description:
      "Scegli un utente test salvato oppure compila manualmente l'anamnesi.",
  },
  {
    id: "goal",
    title: "Obiettivo",
    promptName: null,
    description:
      "Inserisci l'obiettivo come farebbe l'utente nel flusso reale.",
  },
  {
    id: "area-questions",
    title: "Domande AI",
    promptName: "Configurazione aree performance",
    description:
      "Genera le domande SCORE reali e rispondi con scala 1-5 come nel flusso utente.",
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

export const testHistoryStorageKey = "pf-ai-tuner-standard-test-history-v1";

export const anamnesisTestUsersStorageKey =
  "pf-ai-tuner-anamnesis-test-users-v1";

export const specialistScoreOptions = [1, 2, 3, 4, 5];

export const readError = async (response: Response) => {
  try {
    const data = (await response.json()) as {
      message?: string;
      error?: string;
    };
    return data.message ?? data.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export const parseJsonObject = (text: string): unknown => {
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

export const normalizeScoreQuestionText = (text?: string) =>
  (text ?? "")
    .replace(/\s*\((?:Scala|scala)[^)]*\)\s*/g, "")
    .replace(/\*\*/g, "")
    .trim();

export const isScoreQuestionText = (text: string) =>
  /^(quanto|in che misura|quanto ritieni|quanto ti senti|quanto sei|quanto riesci|quanto spesso|quanto e|quanto è)\b/i.test(
    text,
  ) && text.includes("?");

export const abbreviateTitle = (value: string, maxLength = 46) =>
  value.length > maxLength
    ? `${value.slice(0, maxLength - 1).trim()}...`
    : value;
