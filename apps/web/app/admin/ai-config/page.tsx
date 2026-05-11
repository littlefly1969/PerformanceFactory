"use client";

import { useEffect, useState } from "react";
import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Area = { id: string; name: string };
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
type SportPrompt = {
  id?: string;
  areaId: string;
  basePrompt: string;
  isEnabledDriver: boolean;
  version?: number;
  isActive: boolean;
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
  prompts: SportPrompt[];
};
type SportCatalogItem = {
  id?: string;
  key: string;
  label: string;
  isActive: boolean;
  specializations: SportSpecialization[];
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
  sports: SportCatalogItem[];
  goalPromptConfig?: GoalPromptConfig | null;
  areaGenerationConfigs: AreaGenerationConfig[];
  onboardingTemplates: OnboardingTemplate[];
  inputTypes: OnboardingTemplate["inputType"][];
  scopes: OnboardingTemplate["scope"][];
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

const emptySportDraft: SportCatalogItem = {
  key: "",
  label: "",
  isActive: true,
  specializations: [],
};

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
  const [goalPromptDraft, setGoalPromptDraft] =
    useState<GoalPromptConfig>(emptyGoalPrompt);
  const [areaConfigDraft, setAreaConfigDraft] =
    useState<AreaGenerationConfig>(emptyAreaConfig);
  const [sportDraft, setSportDraft] =
    useState<SportCatalogItem>(emptySportDraft);
  const [areaConfigLayoutText, setAreaConfigLayoutText] = useState("");
  const [templateDraft, setTemplateDraft] =
    useState<OnboardingTemplate>(emptyTemplate);
  const [templateOptionsText, setTemplateOptionsText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const areas = settings?.areas ?? [];
  const sports = settings?.sports ?? [];
  const goalPromptConfig = settings?.goalPromptConfig ?? null;
  const areaGenerationConfigs = settings?.areaGenerationConfigs ?? [];
  const sportPromptCount = sports.reduce(
    (total, sport) =>
      total +
      sport.specializations.reduce(
        (sum, specialization) => sum + specialization.prompts.length,
        0,
      ),
    0,
  );
  const templates = settings?.onboardingTemplates ?? [];

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

  const saveSport = async () => {
    setBusyKey("sport");
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/sports`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sportDraft),
    });
    if (!response.ok) {
      setMessage(`Salvataggio sport non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setSportDraft(emptySportDraft);
    await loadSettings();
    setMessage("Sport salvato.");
    setBusyKey(null);
  };

  const deleteSport = async (sportId?: string) => {
    if (!sportId || !window.confirm("Cancellare questo sport e tutte le specializzazioni?")) {
      return;
    }
    setBusyKey(`sport-delete:${sportId}`);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/sports/${sportId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      setMessage(`Cancellazione sport non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setSportDraft(emptySportDraft);
    await loadSettings();
    setMessage("Sport cancellato.");
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

  const editSport = (sport: SportCatalogItem) => {
    setSportDraft({
      ...sport,
      specializations: sport.specializations.map((specialization) => ({
        ...specialization,
        trainingPrompt: specialization.trainingPrompt ?? "",
        trainingPromptActive: specialization.trainingPromptActive ?? true,
        prompts: areas.map((area) => {
          const prompt = specialization.prompts.find(
            (item) => item.areaId === area.id,
          );
          return (
            prompt ?? {
              areaId: area.id,
              basePrompt: "",
              isEnabledDriver: true,
              isActive: true,
              area,
            }
          );
        }),
      })),
    });
  };

  const updateSpecialization = (
    index: number,
    patch: Partial<SportSpecialization>,
  ) => {
    setSportDraft((prev) => ({
      ...prev,
      specializations: prev.specializations.map((specialization, itemIndex) =>
        itemIndex === index ? { ...specialization, ...patch } : specialization,
      ),
    }));
  };

  const updateSportPrompt = (
    specializationIndex: number,
    areaId: string,
    patch: Partial<SportPrompt>,
  ) => {
    setSportDraft((prev) => ({
      ...prev,
      specializations: prev.specializations.map((specialization, itemIndex) => {
        if (itemIndex !== specializationIndex) {
          return specialization;
        }
        const prompts = areas.map((area) => {
          const current =
            specialization.prompts.find((prompt) => prompt.areaId === area.id) ??
            {
              areaId: area.id,
              basePrompt: "",
              isEnabledDriver: true,
              isActive: true,
              area,
            };
          return area.id === areaId ? { ...current, ...patch } : current;
        });
        return { ...specialization, prompts };
      }),
    }));
  };

  return (
    <ProductShell
      eyebrow="Amministrazione AI"
      title="Prompt e anamnesi"
      description="Configura prompt obiettivo, contesto e layout AI per area, catalogo sport e domande di onboarding."
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
        { label: "Prompt sport", value: sportPromptCount, tone: "accent" },
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
              <h2>Catalogo sport</h2>
              <p className="pf-muted">
                Definisci sport, specializzazioni, prompt allenamento e driver dello spider.
                L'atleta puo scegliere solo elementi attivi configurati qui.
              </p>
            </div>
          </div>
          <div className="pf-stack">
            <div className="pf-two-col">
              <label className="pf-field">
                Codice sport
                <input
                  className="pf-input"
                  value={sportDraft.key}
                  onChange={(event) =>
                    setSportDraft((prev) => ({
                      ...prev,
                      key: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="CYCLING"
                />
              </label>
              <label className="pf-field">
                Nome sport
                <input
                  className="pf-input"
                  value={sportDraft.label}
                  onChange={(event) =>
                    setSportDraft((prev) => ({
                      ...prev,
                      label: event.target.value,
                    }))
                  }
                  placeholder="Ciclismo"
                />
              </label>
            </div>
            <label className="pf-checkbox">
              <input
                type="checkbox"
                checked={sportDraft.isActive}
                onChange={(event) =>
                  setSportDraft((prev) => ({
                    ...prev,
                    isActive: event.target.checked,
                  }))
                }
              />
              Attivo
            </label>
            <button
              className="pf-button-secondary"
              type="button"
              onClick={() =>
                setSportDraft((prev) => ({
                  ...prev,
                  specializations: [
                    ...prev.specializations,
                    {
                      key: "",
                      label: "",
                      trainingPrompt: "",
                      trainingPromptActive: true,
                      isActive: true,
                      prompts: areas.map((area) => ({
                        areaId: area.id,
                        basePrompt: "",
                        isEnabledDriver: true,
                        isActive: true,
                        area,
                      })),
                    },
                  ],
                }))
              }
            >
              Aggiungi specializzazione
            </button>
            {sportDraft.specializations.map((specialization, index) => (
              <article key={specialization.id ?? index} className="pf-card">
                <div className="pf-card-top">
                  <div className="pf-two-col">
                    <label className="pf-field">
                      Codice specializzazione
                      <input
                        className="pf-input"
                        value={specialization.key}
                        onChange={(event) =>
                          updateSpecialization(index, {
                            key: event.target.value.toUpperCase(),
                          })
                        }
                        placeholder="ROAD"
                      />
                    </label>
                    <label className="pf-field">
                      Nome specializzazione
                      <input
                        className="pf-input"
                        value={specialization.label}
                        onChange={(event) =>
                          updateSpecialization(index, {
                            label: event.target.value,
                          })
                        }
                        placeholder="Strada"
                      />
                    </label>
                  </div>
                  <button
                    className="pf-button-secondary"
                    type="button"
                    onClick={() =>
                      setSportDraft((prev) => ({
                        ...prev,
                        specializations: prev.specializations.filter(
                          (_item, itemIndex) => itemIndex !== index,
                        ),
                      }))
                    }
                  >
                    Rimuovi
                  </button>
                </div>
                <label className="pf-checkbox">
                  <input
                    type="checkbox"
                    checked={specialization.isActive}
                    onChange={(event) =>
                      updateSpecialization(index, {
                        isActive: event.target.checked,
                      })
                    }
                  />
                  Specializzazione attiva
                </label>
                <label className="pf-checkbox">
                  <input
                    type="checkbox"
                    checked={specialization.trainingPromptActive}
                    onChange={(event) =>
                      updateSpecialization(index, {
                        trainingPromptActive: event.target.checked,
                      })
                    }
                  />
                  Allenamento specifico attivo
                </label>
                <label className="pf-field">
                  Prompt allenamento specifico
                  <textarea
                    className="pf-textarea"
                    rows={8}
                    value={specialization.trainingPrompt ?? ""}
                    onChange={(event) =>
                      updateSpecialization(index, {
                        trainingPrompt: event.target.value,
                      })
                    }
                  />
                </label>
                <div className="pf-stack">
                  {areas.map((area) => {
                    const prompt =
                      specialization.prompts.find(
                        (item) => item.areaId === area.id,
                      ) ?? {
                        areaId: area.id,
                        basePrompt: "",
                        isEnabledDriver: true,
                        isActive: true,
                        area,
                      };
                    return (
                      <div key={area.id} className="pf-stack">
                        <label className="pf-checkbox">
                          <input
                            type="checkbox"
                            checked={prompt.isEnabledDriver}
                            onChange={(event) =>
                              updateSportPrompt(index, area.id, {
                                isEnabledDriver: event.target.checked,
                              })
                            }
                          />
                          Driver {area.name} nello spider
                        </label>
                        <label className="pf-field">
                          Prompt {area.name}
                          <textarea
                            className="pf-textarea"
                            rows={4}
                            value={prompt.basePrompt}
                            onChange={(event) =>
                              updateSportPrompt(index, area.id, {
                                basePrompt: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
            <button
              className="pf-button"
              type="button"
              disabled={
                busyKey === "sport" ||
                !sportDraft.key.trim() ||
                !sportDraft.label.trim() ||
                !sportDraft.specializations.length
              }
              onClick={saveSport}
            >
              Salva sport
            </button>
          </div>
        </article>

        <aside className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Prompt sport attuali</h2>
              <p className="pf-muted">
                Seleziona uno sport per modificarlo o cancellarlo.
              </p>
            </div>
          </div>
          <div className="pf-stack">
            {sports.map((sport) => (
              <div
                key={sport.id}
                className="pf-config-row"
              >
                <span>
                  <strong>{sport.label}</strong>
                  <small>
                    {sport.specializations.length} specializzazioni
                  </small>
                </span>
                <div className="pf-actions">
                  <button
                    className="pf-button-secondary"
                    type="button"
                    onClick={() => editSport(sport)}
                  >
                    Modifica
                  </button>
                  <button
                    className="pf-button-danger"
                    type="button"
                    disabled={busyKey === `sport-delete:${sport.id}`}
                    onClick={() => deleteSport(sport.id)}
                  >
                    Cancella
                  </button>
                </div>
              </div>
            ))}
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
