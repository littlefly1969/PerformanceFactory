"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Area = { id: string; name: string };
type InputType = "TEXT" | "NUMBER" | "SELECT" | "SCORE";
type OnboardingTemplate = {
  id: string;
  key: string;
  scope: "GENERAL" | "AREA";
  areaId?: string | null;
  label: string;
  helpText?: string | null;
  inputType: InputType;
  optionsJson?: unknown;
  required: boolean;
  orderIndex: number;
  isActive: boolean;
  updatedAt?: string;
  area?: Area | null;
};
type Settings = {
  areas: Area[];
  onboardingTemplates: OnboardingTemplate[];
  inputTypes: InputType[];
};
type FormState = {
  id?: string;
  key: string;
  label: string;
  helpText: string;
  inputType: InputType;
  optionsText: string;
  required: boolean;
  orderIndex: number;
  isActive: boolean;
};

const emptyForm = (orderIndex = 10): FormState => ({
  key: "",
  label: "",
  helpText: "",
  inputType: "TEXT",
  optionsText: "[]",
  required: true,
  orderIndex,
  isActive: true,
});

const readError = async (response: Response) => {
  try {
    const data = (await response.json()) as { message?: string; error?: string };
    return data.message ?? data.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const stringifyJson = (value: unknown) =>
  value === null || value === undefined ? "[]" : JSON.stringify(value, null, 2);

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70);

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "-";

export default function AnamnesiPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const templates = useMemo(
    () =>
      (settings?.onboardingTemplates ?? [])
        .filter((item) => item.scope === "GENERAL")
        .sort((a, b) => a.orderIndex - b.orderIndex || a.label.localeCompare(b.label)),
    [settings?.onboardingTemplates],
  );
  const activeTemplates = templates.filter((item) => item.isActive);
  const nextOrderIndex =
    templates.length > 0
      ? Math.max(...templates.map((item) => item.orderIndex)) + 10
      : 10;

  const loadSettings = async () => {
    setBusyKey("load");
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/ai-tuning/prompt-settings`);
    setBusyKey(null);
    if (!response.ok) {
      setMessage(`Caricamento non riuscito: ${await readError(response)}`);
      return;
    }
    const data = (await response.json()) as Settings;
    setSettings(data);
    setForm((current) =>
      current.id ? current : { ...current, orderIndex: nextOrderIndex },
    );
  };

  useEffect(() => {
    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCreate = () => {
    setMessage(null);
    setForm(emptyForm(nextOrderIndex));
  };

  const startEdit = (template: OnboardingTemplate) => {
    setMessage(null);
    setForm({
      id: template.id,
      key: template.key,
      label: template.label,
      helpText: template.helpText ?? "",
      inputType: template.inputType,
      optionsText: stringifyJson(template.optionsJson),
      required: template.required,
      orderIndex: template.orderIndex,
      isActive: template.isActive,
    });
  };

  const saveTemplate = async (override?: Partial<FormState>) => {
    const draft = { ...form, ...override };
    const label = draft.label.trim();
    if (!label) {
      setMessage("Inserisci il testo della domanda.");
      return false;
    }

    let optionsJson: unknown = [];
    if (draft.inputType === "SELECT" || draft.inputType === "SCORE") {
      try {
        optionsJson = JSON.parse(draft.optionsText || "[]");
      } catch {
        setMessage("Le opzioni devono essere JSON valido.");
        return false;
      }
      if (!Array.isArray(optionsJson)) {
        setMessage("Le opzioni devono essere un array JSON.");
        return false;
      }
    }

    const key =
      draft.key.trim() ||
      `general_${slugify(label) || Date.now().toString(36)}`;
    setBusyKey(draft.id ? `save:${draft.id}` : "save:new");
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/ai-tuning/onboarding-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: draft.id,
        key,
        scope: "GENERAL",
        areaId: null,
        label,
        helpText: draft.helpText.trim() || null,
        inputType: draft.inputType,
        optionsJson,
        required: draft.required,
        orderIndex: Number(draft.orderIndex) || 0,
        isActive: draft.isActive,
      }),
    });
    setBusyKey(null);

    if (!response.ok) {
      setMessage(`Salvataggio non riuscito: ${await readError(response)}`);
      return false;
    }

    setMessage("Domanda anamnesi salvata.");
    await loadSettings();
    if (!draft.id) {
      setForm(emptyForm(nextOrderIndex + 10));
    }
    return true;
  };

  const updateTemplate = async (
    template: OnboardingTemplate,
    patch: Partial<OnboardingTemplate>,
  ) => {
    setBusyKey(`update:${template.id}`);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/ai-tuning/onboarding-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: template.id,
        key: template.key,
        scope: "GENERAL",
        areaId: null,
        label: patch.label ?? template.label,
        helpText: patch.helpText ?? template.helpText ?? null,
        inputType: patch.inputType ?? template.inputType,
        optionsJson: patch.optionsJson ?? template.optionsJson ?? [],
        required: patch.required ?? template.required,
        orderIndex: patch.orderIndex ?? template.orderIndex,
        isActive: patch.isActive ?? template.isActive,
      }),
    });
    setBusyKey(null);
    if (!response.ok) {
      setMessage(`Aggiornamento non riuscito: ${await readError(response)}`);
      return false;
    }
    await loadSettings();
    return true;
  };

  const moveTemplate = async (template: OnboardingTemplate, direction: -1 | 1) => {
    const index = templates.findIndex((item) => item.id === template.id);
    const swapWith = templates[index + direction];
    if (!swapWith) return;
    const originalOrder = template.orderIndex;
    const swapOrder = swapWith.orderIndex;
    setBusyKey(`move:${template.id}`);
    const first = await updateTemplate(template, { orderIndex: swapOrder });
    if (first) {
      await updateTemplate(swapWith, { orderIndex: originalOrder });
      setMessage("Ordine aggiornato.");
    }
    setBusyKey(null);
  };

  const deleteTemplate = async (template: OnboardingTemplate) => {
    if (!window.confirm("Eliminare questa domanda di anamnesi?")) return;
    setBusyKey(`delete:${template.id}`);
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/ai-tuning/onboarding-templates/${template.id}`,
      { method: "DELETE" },
    );
    setBusyKey(null);
    if (!response.ok) {
      setMessage(`Eliminazione non riuscita: ${await readError(response)}`);
      return;
    }
    if (form.id === template.id) {
      setForm(emptyForm(nextOrderIndex));
    }
    setMessage("Domanda eliminata.");
    await loadSettings();
  };

  const inputTypes = settings?.inputTypes ?? ["TEXT", "NUMBER", "SELECT", "SCORE"];
  const formNeedsOptions = form.inputType === "SELECT" || form.inputType === "SCORE";

  return (
    <ProductShell
      eyebrow="ANAMNESI"
      title="Domande anamnesi"
      description="Gestisci le domande iniziali proposte all'atleta prima della validazione dell'obiettivo."
      actions={
        <>
          <button className="pf-button-secondary" type="button" onClick={loadSettings}>
            Aggiorna
          </button>
          <button className="pf-button" type="button" onClick={startCreate}>
            Nuova domanda
          </button>
        </>
      }
      stats={[
        { label: "Domande attive", value: activeTemplates.length, tone: "accent" },
        { label: "Totale", value: templates.length, tone: "neutral" },
      ]}
    >
      <div className="pf-anamnesis-management">
        {message && <div className="pf-alert warning">{message}</div>}
        <section className="pf-anamnesis-layout">
          <div className="pf-panel">
            <div className="pf-panel-header">
              <div>
                <h2>Sequenza domande</h2>
                <p className="pf-muted">
                  L'ordine qui sotto e quello usato nello step iniziale
                  dell'onboarding.
                </p>
              </div>
            </div>
            {busyKey === "load" && <p className="pf-muted">Caricamento...</p>}
            {!busyKey && templates.length === 0 && (
              <EmptyState
                title="Nessuna domanda configurata"
                description="Crea la prima domanda per sostituire le domande fallback dell'onboarding."
              />
            )}
            <div className="pf-anamnesis-list">
              {templates.map((template, index) => (
                <article
                  className={`pf-card pf-anamnesis-question ${
                    form.id === template.id ? "selected" : ""
                  }`}
                  key={template.id}
                >
                  <div className="pf-anamnesis-question-main">
                    <div className="pf-anamnesis-question-top">
                      <span className="pf-anamnesis-order">
                        {index + 1}
                      </span>
                      <div>
                        <h3>{template.label}</h3>
                        <p className="pf-muted">
                          {template.key} - aggiornata {formatDate(template.updatedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="pf-anamnesis-meta">
                      <StatusBadge tone={template.isActive ? "success" : "neutral"}>
                        {template.isActive ? "Attiva" : "Inattiva"}
                      </StatusBadge>
                      <StatusBadge tone="accent">{template.inputType}</StatusBadge>
                      <StatusBadge tone={template.required ? "warning" : "neutral"}>
                        {template.required ? "Obbligatoria" : "Facoltativa"}
                      </StatusBadge>
                    </div>
                  </div>
                  <div className="pf-anamnesis-actions">
                    <button
                      className="pf-button-secondary"
                      type="button"
                      disabled={index === 0 || busyKey?.startsWith("move:")}
                      onClick={() => moveTemplate(template, -1)}
                    >
                      Su
                    </button>
                    <button
                      className="pf-button-secondary"
                      type="button"
                      disabled={
                        index === templates.length - 1 ||
                        busyKey?.startsWith("move:")
                      }
                      onClick={() => moveTemplate(template, 1)}
                    >
                      Giu
                    </button>
                    <button
                      className="pf-button-secondary"
                      type="button"
                      onClick={() => startEdit(template)}
                    >
                      Modifica
                    </button>
                    <button
                      className="pf-button-secondary"
                      type="button"
                      disabled={busyKey === `update:${template.id}`}
                      onClick={() =>
                        updateTemplate(template, { isActive: !template.isActive })
                      }
                    >
                      {template.isActive ? "Disattiva" : "Attiva"}
                    </button>
                    <button
                      className="pf-button-danger"
                      type="button"
                      disabled={busyKey === `delete:${template.id}`}
                      onClick={() => deleteTemplate(template)}
                    >
                      Elimina
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="pf-panel">
            <div className="pf-panel-header">
              <div>
                <h2>{form.id ? "Modifica domanda" : "Nuova domanda"}</h2>
                <p className="pf-muted">
                  Queste domande costruiscono l'anamnesi generale usata poi dai
                  prompt di onboarding e test.
                </p>
              </div>
            </div>
            <div className="pf-form-grid">
              <label className="pf-field">
                Testo domanda
                <textarea
                  className="pf-textarea"
                  rows={4}
                  value={form.label}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="pf-field">
                Chiave tecnica
                <input
                  className="pf-input"
                  value={form.key}
                  placeholder="Auto se lasciata vuota"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      key: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="pf-field">
                Aiuto opzionale
                <textarea
                  className="pf-textarea"
                  rows={3}
                  value={form.helpText}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      helpText: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="pf-anamnesis-form-row">
                <label className="pf-field">
                  Tipo risposta
                  <select
                    className="pf-select"
                    value={form.inputType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        inputType: event.target.value as InputType,
                      }))
                    }
                  >
                    {inputTypes.map((type) => (
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
                    min={0}
                    type="number"
                    value={form.orderIndex}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        orderIndex: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              </div>
              {formNeedsOptions && (
                <label className="pf-field">
                  Opzioni JSON
                  <textarea
                    className="pf-textarea"
                    rows={7}
                    value={form.optionsText}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        optionsText: event.target.value,
                      }))
                    }
                  />
                  <span className="pf-field-hint">
                    Usa un array, per esempio {`[{"value":1,"label":"Basso"}]`}.
                  </span>
                </label>
              )}
              <div className="pf-anamnesis-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={form.required}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        required: event.target.checked,
                      }))
                    }
                  />{" "}
                  Obbligatoria
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        isActive: event.target.checked,
                      }))
                    }
                  />{" "}
                  Attiva
                </label>
              </div>
              <div className="pf-form-actions">
                <button
                  className="pf-button"
                  type="button"
                  disabled={busyKey?.startsWith("save:")}
                  onClick={() => saveTemplate()}
                >
                  {busyKey?.startsWith("save:") ? "Salvataggio..." : "Salva"}
                </button>
                {form.id && (
                  <button
                    className="pf-button-secondary"
                    type="button"
                    onClick={startCreate}
                  >
                    Annulla modifica
                  </button>
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </ProductShell>
  );
}
