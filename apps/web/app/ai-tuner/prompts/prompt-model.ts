export type PromptMode = "goal" | "sport-area" | "area-config" | "training";

export type Area = { id: string; name: string };

export type GoalPromptConfig = {
  id?: string;
  name: string;
  basePrompt: string;
  version?: number;
  isActive: boolean;
  updatedAt?: string;
};

export type AreaGenerationConfig = {
  id?: string;
  areaId: string;
  initialContext: string;
  responseFormatPrompt: string;
  questionnaireLayoutJson: unknown;
  version?: number;
  updatedAt?: string;
  area?: Area | null;
};

export type SportPrompt = {
  id?: string;
  areaId: string;
  basePrompt: string;
  isEnabledDriver: boolean;
  version?: number;
  isActive: boolean;
  updatedAt?: string;
  area?: Area | null;
};

export type SportSpecialization = {
  id?: string;
  key: string;
  label: string;
  trainingPrompt?: string | null;
  trainingPromptVersion?: number;
  trainingPromptActive: boolean;
  isActive: boolean;
  updatedAt?: string;
  prompts: SportPrompt[];
};

export type SportCatalogItem = {
  id?: string;
  key: string;
  label: string;
  isActive: boolean;
  specializations: SportSpecialization[];
};

export type StoredSportAreaDraft = {
  id: string;
  name: string;
  basePrompt: string;
  updatedAt: string;
};

export type StoredAreaConfigDraft = {
  id: string;
  name: string;
  initialContext: string;
  responseFormatPrompt: string;
  questionnaireLayoutJson: unknown;
  updatedAt: string;
};

export type StoredTrainingDraft = {
  id: string;
  name: string;
  trainingPrompt: string;
  updatedAt: string;
};

export type PromptSettings = {
  areas: Area[];
  sports: SportCatalogItem[];
  goalPromptConfig?: GoalPromptConfig | null;
  goalPromptConfigs?: GoalPromptConfig[];
  areaGenerationConfigs: AreaGenerationConfig[];
};

export type ActivationTarget =
  | { kind: "goal"; prompt: GoalPromptConfig }
  | { kind: "sport-area" }
  | { kind: "area-config" }
  | { kind: "training" };

export const promptModes: Array<{
  id: PromptMode;
  title: string;
  body: string;
}> = [
  {
    id: "goal",
    title: "Validazione obiettivo",
    body: "Controlla se l'obiettivo dell'atleta e chiaro, realistico, sicuro e coerente con il suo profilo.",
  },
  {
    id: "sport-area",
    title: "Configurazione aree performance",
    body: "Adatta ogni area della performance allo sport, alla specializzazione e allo scenario selezionato.",
  },
  {
    id: "area-config",
    title: "Generazione proposta area",
    body: "Definisce come l'AI genera consigli personalizzati per una singola area della performance.",
  },
  {
    id: "training",
    title: "Allenamento specifico",
    body: "Trasforma obiettivo e dati dell'atleta in attivita pratiche, progressive e misurabili.",
  },
];

export const emptyGoalPrompt: GoalPromptConfig = {
  name: "obiettivo",
  basePrompt: "",
  isActive: true,
};

export const allFilterValue = "__all__";

export const areaDisplayName = (name?: string | null) => {
  const normalized = (name ?? "").trim().toLowerCase();
  const labels: Record<string, string> = {
    "allenamento mentale": "Mental training",
    mental: "Mental training",
    equipaggiamento: "Attrezzatura",
    fisioterapia: "Fisioterapia e movimento",
    tecnica: "Tecnico-tattica",
    "tecnico tattica": "Tecnico-tattica",
    "tecnico-tattica": "Tecnico-tattica",
    "preparazione atletica": "Preparazione atletica",
    nutrizione: "Nutrizione",
    attrezzatura: "Attrezzatura",
    "mental training": "Mental training",
  };
  return labels[normalized] ?? name ?? "Area";
};

export const defaultSportAreaPromptText = (
  sportLabel: string,
  specializationLabel: string,
  areaName: string,
) =>
  [
    `Adatta l area ${areaName} allo scenario sportivo ${sportLabel} - ${specializationLabel}.`,
    "Usa questa scelta come vincolo prioritario quando interpreti obiettivo, anamnesi e domande specialistiche.",
    "Mantieni il lavoro specifico, pratico, misurabile, progressivo e revisionabile da un professionista.",
  ].join(" ");

export const stringifyJson = (value: unknown) =>
  value === null || value === undefined ? "{}" : JSON.stringify(value, null, 2);
