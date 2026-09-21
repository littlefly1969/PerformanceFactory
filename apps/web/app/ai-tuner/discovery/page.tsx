"use client";
import { useEffect, useState } from "react";
import { ProductShell } from "../../components/product-shell";
import { API_BASE, secureFetch } from "../../lib/api";
import type { DiscoveryQuestion } from "../../start/discovery-types";
import { ConditionEditor } from "./condition-editor";

type Template = {
  id?: string;
  key: string;
  scope: string;
  label: string;
  helpText?: string | null;
  inputType: string;
  required: boolean;
  orderIndex: number;
  isActive: boolean;
  optionsJson: Pick<
    DiscoveryQuestion,
    "type" | "options" | "visibleWhen" | "target" | "min" | "max" | "step"
  > &
    Record<string, unknown>;
};
const asQuestion = (t: Template): DiscoveryQuestion => ({
  ...t.optionsJson,
  id: t.id ?? t.key,
  code: t.key,
  title: t.label,
  order: t.orderIndex,
  required: t.required,
});
export default function DiscoveryEditorPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [draft, setDraft] = useState<Template>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const response = await secureFetch(`${API_BASE}/ai-tuning/prompt-settings`);
    if (!response.ok)
      throw new Error(
        "Impossibile caricare le domande. Accedi con il profilo Gestione prompt.",
      );
    const data = await response.json();
    setTemplates(
      (data.onboardingTemplates as Template[])
        .filter((t) => t.scope === "DISCOVERY")
        .sort((a, b) => a.orderIndex - b.orderIndex),
    );
  };
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  const patch = (value: Partial<Template>) =>
    setDraft((current) => current && { ...current, ...value });
  const metadata = (value: Partial<Template["optionsJson"]>) =>
    setDraft(
      (current) =>
        current && {
          ...current,
          optionsJson: { ...current.optionsJson, ...value },
        },
    );
  const create = () => {
    setMessage("");
    setDraft({
      key: `discovery_${crypto.randomUUID()}`,
      scope: "DISCOVERY",
      label: "",
      helpText: "",
      inputType: "SELECT",
      required: true,
      orderIndex: Math.max(0, ...templates.map((t) => t.orderIndex)) + 10,
      isActive: true,
      optionsJson: {
        type: "single_choice",
        options: [{ id: crypto.randomUUID(), label: "", value: "" }],
      },
    });
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (draft.optionsJson.visibleWhen?.rules.some((r) => !r.values.length))
        throw new Error("Scegli almeno una risposta per ogni condizione.");
      const response = await secureFetch(
        `${API_BASE}/ai-tuning/onboarding-templates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: draft.id,
            key: draft.key,
            scope: "DISCOVERY",
            label: draft.label,
            helpText: draft.helpText,
            inputType: draft.inputType,
            required: draft.required,
            orderIndex: draft.orderIndex,
            isActive: draft.isActive,
            optionsJson: {
              ...draft.optionsJson,
              options: draft.optionsJson.options?.map((o) => ({
                ...o,
                value: o.value === "" ? o.label : o.value,
              })),
            },
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(". ")
            : (data.message ?? "Salvataggio non riuscito"),
        );
      await load();
      setDraft(undefined);
      setMessage("Domanda e percorso salvati.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Connessione non disponibile",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <ProductShell
      title="Domande iniziali"
      description="Costruisci percorsi diversi in base alle risposte dell’atleta."
    >
      {message && (
        <p role="status" className="pf-alert">
          {message}
        </p>
      )}
      <button
        type="button"
        className="pf-button"
        disabled={busy}
        onClick={create}
      >
        Nuova domanda
      </button>
      <div className="pf-stack">
        {templates.map((t) => (
          <article key={t.id} className="pf-card">
            <h2>
              {t.orderIndex}. {t.label}
            </h2>
            <p>
              {t.isActive ? "Attiva" : "Disattivata"} ·{" "}
              {t.required ? "Obbligatoria quando visibile" : "Facoltativa"}
            </p>
            {t.optionsJson.visibleWhen ? (
              <p>
                {t.optionsJson.visibleWhen.match === "all"
                  ? "Tutte: "
                  : "Almeno una: "}
                {t.optionsJson.visibleWhen.rules
                  .map((r) => {
                    const parent = templates.find((p) => p.key === r.question);
                    return `${parent?.label ?? r.question} ${r.operator === "in" ? "→" : "diversa da"} ${r.values.map((v) => parent?.optionsJson.options?.find((o) => (parent.optionsJson.type === "boolean" ? o.value === v : o.id === v))?.label ?? String(v)).join(", ")}`;
                  })
                  .join(" · ")}
              </p>
            ) : (
              <p>
                Sempre visibile
                {t.optionsJson.target === "sportId" ||
                t.optionsJson.target === "specializationId"
                  ? " quando lo sport è a scelta dell’atleta"
                  : ""}
              </p>
            )}
            <button
              className="pf-button-secondary"
              disabled={busy}
              onClick={() => {
                setDraft(structuredClone(t));
                setMessage("");
              }}
            >
              Modifica {t.label}
            </button>
          </article>
        ))}
      </div>
      {draft && (
        <form className="pf-card pf-stack" onSubmit={save}>
          <h2>{draft.id ? "Modifica domanda" : "Nuova domanda"}</h2>
          <fieldset disabled={busy} className="pf-stack">
            <label className="pf-field">
              Domanda
              <input
                className="pf-input"
                required
                maxLength={500}
                value={draft.label}
                onChange={(e) => patch({ label: e.target.value })}
              />
            </label>
            <label className="pf-field">
              Descrizione
              <input
                className="pf-input"
                maxLength={2000}
                value={draft.helpText ?? ""}
                onChange={(e) => patch({ helpText: e.target.value })}
              />
            </label>
            <label className="pf-field">
              Posizione
              <input
                className="pf-input"
                type="number"
                min={0}
                max={10000}
                required
                value={draft.orderIndex}
                onChange={(e) => patch({ orderIndex: Number(e.target.value) })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(e) => patch({ required: e.target.checked })}
              />{" "}
              Obbligatoria quando visibile
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => patch({ isActive: e.target.checked })}
              />{" "}
              Attiva
            </label>
            {!draft.id && (
              <label className="pf-field">
                Tipo di risposta
                <select
                  className="pf-input"
                  value={draft.optionsJson.type}
                  onChange={(e) => {
                    const type = e.target.value as DiscoveryQuestion["type"];
                    patch({
                      inputType:
                        type === "number" || type === "scale"
                          ? "NUMBER"
                          : type === "date"
                            ? "TEXT"
                            : "SELECT",
                      optionsJson: {
                        ...draft.optionsJson,
                        type,
                        ...(type === "boolean"
                          ? {
                              options: [
                                { id: "yes", label: "Sì", value: true },
                                { id: "no", label: "No", value: false },
                              ],
                            }
                          : {
                              options: [
                                {
                                  id: crypto.randomUUID(),
                                  label: "",
                                  value: "",
                                },
                              ],
                            }),
                        ...(type === "number" || type === "scale"
                          ? { min: 0, max: 10, step: 1 }
                          : {}),
                      },
                    });
                  }}
                >
                  <option value="single_choice">Scelta singola</option>
                  <option value="multi_choice">Scelta multipla</option>
                  <option value="boolean">Sì / No</option>
                  <option value="number">Numero</option>
                  <option value="scale">Scala</option>
                  <option value="date">Data</option>
                </select>
              </label>
            )}
            {["single_choice", "multi_choice"].includes(
              draft.optionsJson.type,
            ) &&
              !["sportId", "specializationId"].includes(
                draft.optionsJson.target ?? "",
              ) && (
                <fieldset className="pf-stack">
                  <legend>Risposte possibili</legend>
                  {draft.optionsJson.options.map((option, i) => (
                    <label className="pf-field" key={option.id}>
                      Risposta {i + 1}
                      <input
                        className="pf-input"
                        required
                        maxLength={500}
                        value={option.label}
                        onChange={(e) =>
                          metadata({
                            options: draft.optionsJson.options.map((o) =>
                              o.id === option.id
                                ? {
                                    ...o,
                                    label: e.target.value,
                                    ...(!draft.id
                                      ? { value: e.target.value }
                                      : {}),
                                  }
                                : o,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="pf-button-secondary"
                    onClick={() =>
                      metadata({
                        options: [
                          ...draft.optionsJson.options,
                          { id: crypto.randomUUID(), label: "", value: "" },
                        ],
                      })
                    }
                  >
                    Aggiungi risposta
                  </button>
                </fieldset>
              )}
            {["number", "scale"].includes(draft.optionsJson.type) && (
              <div className="pf-stack">
                {(["min", "max", "step"] as const).map((key, index) => (
                  <label className="pf-field" key={key}>
                    {["Minimo", "Massimo", "Incremento"][index]}
                    <input
                      className="pf-input"
                      type="number"
                      step="any"
                      required
                      value={draft.optionsJson[key] ?? ""}
                      onChange={(e) =>
                        metadata({ [key]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            {!draft.optionsJson.target && (
              <ConditionEditor
                value={draft.optionsJson.visibleWhen}
                parents={templates
                  .filter(
                    (t) =>
                      t.isActive &&
                      t.id !== draft.id &&
                      t.orderIndex < draft.orderIndex &&
                      !["sportId", "specializationId"].includes(
                        t.optionsJson.target ?? "",
                      ),
                  )
                  .map(asQuestion)}
                onChange={(visibleWhen) => metadata({ visibleWhen })}
              />
            )}
            <button className="pf-button" type="submit">
              {busy ? "Salvataggio…" : "Salva domanda e percorso"}
            </button>
            <button
              className="pf-button-secondary"
              type="button"
              onClick={() => setDraft(undefined)}
            >
              Annulla
            </button>
          </fieldset>
        </form>
      )}
    </ProductShell>
  );
}
