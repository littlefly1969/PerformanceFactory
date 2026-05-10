"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Area = { id: string; name: string };
type PromptConfig = {
  id?: string;
  name: string;
  basePrompt: string;
  areaId?: string | null;
  athleteLevel: string;
  version?: number;
  isActive: boolean;
  area?: Area | null;
};
type GoalPromptConfig = {
  id?: string;
  name: string;
  basePrompt: string;
  version?: number;
  isActive: boolean;
};
type AreaGenerationConfig = {
  id?: string;
  areaId: string;
  initialContext: string;
  responseFormatPrompt: string;
  questionnaireLayoutJson: unknown;
  area?: Area | null;
};
type SportOption = { key: string; label: string };
type SportAreaPromptConfig = {
  id?: string;
  sportKey: string;
  fitnessLocation: string;
  areaId: string;
  basePrompt: string;
  version?: number;
  isActive: boolean;
  area?: Area | null;
};
type OnboardingTemplate = {
  id?: string;
  key: string;
  scope: "GENERAL" | "AREA";
  areaId?: string | null;
  label: string;
  helpText?: string | null;
  inputType: "TEXT" | "NUMBER" | "SELECT" | "SCORE";
  optionsJson?: unknown;
  required: boolean;
  orderIndex: number;
  isActive: boolean;
  area?: Area | null;
};
type Settings = {
  areas: Area[];
  sportOptions: SportOption[];
  fitnessLocationOptions: SportOption[];
  levels: string[];
  promptConfigs: PromptConfig[];
  goalPromptConfig?: GoalPromptConfig | null;
  areaGenerationConfigs: AreaGenerationConfig[];
  sportAreaPromptConfigs: SportAreaPromptConfig[];
  onboardingTemplates: OnboardingTemplate[];
  inputTypes: OnboardingTemplate["inputType"][];
  scopes: OnboardingTemplate["scope"][];
};

const emptyPrompt: PromptConfig = {
  name: "",
  basePrompt: "",
  areaId: null,
  athleteLevel: "BASELINE",
  isActive: true,
};

const emptyGoalPrompt: GoalPromptConfig = {
  name: "obiettivo",
  basePrompt: "",
  isActive: true,
};

const emptyTemplate: OnboardingTemplate = {
  key: "",
  scope: "GENERAL",
  areaId: null,
  label: "",
  helpText: "",
  inputType: "TEXT",
  optionsJson: null,
  required: true,
  orderIndex: 0,
  isActive: true,
};

const emptyAreaConfig: AreaGenerationConfig = {
  areaId: "",
  initialContext: "",
  responseFormatPrompt: "",
  questionnaireLayoutJson: {},
};

const emptySportAreaPrompt: SportAreaPromptConfig = {
  sportKey: "CYCLING",
  fitnessLocation: "NONE",
  areaId: "",
  basePrompt: "",
  isActive: true,
};

const athleteLevelLabel = (level: string) =>
  ({
    BASELINE: "Base",
    STABLE: "Stabile",
    ADVANCED: "Avanzato",
  })[level] ?? level;

const inputTypeLabel = (type: OnboardingTemplate["inputType"]) =>
  ({
    TEXT: "Testo",
    NUMBER: "Numero",
    SELECT: "Selezione",
    SCORE: "Punteggio",
  })[type] ?? type;

