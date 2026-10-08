"use client";

import { useEffect, useState } from "react";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Kind = "R_CONSOLIDATION" | "LESSON_ELIGIBILITY";
type Rule = {
  minOverallConfidence: number | null;
  minAreaConfidence: number | null;
  minAreasAtConfidence: number | null;
};
type Version = Rule & {
  id: string;
  version: number;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
};
type Policy = { kind: Kind; active: Version; versions: Version[] };

const URL = `${API_BASE}/admin/confidence-policies`;

const TEXT: Record<Kind, { title: string; hint: string }> = {
  R_CONSOLIDATION: {
    title: "Consolidamento di R",
    hint: "Quando le evidenze bastano per consolidare R e generare P3/P6/P12. Tempo trascorso, numero di round e lezione gratuita non contano.",
  },
  LESSON_ELIGIBILITY: {
    title: "Eleggibilità alla lezione gratuita",
    hint: "Quando il profilo è abbastanza attendibile per sbloccare la lezione. È una regola separata dal consolidamento.",
  },
};

const FIELDS: { key: keyof Rule; label: string; hint: string }[] = [
  {
    key: "minOverallConfidence",
    label: "Confidence complessiva minima",
    hint: "1-100; vuoto = non richiesta.",
  },
  {
    key: "minAreaConfidence",
    label: "Confidence minima per area",
    hint: "1-100; vuoto = non richiesta.",
  },
  {
    key: "minAreasAtConfidence",
    label: "Aree che devono raggiungerla",
    hint: "Vuoto = tutte le aree valutate.",
  },
];

const describe = (rule: Rule) =>
  [
    rule.minOverallConfidence !== null &&
      `complessiva ≥ ${rule.minOverallConfidence}`,
    rule.minAreaConfidence !== null &&
      `${rule.minAreasAtConfidence ?? "tutte le"} aree ≥ ${rule.minAreaConfidence}`,
  ]
    .filter(Boolean)
    .join(" e ");

function PolicyForm({
  policy,
  onPublished,
}: {
  policy: Policy;
  onPublished: () => void;
}) {
  const pick = ({
    minOverallConfidence,
    minAreaConfidence,
    minAreasAtConfidence,
  }: Rule) => ({
    minOverallConfidence,
    minAreaConfidence,
    minAreasAtConfidence,
  });
  const [rule, setRule] = useState<Rule>(pick(policy.active));
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const text = TEXT[policy.kind];

  const publish = async () => {
    setSaving(true);
    setMessage(null);
    const response = await secureFetch(`${URL}/${policy.kind}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rule, ...(note.trim() ? { note } : {}) }),
    });
    setSaving(false);
    const data = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
      version?: number;
    };
    if (!response.ok) {
      setMessage(
        Array.isArray(data.message)
          ? data.message.join(". ")
          : (data.message ?? "Pubblicazione non riuscita."),
      );
      return;
    }
    setNote("");
    setMessage(
      `Versione ${data.version} in vigore dalla prossima valutazione.`,
    );
    onPublished();
  };

  return (
    <section className="pf-panel" aria-label={text.title}>
      <h2>{text.title}</h2>
      <p className="pf-field-hint">{text.hint}</p>
      <p>
        In vigore: <strong>versione {policy.active.version}</strong>,{" "}
        {describe(policy.active)}.
      </p>
      {message && <div className="pf-alert warning">{message}</div>}
      <div className="pf-stack">
        {FIELDS.map((field) => (
          <label className="pf-field" key={field.key}>
            {field.label}
            <input
              className="pf-input"
              type="number"
              value={rule[field.key] ?? ""}
              onChange={(event) =>
                setRule({
                  ...rule,
                  [field.key]:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            />
            <span className="pf-field-hint">{field.hint}</span>
          </label>
        ))}
        <label className="pf-field">
          Nota della versione
          <input
            className="pf-input"
            value={note}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <button
          className="pf-button"
          type="button"
          disabled={saving}
          onClick={() => void publish()}
        >
          {saving ? "Pubblicazione..." : "Pubblica nuova versione"}
        </button>
      </div>
      <details>
        <summary>Storico ({policy.versions.length} versioni)</summary>
        <ul>
          {policy.versions.map((v) => (
            <li key={v.id}>
              v{v.version} · {describe(v)} ·{" "}
              {new Date(v.createdAt).toLocaleDateString("it-IT")}
              {v.createdBy ? ` · ${v.createdBy}` : ""}
              {v.note ? ` · ${v.note}` : ""}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/**
 * Regole di confidence versionate (PF-FS-PREPAYWALL §7.1): nessuna soglia
 * fissa nel codice, ogni modifica è una nuova versione tracciata.
 */
export function ConfidencePolicies() {
  const [policies, setPolicies] = useState<Policy[]>();
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    void secureFetch(URL, { credentials: "include" }).then(async (response) => {
      if (response.ok) setPolicies((await response.json()) as Policy[]);
      else setError("Regole di confidence non disponibili.");
    });
  useEffect(load, []);
  if (error) return <div className="pf-alert warning">{error}</div>;
  return (
    <>
      {policies?.map((policy) => (
        <PolicyForm
          key={`${policy.kind}-${policy.active.version}`}
          policy={policy}
          onPublished={load}
        />
      ))}
    </>
  );
}
