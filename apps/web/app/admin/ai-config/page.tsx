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
type AreaGenerationConfig = {
  id?: string;
  areaId: string;
  initialContext: string;
  responseFormatPrompt: string;
  questionnaireLayoutJson: unknown;
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
  levels: string[];
  promptConfigs: PromptConfig[];
  areaGenerationConfigs: AreaGenerationConfig[];
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
  const [areaConfigDraft, setAreaConfigDraft] =
    useState<AreaGenerationConfig>(emptyAreaConfig);
  const [areaConfigLayoutText, setAreaConfigLayoutText] = useState("");
  const [templateDraft, setTemplateDraft] =
    useState<OnboardingTemplate>(emptyTemplate);
  const [templateOptionsText, setTemplateOptionsText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const areas = settings?.areas ?? [];
  const levels = settings?.levels ?? ["BASELINE", "STABLE", "ADVANCED"];
  const promptConfigs = settings?.promptConfigs ?? [];
  const areaGenerationConfigs = settings?.areaGenerationConfigs ?? [];
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
      setMessage(`Configuration load failed: ${await readError(response)}`);
      return;
    }
    setSettings((await response.json()) as Settings);
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
      setMessage(`Prompt save failed: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setPromptDraft(emptyPrompt);
    await loadSettings();
    setMessage("Prompt configuration saved.");
    setBusyKey(null);
  };

  const saveTemplate = async () => {
    let optionsJson: unknown = null;
    if (templateOptionsText.trim()) {
      try {
        optionsJson = JSON.parse(templateOptionsText);
      } catch {
        setMessage("Options JSON is not valid.");
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
      setMessage(`Template save failed: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setTemplateDraft(emptyTemplate);
    setTemplateOptionsText("");
    await loadSettings();
    setMessage("Onboarding question saved.");
    setBusyKey(null);
  };

  const saveAreaConfig = async () => {
    let questionnaireLayoutJson: unknown;
    try {
      questionnaireLayoutJson = JSON.parse(areaConfigLayoutText);
    } catch {
      setMessage("Questionnaire layout JSON is not valid.");
      return;
    }

    if (
      !questionnaireLayoutJson ||
      Array.isArray(questionnaireLayoutJson) ||
      typeof questionnaireLayoutJson !== "object"
    ) {
      setMessage("Questionnaire layout must be a JSON object.");
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
      setMessage(`Area AI config save failed: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    await loadSettings();
    setMessage("Area AI configuration saved.");
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

  return (
    <ProductShell
      eyebrow="Admin AI"
      title="Prompt e anamnesi"
      description="Configura prompt base per livello e area, e mantieni modificabili le domande generali e specifiche di onboarding."
      actions={
        <button className="pf-button-secondary" type="button" onClick={loadSettings}>
          Refresh
        </button>
      }
      stats={[
        { label: "Prompt attivi", value: activePromptCount, tone: "accent" },
        {
          label: "Domande anamnesi",
          value: templates.filter((template) => template.isActive).length,
          tone: "success",
        },
        { label: "Aree", value: areas.length, tone: "neutral" },
      ]}
    >
      {message && <div className="pf-alert warning">{message}</div>}

      <section className="pf-dashboard-grid">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Prompt base</h2>
              <p className="pf-muted">
                Il prompt globale e quello d area vengono aggiunti al prompt di
                sistema durante generazione e preview AI.
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
                      {level}
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
              {promptIdentityChanged ? "Create new prompt" : "Save prompt"}
            </button>
            {promptNeedsNewName && (
              <p className="pf-muted">
                Area or level changes create a new prompt, so assign a new
                unique name before saving.
              </p>
            )}
            {promptIdentityChanged && (
              <p className="pf-muted">
                Changing name, area, or athlete level creates a new prompt. The
                active prompt for the same area and level will be replaced.
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
                    {prompt.area?.name ?? "Globale"} · {prompt.athleteLevel} ·
                    v{prompt.version ?? 1}
                  </small>
                </span>
                <StatusBadge tone={prompt.isActive ? "success" : "neutral"}>
                  {prompt.isActive ? "active" : "off"}
                </StatusBadge>
              </button>
            ))}
            {!promptConfigs.length && (
              <EmptyState
                title="No prompt"
                description="Create at least one global baseline prompt."
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
              Save area AI config
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
                <StatusBadge tone="success">unique</StatusBadge>
              </button>
            ))}
            {!areaGenerationConfigs.length && (
              <EmptyState
                title="No area config"
                description="Refresh to create default area configurations."
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
              con input SCORE alimentano la baseline e le future promozioni.
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
                Scope
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
                      {type}
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
              Help text
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
              Save question
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
                    · {template.inputType} · order {template.orderIndex}
                  </small>
                </span>
                <StatusBadge tone={template.isActive ? "success" : "neutral"}>
                  {template.isActive ? "active" : "off"}
                </StatusBadge>
              </button>
            ))}
          </div>
        </div>
      </section>
    </ProductShell>
  );
}
