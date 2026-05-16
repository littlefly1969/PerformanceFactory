"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ProductShell,
} from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type PromptMode = "goal" | "sport-area" | "area-config" | "training";
type Area = { id: string; name: string };
type GoalPromptConfig = {
  id?: string;
  name: string;
  basePrompt: string;
  version?: number;
  isActive: boolean;
  updatedAt?: string;
};
type AreaGenerationConfig = {
  id?: string;
  areaId: string;
  initialContext: string;
  responseFormatPrompt: string;
  questionnaireLayoutJson: unknown;
  updatedAt?: string;
  area?: Area | null;
};
type SportPrompt = {
  id?: string;
  areaId: string;
  basePrompt: string;
  isEnabledDriver: boolean;
  version?: number;
  isActive: boolean;
  updatedAt?: string;
  area?: Area | null;
};
type SportSpecialization = {
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
type SportCatalogItem = {
  id?: string;
  key: string;
  label: string;
  isActive: boolean;
  specializations: SportSpecialization[];
};
type Settings = {
  areas: Area[];
  sports: SportCatalogItem[];
  goalPromptConfig?: GoalPromptConfig | null;
  goalPromptConfigs?: GoalPromptConfig[];
  areaGenerationConfigs: AreaGenerationConfig[];
};
type ActivationTarget =
  | { kind: "goal"; prompt: GoalPromptConfig }
  | { kind: "sport-area" }
  | { kind: "training" };

const promptModes: Array<{
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

const areaDisplayName = (name?: string | null) => {
  const normalized = (name ?? "").trim().toLowerCase();
  const labels: Record<string, string> = {
    "allenamento mentale": "Mental training",
    "mental": "Mental training",
    "equipaggiamento": "Attrezzatura",
    "fisioterapia": "Fisioterapia e movimento",
    "tecnica": "Tecnico-tattica",
    "tecnico tattica": "Tecnico-tattica",
    "tecnico-tattica": "Tecnico-tattica",
    "preparazione atletica": "Preparazione atletica",
    "nutrizione": "Nutrizione",
    "attrezzatura": "Attrezzatura",
    "mental training": "Mental training",
  };
  return labels[normalized] ?? name ?? "Area";
};

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(value))
    : "-";

const emptyGoalPrompt: GoalPromptConfig = {
  name: "obiettivo",
  basePrompt: "",
  isActive: true,
};

const readError = async (response: Response) => {
  try {
    const data = (await response.json()) as { message?: string; error?: string };
    return data.message ?? data.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const stringifyJson = (value: unknown) =>
  value === null || value === undefined ? "{}" : JSON.stringify(value, null, 2);

export default function PromptManagementPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mode, setMode] = useState<PromptMode>("goal");
  const [message, setMessage] = useState<string | null>(null);
  const [successPopup, setSuccessPopup] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [promptListMode, setPromptListMode] = useState<PromptMode | null>(null);
  const [activationTarget, setActivationTarget] =
    useState<ActivationTarget | null>(null);

  const [goalDraft, setGoalDraft] =
    useState<GoalPromptConfig>(emptyGoalPrompt);
  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSpecializationId, setSelectedSpecializationId] = useState("");
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [sportAreaPrompt, setSportAreaPrompt] = useState("");
  const [sportAreaEnabled, setSportAreaEnabled] = useState(true);
  const [sportAreaActive, setSportAreaActive] = useState(true);
  const [trainingPrompt, setTrainingPrompt] = useState("");
  const [trainingActive, setTrainingActive] = useState(true);
  const [areaInitialContext, setAreaInitialContext] = useState("");
  const [areaResponseFormat, setAreaResponseFormat] = useState("");
  const [areaLayoutText, setAreaLayoutText] = useState("{}");

  const areas = settings?.areas ?? [];
  const sports = settings?.sports ?? [];
  const areaConfigs = settings?.areaGenerationConfigs ?? [];
  const goalPromptConfigs =
    settings?.goalPromptConfigs ??
    (settings?.goalPromptConfig ? [settings.goalPromptConfig] : []);

  const selectedSport = useMemo(
    () => sports.find((sport) => sport.id === selectedSportId) ?? null,
    [selectedSportId, sports],
  );
  const selectedSpecialization = useMemo(
    () =>
      selectedSport?.specializations.find(
        (specialization) => specialization.id === selectedSpecializationId,
      ) ?? null,
    [selectedSpecializationId, selectedSport],
  );
  const selectedArea = useMemo(
    () => areas.find((area) => area.id === selectedAreaId) ?? null,
    [areas, selectedAreaId],
  );
  const selectedAreaConfig = useMemo(
    () => areaConfigs.find((config) => config.areaId === selectedAreaId) ?? null,
    [areaConfigs, selectedAreaId],
  );
  const selectedSportPrompt = useMemo(
    () =>
      selectedSpecialization?.prompts.find(
        (prompt) => prompt.areaId === selectedAreaId,
      ) ?? null,
    [selectedAreaId, selectedSpecialization],
  );

  const loadSettings = async () => {
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/ai-tuning/prompt-settings`, {
      credentials: "include",
    });
    if (!response.ok) {
      setMessage(`Caricamento prompt non riuscito: ${await readError(response)}`);
      return;
    }

    const data = (await response.json()) as Settings;
    setSettings(data);
    setGoalDraft(data.goalPromptConfig ?? emptyGoalPrompt);

    const firstSport = data.sports[0];
    const firstSpecialization = firstSport?.specializations[0];
    const firstArea = data.areas[0];
    setSelectedSportId((current) => current || firstSport?.id || "");
    setSelectedSpecializationId(
      (current) => current || firstSpecialization?.id || "",
    );
    setSelectedAreaId((current) => current || firstArea?.id || "");
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    if (!selectedSport || selectedSport.specializations.length === 0) {
      setSelectedSpecializationId("");
      return;
    }
    if (
      !selectedSport.specializations.some(
        (specialization) => specialization.id === selectedSpecializationId,
      )
    ) {
      setSelectedSpecializationId(selectedSport.specializations[0]?.id ?? "");
    }
  }, [selectedSpecializationId, selectedSport]);

  useEffect(() => {
    if (selectedSportPrompt) {
      setSportAreaPrompt(selectedSportPrompt.basePrompt);
      setSportAreaEnabled(selectedSportPrompt.isEnabledDriver);
      setSportAreaActive(selectedSportPrompt.isActive);
      return;
    }
    setSportAreaPrompt("");
    setSportAreaEnabled(true);
    setSportAreaActive(true);
  }, [selectedSportPrompt]);

  useEffect(() => {
    setTrainingPrompt(selectedSpecialization?.trainingPrompt ?? "");
    setTrainingActive(selectedSpecialization?.trainingPromptActive ?? true);
  }, [selectedSpecialization]);

  useEffect(() => {
    setAreaInitialContext(selectedAreaConfig?.initialContext ?? "");
    setAreaResponseFormat(selectedAreaConfig?.responseFormatPrompt ?? "");
    setAreaLayoutText(
      stringifyJson(selectedAreaConfig?.questionnaireLayoutJson ?? {}),
    );
  }, [selectedAreaConfig]);

  useEffect(() => {
    setMessage(null);
    setSuccessPopup(null);
  }, [mode, selectedSportId, selectedSpecializationId, selectedAreaId]);

  const currentPromptText = () => {
    if (mode === "goal") {
      return goalDraft.basePrompt;
    }
    if (mode === "sport-area") {
      return sportAreaPrompt;
    }
    if (mode === "training") {
      return trainingPrompt;
    }
    return [
      "[Istruzioni di generazione]",
      areaInitialContext,
      "",
      "[Formato della proposta]",
      areaResponseFormat,
      "",
      "[Questionario di monitoraggio]",
      areaLayoutText,
    ].join("\n");
  };

  const activePromptText = () => {
    if (mode === "goal") {
      return settings?.goalPromptConfig?.basePrompt ?? "";
    }
    if (mode === "sport-area") {
      return selectedSportPrompt?.basePrompt ?? "";
    }
    if (mode === "training") {
      return selectedSpecialization?.trainingPrompt ?? "";
    }
    return [
      "[Istruzioni di generazione]",
      selectedAreaConfig?.initialContext ?? "",
      "",
      "[Formato della proposta]",
      selectedAreaConfig?.responseFormatPrompt ?? "",
      "",
      "[Questionario di monitoraggio]",
      stringifyJson(selectedAreaConfig?.questionnaireLayoutJson ?? {}),
    ].join("\n");
  };

  const currentPrompt = currentPromptText();
  const hasChanges = currentPrompt !== activePromptText();
  const canSaveDraft = hasChanges && currentPrompt.trim().length >= 10;
  const currentAreaName = areaDisplayName(selectedArea?.name);
  const currentPromptIsActive =
    mode === "goal"
      ? goalDraft.isActive && !hasChanges
      : mode === "sport-area"
        ? sportAreaActive && !hasChanges
        : mode === "training"
          ? trainingActive && !hasChanges
          : true;
  const statusLabel = hasChanges
    ? "Modifiche non salvate"
    : currentPromptIsActive
      ? "Prompt attivo"
      : "Non attivo";
  const versionLabel =
    mode === "goal"
      ? goalDraft.version
      : mode === "sport-area"
        ? selectedSportPrompt?.version
        : mode === "training"
          ? selectedSpecialization?.trainingPromptVersion
          : selectedAreaConfig
            ? 1
            : undefined;
  const updatedAt =
    mode === "goal"
      ? goalDraft.updatedAt
      : mode === "sport-area"
        ? selectedSportPrompt?.updatedAt
        : mode === "training"
          ? selectedSpecialization?.updatedAt
          : selectedAreaConfig?.updatedAt;

  const editorDescription =
    mode === "goal"
      ? "Questo prompt controlla se l'obiettivo inserito dall'atleta puo essere accettato, corretto o riformulato prima di generare il percorso di miglioramento."
      : mode === "sport-area"
        ? "Definisci come questa area deve essere interpretata nello sport e nella specializzazione selezionati."
        : mode === "area-config"
        ? "Definisci come l'AI genera la proposta operativa e il questionario di monitoraggio per l'area selezionata."
        : "Definisci come l'AI deve trasformare obiettivo, dati dell'atleta e storico in attivita pratiche di allenamento.";
  const showSuccess = (text: string) => {
    setMessage(null);
    setSuccessPopup(text);
  };

  const saveGoalPrompt = async () => {
    setBusyKey("save");
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/ai-tuning/goal-prompt`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goalDraft),
    });
    if (!response.ok) {
      setMessage(`Salvataggio non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    await loadSettings();
    showSuccess("Bozza salvata con successo.");
    setBusyKey(null);
  };

  const performActivateGoalPrompt = async (
    promptConfig: GoalPromptConfig,
    options: { forceSaveActive?: boolean } = {},
  ) => {
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
  };

  const requestActivateCurrentPrompt = () => {
    if (mode === "goal") {
      if (!currentPromptIsActive) {
        setActivationTarget({ kind: "goal", prompt: goalDraft });
      }
      return;
    }
    if (mode === "sport-area") {
      if (!currentPromptIsActive) {
        setActivationTarget({ kind: "sport-area" });
      }
      return;
    }
    if (mode === "training" && !currentPromptIsActive) {
      setActivationTarget({ kind: "training" });
    }
  };

  const requestActivateGoalPrompt = (promptConfig: GoalPromptConfig) => {
    if (!promptConfig.isActive) {
      setActivationTarget({ kind: "goal", prompt: promptConfig });
    }
  };

  const confirmActivation = async () => {
    if (!activationTarget) {
      return;
    }
    const target = activationTarget;
    let activated = false;
    if (target.kind === "goal") {
      activated = await performActivateGoalPrompt(target.prompt, {
        forceSaveActive: hasChanges,
      });
    } else if (target.kind === "sport-area") {
      setSportAreaActive(true);
      activated = true;
    } else if (target.kind === "training") {
      setTrainingActive(true);
      activated = true;
    }
    setActivationTarget(null);
    if (activated) {
      showSuccess("Prompt attivato con successo.");
    }
  };

  const saveSportPayload = async (payload: SportCatalogItem) => {
    const response = await secureFetch(`${API_BASE}/ai-tuning/sports`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(await readError(response));
    }
  };

  const saveSportAreaPrompt = async () => {
    if (!selectedSport || !selectedSpecialization || !selectedArea) {
      setMessage("Seleziona sport, specializzazione e area.");
      return;
    }
    setBusyKey("save");
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
              const existing =
                specialization.prompts.find(
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
                    isActive: sportAreaActive,
                  }
                : existing;
            }),
          };
        }),
      });
      await loadSettings();
      showSuccess("Bozza salvata con successo.");
    } catch (error) {
      setMessage(
        `Salvataggio non riuscito: ${
          error instanceof Error ? error.message : "errore sconosciuto"
        }`,
      );
    }
    setBusyKey(null);
  };

  const saveTrainingPrompt = async () => {
    if (!selectedSport || !selectedSpecialization) {
      setMessage("Seleziona sport e specializzazione.");
      return;
    }
    setBusyKey("save");
    setMessage(null);
    try {
      await saveSportPayload({
        ...selectedSport,
        specializations: selectedSport.specializations.map((specialization) =>
          specialization.id === selectedSpecialization.id
            ? {
                ...specialization,
                trainingPrompt,
                trainingPromptActive: trainingActive,
              }
            : specialization,
        ),
      });
      await loadSettings();
      showSuccess("Bozza salvata con successo.");
    } catch (error) {
      setMessage(
        `Salvataggio non riuscito: ${
          error instanceof Error ? error.message : "errore sconosciuto"
        }`,
      );
    }
    setBusyKey(null);
  };

  const saveAreaConfig = async () => {
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
      setMessage(`Salvataggio non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    await loadSettings();
    showSuccess("Bozza salvata con successo.");
    setBusyKey(null);
  };

  const saveCurrentPrompt = () => {
    if (mode === "goal") {
      return saveGoalPrompt();
    }
    if (mode === "sport-area") {
      return saveSportAreaPrompt();
    }
    if (mode === "training") {
      return saveTrainingPrompt();
    }
    return saveAreaConfig();
  };

  const saveDraft = () => {
    if (!hasChanges) {
      setMessage("Non ci sono modifiche da salvare.");
      return;
    }
    if (currentPrompt.trim().length < 10) {
      setMessage("Scrivi un prompt di almeno 10 caratteri prima di salvare la bozza.");
      return;
    }
    return saveCurrentPrompt();
  };

  const openPromptMode = (promptMode: PromptMode) => {
    setMode(promptMode);
    setPromptListMode(promptMode);
    setEditorOpen(false);
  };

  const openPromptDetail = (promptConfig?: GoalPromptConfig) => {
    if (promptConfig) {
      setGoalDraft(promptConfig);
    }
    setEditorOpen(true);
  };

  const createNewDraft = () => {
    if (mode === "goal") {
      setGoalDraft((prev) => ({
        ...prev,
        id: undefined,
        name: prev.name ? `${prev.name} bozza` : "nuova bozza",
        basePrompt: "",
        version: undefined,
        isActive: false,
        updatedAt: undefined,
      }));
    } else if (mode === "sport-area") {
      setSportAreaPrompt("");
      setSportAreaActive(false);
      setSportAreaEnabled(true);
    } else if (mode === "training") {
      setTrainingPrompt("");
      setTrainingActive(false);
    } else {
      setAreaInitialContext("");
      setAreaResponseFormat("");
      setAreaLayoutText("{}");
    }
    setPromptListMode(mode);
    setEditorOpen(true);
    showSuccess("Nuova bozza creata con successo.");
  };

  const getPromptOverview = (promptMode: PromptMode) => {
    if (promptMode === "goal") {
      return {
        title: "Validazione obiettivo",
        description:
          "Controlla obiettivo, sicurezza e coerenza prima della generazione del percorso.",
        where: "Onboarding atleta",
        version: settings?.goalPromptConfig?.version
          ? `v${settings.goalPromptConfig.version}`
          : "-",
        updatedAt: formatDate(settings?.goalPromptConfig?.updatedAt),
      };
    }
    if (promptMode === "sport-area") {
      return {
        title: "Configurazione aree performance",
        description:
          "Adatta le aree della performance allo sport, alla specializzazione e allo scenario.",
        where: "Scelta aree e driver AI",
        version: selectedSportPrompt?.version ? `v${selectedSportPrompt.version}` : "-",
        updatedAt: formatDate(selectedSportPrompt?.updatedAt),
      };
    }
    if (promptMode === "area-config") {
      return {
        title: "Generazione proposta area",
        description:
          "Definisce la proposta operativa e il questionario prodotti per ogni area.",
        where: "Generazione consigli area",
        version: selectedAreaConfig ? "v1" : "-",
        updatedAt: formatDate(selectedAreaConfig?.updatedAt),
      };
    }
    return {
      title: "Allenamento specifico",
      description:
        "Trasforma obiettivo e dati atleta in attivita pratiche, progressive e misurabili.",
      where: "Allenamento specifico atleta",
      version: selectedSpecialization?.trainingPromptVersion
        ? `v${selectedSpecialization.trainingPromptVersion}`
        : "-",
      updatedAt: formatDate(selectedSpecialization?.updatedAt),
    };
  };

  const renderPromptOverview = () => (
    <section className="pf-panel pf-prompt-current-panel">
      <div className="pf-panel-header pf-prompt-current-header">
        <div>
          <h2>Prompt in uso</h2>
          <p className="pf-muted">
            Vedi solo i prompt attualmente usati dal sistema. Aprine uno per i
            dettagli completi e le opzioni di modifica.
          </p>
        </div>
      </div>

      <div className="pf-grid pf-prompt-overview-grid">
        {promptModes.map((item) => {
          const overview = getPromptOverview(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className="pf-card pf-prompt-preview-card pf-prompt-overview-card"
              onClick={() => openPromptMode(item.id)}
            >
              <div className="pf-prompt-card-title">
                <h3>{overview.title}</h3>
              </div>
              <p>{overview.description}</p>
              <div className="pf-prompt-overview-meta">
                <span>
                  Dove viene usato
                  <strong>{overview.where}</strong>
                </span>
                <span>
                  Versione
                  <strong>{overview.version}</strong>
                </span>
                <span>
                  Ultima modifica
                  <strong>{overview.updatedAt}</strong>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );

  const renderCreatedPromptsList = () => {
    const selectedMode = promptModes.find((item) => item.id === promptListMode);
    const listTitle = selectedMode?.title ?? "Prompt";

    if (promptListMode === "goal") {
      return (
        <section className="pf-stack">
          <section className="pf-panel pf-prompt-current-panel">
            <div className="pf-panel-header pf-prompt-current-header">
              <div>
                <h2>{listTitle}</h2>
                <p className="pf-muted">
                  Lista dei prompt creati. Quello evidenziato in giallo e il
                  prompt attualmente usato dal sistema.
                </p>
              </div>
              <div className="pf-actions pf-prompt-current-actions">
                <button
                  className="pf-button"
                  type="button"
                  onClick={createNewDraft}
                >
                  Crea nuova bozza
                </button>
              </div>
            </div>

            {goalPromptConfigs.length === 0 ? (
              <EmptyState
                title="Nessun prompt creato"
                description="Crea una nuova bozza per iniziare."
              />
            ) : (
              <div className="pf-grid pf-created-prompts-grid">
                {goalPromptConfigs.map((item) => (
                  <article
                    key={item.id ?? item.name}
                    className={`pf-card pf-created-prompt-card ${
                      item.isActive ? "in-use" : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openPromptDetail(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openPromptDetail(item);
                      }
                    }}
                  >
                    {item.isActive && (
                      <span className="pf-created-prompt-badge">In uso</span>
                    )}
                    <div className="pf-prompt-card-title">
                      <h3>{item.name || "Validazione obiettivo"}</h3>
                    </div>
                    <p>
                      Prompt di validazione obiettivo per controllare chiarezza,
                      coerenza e sicurezza prima della generazione del percorso.
                    </p>
                    <div className="pf-created-prompt-footer">
                      <div className="pf-prompt-overview-meta">
                        <span>
                          Versione
                          <strong>{item.version ? `v${item.version}` : "-"}</strong>
                        </span>
                        <span>
                          Ultima modifica
                          <strong>{formatDate(item.updatedAt)}</strong>
                        </span>
                        <span>
                          Stato
                          <strong>{item.isActive ? "In uso" : "Bozza / non attivo"}</strong>
                        </span>
                      </div>
                      {!item.isActive && (
                        <div className="pf-created-prompt-actions">
                          <button
                            type="button"
                            className="pf-button-secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              openPromptDetail(item);
                            }}
                          >
                            Apri prompt
                          </button>
                          <button
                            type="button"
                            className="pf-button"
                            disabled={busyKey === `activate-${item.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              requestActivateGoalPrompt(item);
                            }}
                          >
                            {busyKey === `activate-${item.id}`
                              ? "Attivazione..."
                              : "Rendi attivo"}
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      );
    }

    return (
      <section className="pf-stack">
        <section className="pf-panel pf-prompt-current-panel">
          <div className="pf-panel-header pf-prompt-current-header">
            <div>
              <h2>{listTitle}</h2>
              <p className="pf-muted">
                Prompt configurato per il contesto selezionato. Aprilo per
                vedere i dettagli completi.
              </p>
            </div>
            <div className="pf-actions pf-prompt-current-actions">
              <button
                className="pf-button"
                type="button"
                onClick={createNewDraft}
              >
                Crea nuova bozza
              </button>
            </div>
          </div>

          <div className="pf-grid pf-created-prompts-grid">
            <button
              type="button"
              className="pf-card pf-created-prompt-card in-use"
              onClick={() => openPromptDetail()}
            >
              <span className="pf-created-prompt-badge">In uso</span>
              <div className="pf-prompt-card-title">
                <h3>{listTitle}</h3>
              </div>
              <p>{getPromptOverview(promptListMode ?? "goal").description}</p>
              <div className="pf-prompt-overview-meta">
                <span>
                  Versione
                  <strong>{versionLabel ? `v${versionLabel}` : "-"}</strong>
                </span>
                <span>
                  Ultima modifica
                  <strong>{formatDate(updatedAt)}</strong>
                </span>
                <span>
                  Stato
                  <strong>In uso</strong>
                </span>
              </div>
            </button>
          </div>
        </section>
      </section>
    );
  };

  const renderSportSelectors = (includeArea: boolean) => (
    <section className="pf-panel">
      <div className="pf-panel-header">
        <div>
          <h2>Contesto del prompt</h2>
          <p className="pf-muted">
            Seleziona sport, specializzazione e area per modificare il prompt corretto.
          </p>
        </div>
      </div>
      <div className="pf-stack">
        <div className="pf-two-col">
          <label className="pf-field">
            Sport
            <select
              className="pf-select"
              value={selectedSportId}
              onChange={(event) => setSelectedSportId(event.target.value)}
            >
              {sports.map((sport) => (
                <option key={sport.id} value={sport.id}>
                  {sport.label}
                </option>
              ))}
            </select>
          </label>
          <label className="pf-field">
            Specializzazione
            <select
              className="pf-select"
              value={selectedSpecializationId}
              onChange={(event) =>
                setSelectedSpecializationId(event.target.value)
              }
            >
              {(selectedSport?.specializations ?? []).map((specialization) => (
                <option key={specialization.id} value={specialization.id}>
                  {specialization.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {includeArea && (
          <div className="pf-grid">
            {areas.map((area) => (
              <button
                key={area.id}
                className="pf-config-row"
                type="button"
                onClick={() => setSelectedAreaId(area.id)}
                style={{
                  borderColor:
                    selectedAreaId === area.id ? "var(--pf-accent)" : undefined,
                }}
              >
                <span>
                  <strong>{areaDisplayName(area.name)}</strong>
                  <small>
                    {selectedSpecialization?.prompts.find(
                      (prompt) => prompt.areaId === area.id,
                    )?.isEnabledDriver
                      ? "Area inclusa nella valutazione"
                      : "Area esclusa dalla valutazione"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );

  const renderEditor = () => {
    if (!settings) {
      return (
        <EmptyState
          title="Caricamento prompt"
          description="Recupero configurazione da Gestione prompt."
        />
      );
    }

    if (!editorOpen) {
      if (promptListMode) {
        return renderCreatedPromptsList();
      }
      return renderPromptOverview();
    }

    return (
      <section className="pf-stack">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Dettaglio prompt</h2>
              <p className="pf-muted">{editorDescription}</p>
            </div>
          </div>

          <div className="pf-stack">
            <section className="pf-prompt-status-grid" aria-label="Stato prompt">
              <div>
                <span>Stato</span>
                <strong>{statusLabel}</strong>
              </div>
              <div>
                <span>Versione</span>
                <strong>{versionLabel ? `v${versionLabel}` : "-"}</strong>
              </div>
              <div>
                <span>Ultima modifica</span>
                <strong>{formatDate(updatedAt)}</strong>
              </div>
              {mode !== "area-config" && (
                <div className="pf-prompt-status-action">
                  <span>Attivazione</span>
                  <button
                    type="button"
                    className="pf-button-secondary"
                    disabled={
                      currentPromptIsActive || busyKey?.startsWith("activate-")
                    }
                    onClick={requestActivateCurrentPrompt}
                  >
                    {currentPromptIsActive ? "Prompt attivo" : "Rendi attivo"}
                  </button>
                </div>
              )}
            </section>

            {mode === "goal" && (
              <>
                <label className="pf-field">
                  Nome prompt
                  <input
                    className="pf-input"
                    value={goalDraft.name}
                    onChange={(event) =>
                      setGoalDraft((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="pf-field">
                  Prompt di validazione obiettivo
                  <textarea
                    className="pf-textarea pf-prompt-textarea"
                    rows={16}
                    value={goalDraft.basePrompt}
                    onChange={(event) =>
                      setGoalDraft((prev) => ({
                        ...prev,
                        basePrompt: event.target.value,
                      }))
                    }
                  />
                </label>
              </>
            )}

            {mode === "sport-area" && (
              <>
                <label className="pf-field">
                  Istruzioni per l'area: {currentAreaName}
                  <textarea
                    className="pf-textarea pf-prompt-textarea"
                    rows={18}
                    value={sportAreaPrompt}
                    onChange={(event) => setSportAreaPrompt(event.target.value)}
                  />
                </label>
                <div className="pf-actions">
                  <label className="pf-checkbox">
                    <input
                      type="checkbox"
                      checked={sportAreaEnabled}
                      onChange={(event) =>
                        setSportAreaEnabled(event.target.checked)
                      }
                    />
                    Area inclusa nella valutazione
                  </label>
                </div>
              </>
            )}

            {mode === "training" && (
              <>
                <label className="pf-field">
                  Istruzioni allenamento - {selectedSport?.label ?? "Sport"} /{" "}
                  {selectedSpecialization?.label ?? "Specializzazione"}
                  <textarea
                    className="pf-textarea pf-prompt-textarea"
                    rows={18}
                    value={trainingPrompt}
                    onChange={(event) => setTrainingPrompt(event.target.value)}
                  />
                </label>
              </>
            )}

            {mode === "area-config" && (
              <>
                <label className="pf-field">
                  Istruzioni di generazione - {currentAreaName}
                  <textarea
                    className="pf-textarea pf-prompt-textarea"
                    rows={9}
                    value={areaInitialContext}
                    onChange={(event) =>
                      setAreaInitialContext(event.target.value)
                    }
                  />
                </label>
                <label className="pf-field">
                  Formato della proposta
                  <textarea
                    className="pf-textarea pf-prompt-textarea"
                    rows={7}
                    value={areaResponseFormat}
                    onChange={(event) =>
                      setAreaResponseFormat(event.target.value)
                    }
                  />
                </label>
                <label className="pf-field">
                  Questionario di monitoraggio
                  <textarea
                    className="pf-textarea pf-mono pf-prompt-textarea"
                    rows={8}
                    value={areaLayoutText}
                    onChange={(event) => setAreaLayoutText(event.target.value)}
                  />
                </label>
              </>
            )}

            <div className="pf-form-actions">
              <button
                className="pf-button-secondary pf-save-draft-button"
                type="button"
                disabled={busyKey === "save" || !canSaveDraft}
                onClick={saveDraft}
              >
                {busyKey === "save" ? "Salvataggio..." : "Salva bozza"}
              </button>
            </div>
          </div>
        </article>
      </section>
    );
  };

  const promptBackAction = editorOpen
    ? {
        onClick: () => {
          setEditorOpen(false);
          setMessage(null);
        },
      }
    : promptListMode
      ? {
          onClick: () => {
            setPromptListMode(null);
            setMessage(null);
          },
        }
      : undefined;
  const currentHeaderOverview = getPromptOverview(mode);
  const promptListHeaderOverview = promptListMode
    ? getPromptOverview(promptListMode)
    : null;
  const pageHeader = editorOpen
    ? {
        eyebrow: "DETTAGLIO PROMPT",
        title: currentHeaderOverview.title,
        description: editorDescription,
      }
    : promptListHeaderOverview
      ? {
          eyebrow: "LISTA PROMPT",
          title: promptListHeaderOverview.title,
          description:
            promptListMode === "goal"
              ? "Lista dei prompt creati. Aprine uno per vedere dettagli, modifiche e attivazione."
              : "Prompt configurato per il contesto selezionato. Aprilo per vedere i dettagli completi.",
        }
      : {
          eyebrow: "GESTIONE PROMPT",
          title: "Prompt",
          description: "Scegli prompt, contesto, modifica e salva la bozza.",
        };

  return (
    <ProductShell
      eyebrow={pageHeader.eyebrow}
      title={pageHeader.title}
      description={pageHeader.description}
      actions={
        <button className="pf-button-secondary" type="button" onClick={loadSettings}>
          Aggiorna
        </button>
      }
      backAction={promptBackAction}
    >
      <div className="pf-prompt-management">
        {message && <div className="pf-alert warning">{message}</div>}
        {editorOpen && mode === "sport-area" && renderSportSelectors(true)}
        {editorOpen && mode === "training" && renderSportSelectors(false)}
        {editorOpen && mode === "area-config" && renderSportSelectors(true)}
        {renderEditor()}
        {activationTarget && (
          <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
            <section className="pf-modal pf-confirm-modal">
              <div className="pf-panel-header">
                <div>
                  <h2>Attivare prompt?</h2>
                  <p className="pf-muted">
                    Sei sicuro di voler attivare? Il prompt verra attivato per
                    tutti gli utenti.
                  </p>
                </div>
              </div>
              <div className="pf-form-actions">
                <button
                  type="button"
                  className="pf-button"
                  disabled={busyKey?.startsWith("activate-")}
                  onClick={confirmActivation}
                >
                  {busyKey?.startsWith("activate-")
                    ? "Attivazione..."
                    : "Conferma"}
                </button>
                <button
                  type="button"
                  className="pf-button-secondary"
                  disabled={busyKey?.startsWith("activate-")}
                  onClick={() => setActivationTarget(null)}
                >
                  Annulla
                </button>
              </div>
            </section>
          </div>
        )}
        {successPopup && (
          <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
            <section className="pf-modal pf-confirm-modal">
              <div className="pf-panel-header">
                <div>
                  <h2>Azione completata</h2>
                  <p className="pf-muted">{successPopup}</p>
                </div>
              </div>
              <div className="pf-form-actions">
                <button
                  type="button"
                  className="pf-button"
                  onClick={() => setSuccessPopup(null)}
                >
                  OK
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </ProductShell>
  );
}