const readError = async (response: Response) => {
  try {
    const data = (await response.json()) as { message?: string; error?: string };
    return data.message ?? data.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const stringifyOptions = (value: unknown) =>
  value === null || value === undefined ? "" : JSON.stringify(value, null, 2);

export default function AdminAiConfigPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [promptDraft, setPromptDraft] = useState<PromptConfig>(emptyPrompt);
  const [goalPromptDraft, setGoalPromptDraft] =
    useState<GoalPromptConfig>(emptyGoalPrompt);
  const [areaConfigDraft, setAreaConfigDraft] =
    useState<AreaGenerationConfig>(emptyAreaConfig);
  const [sportAreaPromptDraft, setSportAreaPromptDraft] =
    useState<SportAreaPromptConfig>(emptySportAreaPrompt);
  const [areaConfigLayoutText, setAreaConfigLayoutText] = useState("");
  const [templateDraft, setTemplateDraft] =
    useState<OnboardingTemplate>(emptyTemplate);
  const [templateOptionsText, setTemplateOptionsText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const areas = settings?.areas ?? [];
  const sportOptions = settings?.sportOptions ?? [];
  const fitnessLocationOptions = settings?.fitnessLocationOptions ?? [];
  const levels = settings?.levels ?? ["BASELINE", "STABLE", "ADVANCED"];
  const promptConfigs = settings?.promptConfigs ?? [];
  const goalPromptConfig = settings?.goalPromptConfig ?? null;
  const areaGenerationConfigs = settings?.areaGenerationConfigs ?? [];
  const sportAreaPromptConfigs = settings?.sportAreaPromptConfigs ?? [];
  const templates = settings?.onboardingTemplates ?? [];
  const activePromptCount = useMemo(
    () => promptConfigs.filter((prompt) => prompt.isActive).length,
    [promptConfigs],
  );
  const selectedPrompt = promptDraft.id
    ? promptConfigs.find((prompt) => prompt.id === promptDraft.id)
    : null;
  const promptIdentityChanged = Boolean(
    selectedPrompt &&
      (selectedPrompt.name !== promptDraft.name ||
        (selectedPrompt.areaId ?? null) !== (promptDraft.areaId ?? null) ||
        selectedPrompt.athleteLevel !== promptDraft.athleteLevel),
  );
  const promptNeedsNewName = Boolean(
    promptIdentityChanged &&
      selectedPrompt &&
      selectedPrompt.name === promptDraft.name,
  );

  const loadSettings = async () => {
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/ai-settings`, {
      credentials: "include",
    });
    if (!response.ok) {
      setMessage(`Caricamento configurazione non riuscito: ${await readError(response)}`);
      return;
    }
    const data = (await response.json()) as Settings;
    setSettings(data);
    setGoalPromptDraft(data.goalPromptConfig ?? emptyGoalPrompt);
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const savePrompt = async () => {
    setBusyKey("prompt");
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/ai-prompts`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(promptDraft),
    });
    if (!response.ok) {
      setMessage(`Salvataggio prompt non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setPromptDraft(emptyPrompt);
    await loadSettings();
    setMessage("Configurazione prompt salvata.");
    setBusyKey(null);
  };

  const saveGoalPrompt = async () => {
    setBusyKey("goal-prompt");
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/goal-prompt`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goalPromptDraft),
    });
    if (!response.ok) {
      setMessage(`Salvataggio prompt obiettivo non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    await loadSettings();
    setMessage("Prompt obiettivo salvato.");
    setBusyKey(null);
  };

  const saveTemplate = async () => {
    let optionsJson: unknown = null;
    if (templateOptionsText.trim()) {
      try {
        optionsJson = JSON.parse(templateOptionsText);
      } catch {
        setMessage("Il JSON delle opzioni non e valido.");
        return;
      }
    }

    setBusyKey("template");
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/onboarding-templates`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...templateDraft,
        areaId: templateDraft.scope === "AREA" ? templateDraft.areaId : null,
        optionsJson,
      }),
    });
    if (!response.ok) {
      setMessage(`Salvataggio domanda non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setTemplateDraft(emptyTemplate);
    setTemplateOptionsText("");
    await loadSettings();
    setMessage("Domanda onboarding salvata.");
    setBusyKey(null);
  };

  const saveAreaConfig = async () => {
    let questionnaireLayoutJson: unknown;
    try {
      questionnaireLayoutJson = JSON.parse(areaConfigLayoutText);
    } catch {
      setMessage("Il JSON del layout questionario non e valido.");
      return;
    }

    if (
      !questionnaireLayoutJson ||
      Array.isArray(questionnaireLayoutJson) ||
      typeof questionnaireLayoutJson !== "object"
    ) {
      setMessage("Il layout questionario deve essere un oggetto JSON.");
      return;
    }

    setBusyKey("area-config");
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/ai-area-configs`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...areaConfigDraft,
        questionnaireLayoutJson,
      }),
    });
    if (!response.ok) {
      setMessage(`Salvataggio configurazione AI area non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    await loadSettings();
    setMessage("Configurazione AI area salvata.");
    setBusyKey(null);
  };

  const saveSportAreaPrompt = async () => {
    setBusyKey("sport-area-prompt");
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/sport-area-prompts`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...sportAreaPromptDraft,
        fitnessLocation:
          sportAreaPromptDraft.sportKey === "FITNESS"
            ? sportAreaPromptDraft.fitnessLocation
            : null,
      }),
    });
    if (!response.ok) {
      setMessage(`Salvataggio prompt sport area non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    await loadSettings();
    setMessage("Prompt sport area salvato.");
    setBusyKey(null);
  };

  const editTemplate = (template: OnboardingTemplate) => {
    setTemplateDraft({ ...template });
    setTemplateOptionsText(stringifyOptions(template.optionsJson));
  };

  const editAreaConfig = (config: AreaGenerationConfig) => {
    setAreaConfigDraft({ ...config });
    setAreaConfigLayoutText(stringifyOptions(config.questionnaireLayoutJson));
  };

  const editSportAreaPrompt = (config: SportAreaPromptConfig) => {
    setSportAreaPromptDraft({ ...config });
  };

  const sportLabel = (config: SportAreaPromptConfig) => {
    const sport = sportOptions.find((item) => item.key === config.sportKey);
    if (config.sportKey !== "FITNESS") {
      return sport?.label ?? config.sportKey;
    }
    const fitness = fitnessLocationOptions.find(
      (item) => item.key === config.fitnessLocation,
    );
    return `${sport?.label ?? config.sportKey} - ${fitness?.label ?? config.fitnessLocation}`;
  };

  return (
    <ProductShell
      eyebrow="Amministrazione AI"
      title="Prompt e anamnesi"
      description="Configura prompt base per livello e area, e mantieni modificabili le domande generali e specifiche di onboarding."
      actions={
        <button className="pf-button-secondary" type="button" onClick={loadSettings}>
          Aggiorna
        </button>
      }
      stats={[
        { label: "Prompt obiettivo", value: goalPromptConfig ? `v${goalPromptConfig.version ?? 1}` : "-", tone: "accent" },
        {
          label: "Domande anamnesi",
          value: templates.filter((template) => template.isActive).length,
          tone: "success",
        },
        { label: "Aree", value: areas.length, tone: "neutral" },
        { label: "Prompt sport", value: sportAreaPromptConfigs.length, tone: "accent" },
      ]}
    >
      {message && <div className="pf-alert warning">{message}</div>}

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Prompt obiettivo</h2>
            <p className="pf-muted">
              Prompt usato per trasformare l obiettivo dichiarato dall atleta in
              istruzioni personalizzate per ogni area e utente.
            </p>
          </div>
          {goalPromptConfig && (
            <StatusBadge tone={goalPromptConfig.isActive ? "success" : "neutral"}>
              v{goalPromptConfig.version ?? 1}
            </StatusBadge>
          )}
        </div>
        <div className="pf-stack">
          <label className="pf-field">
            Nome
            <input
              className="pf-input"
              value={goalPromptDraft.name}
              onChange={(event) =>
                setGoalPromptDraft((prev) => ({
                  ...prev,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <label className="pf-field">
            Prompt
            <textarea
              className="pf-textarea"
              rows={7}
              value={goalPromptDraft.basePrompt}
              onChange={(event) =>
                setGoalPromptDraft((prev) => ({
                  ...prev,
                  basePrompt: event.target.value,
                }))
              }
            />
          </label>
          <label className="pf-checkbox">
            <input
              type="checkbox"
              checked={goalPromptDraft.isActive}
              onChange={(event) =>
                setGoalPromptDraft((prev) => ({
                  ...prev,
                  isActive: event.target.checked,
                }))
              }
            />
            Attivo
          </label>
          <button
            className="pf-button"
            type="button"
            disabled={busyKey === "goal-prompt"}
            onClick={saveGoalPrompt}
          >
            Salva prompt obiettivo
          </button>
        </div>
      </section>

      <section className="pf-dashboard-grid">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Prompt sport per area</h2>
              <p className="pf-muted">
                Istruzioni applicate prima della validazione obiettivo, in base
                agli sport scelti dall'atleta e all'area specialistica.
              </p>
            </div>
          </div>
          <div className="pf-stack">
            <div className="pf-two-col">
              <label className="pf-field">
                Sport
                <select
                  className="pf-select"
                  value={sportAreaPromptDraft.sportKey}
                  onChange={(event) =>
                    setSportAreaPromptDraft((prev) => ({
                      ...prev,
                      sportKey: event.target.value,
                      fitnessLocation:
                        event.target.value === "FITNESS" ? "HOME" : "NONE",
                    }))
                  }
                >
                  {sportOptions.map((sport) => (
                    <option key={sport.key} value={sport.key}>
                      {sport.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pf-field">
                Contesto fitness
                <select
                  className="pf-select"
                  value={sportAreaPromptDraft.fitnessLocation}
                  disabled={sportAreaPromptDraft.sportKey !== "FITNESS"}
                  onChange={(event) =>
                    setSportAreaPromptDraft((prev) => ({
                      ...prev,
                      fitnessLocation: event.target.value,
                    }))
                  }
                >
                  <option value="NONE">Non applicabile</option>
                  {fitnessLocationOptions.map((location) => (
                    <option key={location.key} value={location.key}>
                      {location.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="pf-field">
              Area
              <select
                className="pf-select"
                value={sportAreaPromptDraft.areaId}
                onChange={(event) => {
                  const areaId = event.target.value;
                  const existing = sportAreaPromptConfigs.find(
                    (config) =>
                      config.areaId === areaId &&
                      config.sportKey === sportAreaPromptDraft.sportKey &&
                      config.fitnessLocation === sportAreaPromptDraft.fitnessLocation,
                  );
                  if (existing) {
                    editSportAreaPrompt(existing);
                    return;
                  }
                  setSportAreaPromptDraft((prev) => ({ ...prev, areaId }));
                }}
              >
                <option value="">Seleziona area</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="pf-field">
              Prompt
              <textarea
                className="pf-textarea"
                rows={8}
                value={sportAreaPromptDraft.basePrompt}
                onChange={(event) =>
                  setSportAreaPromptDraft((prev) => ({
                    ...prev,
                    basePrompt: event.target.value,
                  }))
                }
              />
            </label>
            <label className="pf-checkbox">
              <input
                type="checkbox"
                checked={sportAreaPromptDraft.isActive}
                onChange={(event) =>
                  setSportAreaPromptDraft((prev) => ({
                    ...prev,
                    isActive: event.target.checked,
                  }))
                }
              />
              Attivo
            </label>
            <button
              className="pf-button"
              type="button"
              disabled={
                busyKey === "sport-area-prompt" ||
                !sportAreaPromptDraft.areaId ||
                !sportAreaPromptDraft.basePrompt.trim()
              }
              onClick={saveSportAreaPrompt}
            >
              Salva prompt sport area
            </button>
          </div>
        </article>

        <aside className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Prompt sport attuali</h2>
              <p className="pf-muted">
                Seleziona una configurazione per editarla.
              </p>
            </div>
          </div>
          <div className="pf-stack">
            {sportAreaPromptConfigs.map((config) => (
              <button
                key={config.id}
                className="pf-config-row"
                type="button"
                onClick={() => editSportAreaPrompt(config)}
              >
                <span>
                  <strong>{sportLabel(config)}</strong>
                  <small>
                    {config.area?.name ?? "Area"} - v{config.version ?? 1}
                  </small>
                </span>
                <StatusBadge tone={config.isActive ? "success" : "neutral"}>
                  {config.isActive ? "attivo" : "spento"}
                </StatusBadge>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="pf-dashboard-grid">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Prompt base</h2>
              <p className="pf-muted">
                Compatibilita legacy: usato solo quando l atleta non ha ancora
                prompt area personalizzati generati dall obiettivo.
              </p>
            </div>
          </div>
          <div className="pf-stack">
            <label className="pf-field">
              Nome
              <input
                className="pf-input"
                value={promptDraft.name}
                onChange={(event) =>
                  setPromptDraft((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </label>
            <div className="pf-two-col">
              <label className="pf-field">
                Area
                <select
                  className="pf-select"
                  value={promptDraft.areaId ?? ""}
                  onChange={(event) =>
                    setPromptDraft((prev) => ({
                      ...prev,
                      areaId: event.target.value || null,
                    }))
                  }
                >
                  <option value="">Globale</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pf-field">
                Livello atleta
                <select
                  className="pf-select"
                  value={promptDraft.athleteLevel}
                  onChange={(event) =>
                    setPromptDraft((prev) => ({
                      ...prev,
                      athleteLevel: event.target.value,
                    }))
                  }
                >
                  {levels.map((level) => (
                    <option key={level} value={level}>
                      {athleteLevelLabel(level)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="pf-checkbox">
              <input
                type="checkbox"
                checked={promptDraft.isActive}
                onChange={(event) =>
                  setPromptDraft((prev) => ({
                    ...prev,
                    isActive: event.target.checked,
                  }))
                }
              />
              Attivo
            </label>
            <label className="pf-field">
              Prompt
              <textarea
                className="pf-textarea"
                rows={8}
                value={promptDraft.basePrompt}
                onChange={(event) =>
                  setPromptDraft((prev) => ({
                    ...prev,
                    basePrompt: event.target.value,
                  }))
                }
              />
            </label>
            <button
              className="pf-button"
              type="button"
              disabled={busyKey === "prompt" || promptNeedsNewName}
              onClick={savePrompt}
            >
              {promptIdentityChanged ? "Crea nuovo prompt" : "Salva prompt"}
            </button>
            {promptNeedsNewName && (
              <p className="pf-muted">
                Le modifiche ad area o livello creano un nuovo prompt, quindi assegna un nuovo
                nome univoco prima di salvare.
              </p>
            )}
            {promptIdentityChanged && (
              <p className="pf-muted">
                Modificare nome, area o livello atleta crea un nuovo prompt. Il
                prompt attivo per la stessa area e livello verra sostituito.
              </p>
            )}
          </div>
        </article>

        <aside className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Prompt attuali</h2>
              <p className="pf-muted">Seleziona una configurazione per editarla.</p>
            </div>
          </div>
          <div className="pf-stack">
            {promptConfigs.map((prompt) => (
              <button
                key={prompt.id}
                className="pf-config-row"
                type="button"
                onClick={() => setPromptDraft(prompt)}
              >
                <span>
                  <strong>{prompt.name}</strong>
                  <small>
                    {prompt.area?.name ?? "Globale"} - {athleteLevelLabel(prompt.athleteLevel)} -
                    v{prompt.version ?? 1}
                  </small>
                </span>
                <StatusBadge tone={prompt.isActive ? "success" : "neutral"}>
                  {prompt.isActive ? "attivo" : "spento"}
                </StatusBadge>
              </button>
            ))}
            {!promptConfigs.length && (
              <EmptyState
                title="Nessun prompt"
                description="Crea almeno un prompt globale baseline."
              />
            )}
          </div>
        </aside>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Contesto e layout AI</h2>
            <p className="pf-muted">
              Una configurazione per area: contesto iniziale, forma della
              risposta e layout JSON dei questionari generati.
            </p>
          </div>
        </div>
        <div className="pf-dashboard-grid">
          <div className="pf-stack">
            <label className="pf-field">
              Area
              <select
                className="pf-select"
                value={areaConfigDraft.areaId}
                onChange={(event) => {
                  const existing = areaGenerationConfigs.find(
                    (config) => config.areaId === event.target.value,
                  );
                  if (existing) {
                    editAreaConfig(existing);
                    return;
                  }
                  setAreaConfigDraft((prev) => ({
                    ...prev,
                    areaId: event.target.value,
                  }));
                }}
              >
                <option value="">Seleziona area</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="pf-field">
              Contesto iniziale generale
              <textarea
                className="pf-textarea"
                rows={7}
                value={areaConfigDraft.initialContext}
                onChange={(event) =>
                  setAreaConfigDraft((prev) => ({
                    ...prev,
                    initialContext: event.target.value,
                  }))
                }
              />
            </label>
            <label className="pf-field">
              Forma delle risposte AI
              <textarea
                className="pf-textarea"
                rows={5}
                value={areaConfigDraft.responseFormatPrompt}
                onChange={(event) =>
                  setAreaConfigDraft((prev) => ({
                    ...prev,
                    responseFormatPrompt: event.target.value,
                  }))
                }
              />
            </label>
            <label className="pf-field">
              Layout JSON questionari
              <textarea
                className="pf-textarea pf-mono"
                rows={8}
                value={areaConfigLayoutText}
                onChange={(event) => setAreaConfigLayoutText(event.target.value)}
              />
            </label>
            <button
              className="pf-button"
              type="button"
              disabled={busyKey === "area-config" || !areaConfigDraft.areaId}
              onClick={saveAreaConfig}
            >
              Salva configurazione AI area
            </button>
          </div>

          <div className="pf-stack">
            {areaGenerationConfigs.map((config) => (
              <button
                key={config.id ?? config.areaId}
                className="pf-config-row"
                type="button"
                onClick={() => editAreaConfig(config)}
              >
                <span>
                  <strong>{config.area?.name ?? "Area"}</strong>
                  <small>Contesto, formato risposta e layout questionario</small>
                </span>
                <StatusBadge tone="success">unico</StatusBadge>
              </button>
            ))}
            {!areaGenerationConfigs.length && (
              <EmptyState
                title="Nessuna configurazione area"
                description="Aggiorna per creare le configurazioni area predefinite."
              />
            )}
          </div>
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Questionari anamnesi</h2>
            <p className="pf-muted">
              Le domande generali alimentano il profilo atleta. Le domande area
              con input di tipo punteggio alimentano la baseline e le future promozioni.
            </p>
          </div>
        </div>
        <div className="pf-dashboard-grid">
          <div className="pf-stack">
            <label className="pf-field">
              Chiave
              <input
                className="pf-input"
                value={templateDraft.key}
                onChange={(event) =>
                  setTemplateDraft((prev) => ({ ...prev, key: event.target.value }))
                }
              />
            </label>
            <label className="pf-field">
              Testo domanda
              <textarea
                className="pf-textarea"
                rows={3}
                value={templateDraft.label}
                onChange={(event) =>
                  setTemplateDraft((prev) => ({
                    ...prev,
                    label: event.target.value,
                  }))
                }
              />
            </label>
            <div className="pf-two-col">
              <label className="pf-field">
                Ambito
                <select
                  className="pf-select"
                  value={templateDraft.scope}
                  onChange={(event) =>
                    setTemplateDraft((prev) => ({
                      ...prev,
                      scope: event.target.value as OnboardingTemplate["scope"],
                    }))
                  }
                >
                  <option value="GENERAL">Generale</option>
                  <option value="AREA">Area</option>
                </select>
              </label>
              <label className="pf-field">
                Area
                <select
                  className="pf-select"
                  value={templateDraft.areaId ?? ""}
                  disabled={templateDraft.scope !== "AREA"}
                  onChange={(event) =>
                    setTemplateDraft((prev) => ({
                      ...prev,
                      areaId: event.target.value || null,
                    }))
                  }
                >
                  <option value="">Seleziona area</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="pf-two-col">
              <label className="pf-field">
                Input
                <select
                  className="pf-select"
                  value={templateDraft.inputType}
                  onChange={(event) =>
                    setTemplateDraft((prev) => ({
                      ...prev,
                      inputType: event.target.value as OnboardingTemplate["inputType"],
                    }))
                  }
                >
                  {["TEXT", "NUMBER", "SELECT", "SCORE"].map((type) => (
                    <option key={type} value={type}>
                      {inputTypeLabel(type as OnboardingTemplate["inputType"])}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pf-field">
                Ordine
                <input
                  className="pf-input"
                  type="number"
                  value={templateDraft.orderIndex}
                  onChange={(event) =>
                    setTemplateDraft((prev) => ({
                      ...prev,
                      orderIndex: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
            <label className="pf-field">
              Testo di aiuto
              <input
                className="pf-input"
                value={templateDraft.helpText ?? ""}
                onChange={(event) =>
                  setTemplateDraft((prev) => ({
                    ...prev,
                    helpText: event.target.value,
                  }))
                }
              />
            </label>
            <label className="pf-field">
              Opzioni JSON
              <textarea
                className="pf-textarea pf-mono"
                rows={5}
                value={templateOptionsText}
                onChange={(event) => setTemplateOptionsText(event.target.value)}
                placeholder='[{"label":"Basso","value":"LOW","score":40}]'
              />
            </label>
            <div className="pf-actions">
              <label className="pf-checkbox">
                <input
                  type="checkbox"
                  checked={templateDraft.required}
                  onChange={(event) =>
                    setTemplateDraft((prev) => ({
                      ...prev,
                      required: event.target.checked,
                    }))
                  }
                />
                Obbligatoria
              </label>
              <label className="pf-checkbox">
                <input
                  type="checkbox"
                  checked={templateDraft.isActive}
                  onChange={(event) =>
                    setTemplateDraft((prev) => ({
                      ...prev,
                      isActive: event.target.checked,
                    }))
                  }
                />
                Attiva
              </label>
            </div>
            <button
              className="pf-button"
              type="button"
              disabled={busyKey === "template"}
              onClick={saveTemplate}
            >
              Salva domanda
            </button>
          </div>

          <div className="pf-stack">
            {templates.map((template) => (
              <button
                key={template.id}
                className="pf-config-row"
                type="button"
                onClick={() => editTemplate(template)}
              >
                <span>
                  <strong>{template.label}</strong>
                  <small>
                    {template.scope === "GENERAL"
                      ? "Generale"
                      : template.area?.name ?? "Area"}{" "}
                    - {template.inputType} - order {template.orderIndex}
                  </small>
                </span>
                <StatusBadge tone={template.isActive ? "success" : "neutral"}>
                  {template.isActive ? "attiva" : "spenta"}
                </StatusBadge>
              </button>
            ))}
          </div>
        </div>
      </section>
    </ProductShell>
  );
}
