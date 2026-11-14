"use client";

import { useCallback, useEffect, useState } from "react";
import { ProductShell } from "@/app/components/product-shell";
import { adminRequest } from "../components/admin-request";

type Config = {
  realWeight: number;
  potentialWeight: number;
  pf1Min: number;
  pf2Min: number;
  pf3Min: number;
};
type AdminRanking = {
  config: Config;
  defaults: Config;
  ranked: number;
  bands: { code: string; text: string; min: number; size: number }[];
  changes: {
    id: string;
    before: Config | null;
    after: Config;
    createdAt: string;
    actor: string | null;
  }[];
};

const THRESHOLDS = [
  ["pf1Min", "PF1 da"],
  ["pf2Min", "PF2 da"],
  ["pf3Min", "PF3 da"],
] as const;

const summary = (c: Config) =>
  `${c.realWeight}/${c.potentialWeight} · soglie ${c.pf1Min} / ${c.pf2Min} / ${c.pf3Min}`;

/**
 * Ranking PF1-PF4: pesi di reale e potenziale e soglie delle fasce. Il
 * punteggio è 0-100 (reale e potenziale riportati sulla scala 0-100); sotto
 * la soglia di PF3 si è in PF4. Ogni salvataggio resta nello storico.
 */
export default function AdminRankingPage() {
  const [data, setData] = useState<AdminRanking>();
  const [draft, setDraft] = useState<Config>();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setMessage(null);
    try {
      const next = await adminRequest<AdminRanking>("/admin/ranking");
      setData(next);
      setDraft(next.config);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (config: Config) => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await adminRequest<AdminRanking>(
        "/admin/ranking/config",
        "PUT",
        config,
      );
      setData(next);
      setDraft(next.config);
      setMessage("Configurazione salvata: il ranking usa i nuovi valori.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const set = (key: keyof Config, value: string) => {
    if (!draft) return;
    const n = Number(value);
    // I due pesi restano complementari: si scrive il reale, il potenziale segue.
    if (key === "realWeight")
      setDraft({ ...draft, realWeight: n, potentialWeight: 100 - n });
    else if (key === "potentialWeight")
      setDraft({ ...draft, potentialWeight: n, realWeight: 100 - n });
    else setDraft({ ...draft, [key]: n });
  };

  return (
    <ProductShell
      eyebrow="Amministrazione"
      title="Ranking PF1–PF4"
      description="La fascia dipende da un punteggio 0-100: media pesata di reale (R globale) e potenziale dell’orizzonte pagato. Qui cambi i pesi e le soglie delle fasce."
      actions={
        <button className="pf-button-secondary" type="button" onClick={load}>
          Aggiorna
        </button>
      }
      stats={
        data
          ? [
              { label: "In classifica", value: data.ranked, tone: "accent" },
              ...data.bands.map((b) => ({
                label: b.code,
                value: b.size,
                tone: "neutral" as const,
              })),
            ]
          : []
      }
    >
      {message && <div className="pf-alert warning">{message}</div>}
      {draft && data && (
        <section className="pf-dashboard-grid">
          <article className="pf-panel">
            <div className="pf-panel-header">
              <h2>Pesi e soglie</h2>
            </div>
            <form
              className="pf-stack"
              onSubmit={(event) => {
                event.preventDefault();
                void save(draft);
              }}
            >
              <label className="pf-field">
                Peso del reale (%)
                <input
                  className="pf-input"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  required
                  value={draft.realWeight}
                  onChange={(e) => set("realWeight", e.target.value)}
                />
              </label>
              <label className="pf-field">
                Peso del potenziale (%)
                <input
                  className="pf-input"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  required
                  value={draft.potentialWeight}
                  onChange={(e) => set("potentialWeight", e.target.value)}
                />
              </label>
              {THRESHOLDS.map(([key, label]) => (
                <label className="pf-field" key={key}>
                  {label} (punteggio 0-100)
                  <input
                    className="pf-input"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    required
                    value={draft[key]}
                    onChange={(e) => set(key, e.target.value)}
                  />
                </label>
              ))}
              <p className="pf-muted">Sotto la soglia di PF3 si è in PF4.</p>
              <div className="pf-card-top">
                <button className="pf-button" type="submit" disabled={busy}>
                  Salva
                </button>
                <button
                  className="pf-button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void save(data.defaults)}
                >
                  Ripristina {summary(data.defaults)}
                </button>
              </div>
            </form>
          </article>
          <article className="pf-panel">
            <div className="pf-panel-header">
              <h2>Fasce di oggi</h2>
            </div>
            <ul className="pf-stack">
              {data.bands.map((b) => (
                <li className="pf-card-top" key={b.code}>
                  <span>
                    <strong>{b.code}</strong> · {b.text}
                  </span>
                  <span className="pf-muted">
                    da {b.min} · {b.size} atleti
                  </span>
                </li>
              ))}
            </ul>
          </article>
          <article className="pf-panel">
            <div className="pf-panel-header">
              <h2>Storico</h2>
            </div>
            {data.changes.length ? (
              <ul className="pf-stack">
                {data.changes.map((c) => (
                  <li key={c.id} className="pf-muted">
                    {new Date(c.createdAt).toLocaleString("it-IT")} ·{" "}
                    {c.actor ?? "account cancellato"}:{" "}
                    {c.before ? summary(c.before) : "valori iniziali"} →{" "}
                    {summary(c.after)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pf-muted">
                Nessuna modifica: valgono i valori di partenza{" "}
                {summary(data.defaults)}.
              </p>
            )}
          </article>
        </section>
      )}
    </ProductShell>
  );
}
