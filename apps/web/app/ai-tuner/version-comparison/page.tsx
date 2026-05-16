"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProductShell, EmptyState, StatusBadge } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Run = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  _count: { results: number };
};
type Golden = { id: string; label: string; area?: { name: string } };

const promptOptions = [
  "Validazione obiettivo",
  "Configurazione aree performance",
  "Generazione proposta area",
  "Allenamento specifico",
];
const criteria = [
  "Chiarezza",
  "Coerenza con il profilo atleta",
  "Utilita pratica",
  "Sicurezza",
  "Concretezza",
  "Misurabilita",
  "Coerenza con Performance Factory",
  "Assenza di informazioni inventate",
  "Rispetto dei limiti sanitari / non diagnostici",
];

export default function VersionComparisonPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [goldens, setGoldens] = useState<Golden[]>([]);
  const [prompt, setPrompt] = useState(promptOptions[0]);

  useEffect(() => {
    const load = async () => {
      const [runsRes, goldensRes] = await Promise.all([
        secureFetch(`${API_BASE}/ai-tuning/evaluations`),
        secureFetch(`${API_BASE}/ai-tuning/golden-contexts`),
      ]);
      if (runsRes.ok) setRuns((await runsRes.json()) as Run[]);
      if (goldensRes.ok) setGoldens((await goldensRes.json()) as Golden[]);
    };
    void load();
  }, []);

  return (
    <ProductShell
      eyebrow="GESTIONE AI"
      title="Confronto versioni"
      description="Confronta piu versioni dello stesso prompt su casi standard o reali per capire quale produce i risultati migliori."
      actions={
        <Link className="pf-button" href="/ai-tuner/evaluations">
          Apri confronti esistenti
        </Link>
      }
      stats={[
        { label: "Confronti salvati", value: runs.length, tone: "accent" },
        { label: "Casi disponibili", value: goldens.length, tone: "success" },
      ]}
    >
      <section className="pf-dashboard-grid">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Imposta confronto</h2>
              <p className="pf-muted">
                Usa questa sezione quando devi decidere quale versione
                pubblicare.
              </p>
            </div>
          </div>
          <div className="pf-stack">
            <label className="pf-field">
              Prompt da confrontare
              <select
                className="pf-select"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              >
                {promptOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <div className="pf-field">
              Versioni da confrontare
              <div className="pf-checkbox-grid">
                {[
                  "Versione attiva",
                  "Bozza corrente",
                  "Versione precedente",
                  "Versione duplicata",
                  "Versione sperimentale",
                ].map((item) => (
                  <label key={item} className="pf-checkbox">
                    <input type="checkbox" defaultChecked={item !== "Versione sperimentale"} />
                    {item}
                  </label>
                ))}
              </div>
            </div>
            <div className="pf-field">
              Casi da usare
              <div className="pf-stack compact">
                {goldens.slice(0, 5).map((golden) => (
                  <label key={golden.id} className="pf-checkbox">
                    <input type="checkbox" defaultChecked />
                    {golden.label}
                  </label>
                ))}
                {!goldens.length && (
                  <p className="pf-muted">Crea prima un caso test standard.</p>
                )}
              </div>
            </div>
            <div className="pf-field">
              Criteri di valutazione
              <div className="pf-grid">
                {criteria.map((item) => (
                  <StatusBadge key={item} tone="neutral">
                    {item}
                  </StatusBadge>
                ))}
              </div>
            </div>
            <Link className="pf-button" href="/ai-tuner/evaluations">
              Esegui confronto
            </Link>
          </div>
        </article>

        <aside className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Risultato confronto</h2>
              <p className="pf-muted">
                Dopo l'esecuzione vedrai versione migliore, motivo e versione
                consigliata.
              </p>
            </div>
          </div>
          <table className="pf-table">
            <thead>
              <tr>
                <th>Caso</th>
                <th>Versione migliore</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Principiante con poco tempo</td>
                <td>v2</td>
                <td>Risposta piu pratica e breve</td>
              </tr>
              <tr>
                <td>Intermedio con obiettivo tecnico</td>
                <td>v2</td>
                <td>Migliore coerenza con l'obiettivo</td>
              </tr>
            </tbody>
          </table>
          <div className="pf-actions" style={{ marginTop: 16 }}>
            <StatusBadge tone="success">Versione consigliata: v2</StatusBadge>
            <Link className="pf-button-secondary" href="/ai-tuner/prompts">
              Torna ai prompt
            </Link>
          </div>
        </aside>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Confronti recenti</h2>
            <p className="pf-muted">
              La cronologia completa resta disponibile nella pagina confronti
              esistenti.
            </p>
          </div>
        </div>
        {!runs.length ? (
          <EmptyState
            title="Nessun confronto"
            description="Crea il primo confronto quando hai almeno un caso test."
          />
        ) : (
          <div className="pf-stack">
            {runs.slice(0, 5).map((run) => (
              <Link
                key={run.id}
                className="pf-config-row"
                href={`/ai-tuner/evaluations/${run.id}`}
              >
                <span>
                  <strong>{run.name}</strong>
                  <small>
                    {run.status} - {run._count.results} risultati -{" "}
                    {new Date(run.createdAt).toLocaleDateString("it-IT")}
                  </small>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </ProductShell>
  );
}
