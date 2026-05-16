"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProductShell, EmptyState } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Run = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  goldenContextIds: string[];
  _count: { results: number };
};

type Golden = {
  id: string;
  label: string;
  area: { id: string; name: string };
};

type Variant = {
  label: string;
  initialContext: string;
  responseFormatPrompt: string;
};

export default function EvaluationsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [goldens, setGoldens] = useState<Golden[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [selectedGoldens, setSelectedGoldens] = useState<string[]>([]);
  const [variants, setVariants] = useState<Variant[]>([
    { label: "v1", initialContext: "", responseFormatPrompt: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const [resR, resG] = await Promise.all([
      secureFetch(`${API_BASE}/ai-tuning/evaluations`),
      secureFetch(`${API_BASE}/ai-tuning/golden-contexts`),
    ]);
    if (resR.ok) setRuns((await resR.json()) as Run[]);
    if (resG.ok) setGoldens((await resG.json()) as Golden[]);
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => clearInterval(interval);
  }, [load]);

  const toggleGolden = (id: string) => {
    setSelectedGoldens((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const updateVariant = (idx: number, patch: Partial<Variant>) => {
    setVariants((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
    );
  };

  const addVariant = () => {
    setVariants((prev) => [
      ...prev,
      {
        label: `v${prev.length + 1}`,
        initialContext: "",
        responseFormatPrompt: "",
      },
    ]);
  };

  const removeVariant = (idx: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (!name.trim() || selectedGoldens.length === 0 || variants.length === 0) {
      alert("Nome, casi test e almeno una versione sono obbligatori");
      return;
    }
    setSubmitting(true);
    const body = {
      name: name.trim(),
      goldenContextIds: selectedGoldens,
      variants: variants.map((v) => ({
        label: v.label,
        initialContext: v.initialContext || undefined,
        responseFormatPrompt: v.responseFormatPrompt || undefined,
      })),
    };
    const res = await secureFetch(`${API_BASE}/ai-tuning/evaluations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (res.ok) {
      setCreating(false);
      setName("");
      setSelectedGoldens([]);
      setVariants([{ label: "v1", initialContext: "", responseFormatPrompt: "" }]);
      void load();
    } else {
      alert("Errore creazione run");
    }
  };

  return (
    <ProductShell
      eyebrow="CONFRONTO VERSIONI"
      title="Confronti versioni"
      description="Confronta piu versioni di prompt su diversi casi per scegliere quella migliore."
      actions={
        <button
          type="button"
          className="pf-button"
          onClick={() => setCreating(!creating)}
        >
          {creating ? "Annulla" : "Nuovo confronto"}
        </button>
      }
    >
      <div className="pf-stack" style={{ gap: 16 }}>
        {creating && (
          <section className="pf-card">
            <h3>Nuovo confronto</h3>
            <label className="pf-field">
              Nome
              <input
                className="pf-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="pf-field">
              <strong>Casi test standard da usare</strong>
              {goldens.length === 0 && (
                <p className="pf-meta">
                  Crea prima qualche caso test standard.
                </p>
              )}
              <div className="pf-stack" style={{ gap: 4 }}>
                {goldens.map((g) => (
                  <label key={g.id} className="pf-row" style={{ gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={selectedGoldens.includes(g.id)}
                      onChange={() => toggleGolden(g.id)}
                    />
                    <span>
                      {g.label}{" "}
                      <span className="pf-meta">({g.area.name})</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="pf-field">
              <strong>Versioni di prompt</strong>
              <p className="pf-meta">
                Lascia vuoto un campo per usare quello corrente dell&apos;area
                config.
              </p>
              <div className="pf-stack" style={{ gap: 8 }}>
                {variants.map((v, idx) => (
                  <div key={idx} className="pf-card" style={{ padding: 12 }}>
                    <div className="pf-row" style={{ gap: 8 }}>
                      <input
                        className="pf-input"
                        placeholder="Etichetta (es. v1)"
                        value={v.label}
                        onChange={(e) =>
                          updateVariant(idx, { label: e.target.value })
                        }
                        style={{ maxWidth: 160 }}
                      />
                      {variants.length > 1 && (
                        <button
                          type="button"
                          className="pf-button-secondary"
                          onClick={() => removeVariant(idx)}
                        >
                          Rimuovi
                        </button>
                      )}
                    </div>
                    <textarea
                      className="pf-input"
                      placeholder="Initial context (vuoto = usa quello corrente)"
                      rows={5}
                      value={v.initialContext}
                      onChange={(e) =>
                        updateVariant(idx, { initialContext: e.target.value })
                      }
                    />
                    <textarea
                      className="pf-input"
                      placeholder="Response format prompt (vuoto = usa quello corrente)"
                      rows={4}
                      value={v.responseFormatPrompt}
                      onChange={(e) =>
                        updateVariant(idx, {
                          responseFormatPrompt: e.target.value,
                        })
                      }
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="pf-button-secondary"
                  onClick={addVariant}
                >
                  Aggiungi variante
                </button>
              </div>
            </div>
            <div className="pf-form-actions">
            <button
              type="button"
              className="pf-button"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? "Avvio…" : "Lancia run"}
            </button>
            </div>
          </section>
        )}

        {runs.length === 0 && !creating && (
          <EmptyState
            title="Nessuna run"
            description="Crea una nuova valutazione per iniziare."
          />
        )}
        {runs.length > 0 && (
          <div className="pf-card">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Status</th>
                  <th>Casi</th>
                  <th>Risultati</th>
                  <th>Creata</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.status}</td>
                    <td>{r.goldenContextIds.length}</td>
                    <td>{r._count.results}</td>
                    <td>{new Date(r.createdAt).toLocaleString("it-IT")}</td>
                    <td>
                      <Link
                        className="pf-button-secondary"
                        href={`/ai-tuner/evaluations/${r.id}`}
                      >
                        Apri
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ProductShell>
  );
}
