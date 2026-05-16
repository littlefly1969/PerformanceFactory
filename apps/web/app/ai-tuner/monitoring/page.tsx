"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProductShell, EmptyState, StatusBadge } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type ReplayRow = {
  id: string;
  athleteLabel: string;
  area: { name: string } | null;
  provider: string;
  model: string;
  status: string;
  totalTokens: number | null;
  createdAt: string;
};
type Aggregate = {
  provider: string;
  model: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};
type Summary = {
  byProvider: Aggregate[];
  replays: Aggregate[];
};

export default function MonitoringPage() {
  const [tab, setTab] = useState<"history" | "costs">("history");
  const [replays, setReplays] = useState<ReplayRow[]>([]);
  const [totalReplays, setTotalReplays] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const load = async () => {
      const [replaysRes, costRes] = await Promise.all([
        secureFetch(`${API_BASE}/ai-tuning/replays?page=1`),
        secureFetch(`${API_BASE}/ai-tuning/cost`),
      ]);
      if (replaysRes.ok) {
        const data = (await replaysRes.json()) as {
          items: ReplayRow[];
          total: number;
        };
        setReplays(data.items);
        setTotalReplays(data.total);
      }
      if (costRes.ok) setSummary((await costRes.json()) as Summary);
    };
    void load();
  }, []);

  const allAggregates = useMemo(
    () => [...(summary?.byProvider ?? []), ...(summary?.replays ?? [])],
    [summary],
  );
  const calls = allAggregates.reduce((sum, item) => sum + item.count, 0);
  const inputTokens = allAggregates.reduce((sum, item) => sum + item.inputTokens, 0);
  const outputTokens = allAggregates.reduce((sum, item) => sum + item.outputTokens, 0);
  const totalTokens = allAggregates.reduce((sum, item) => sum + item.totalTokens, 0);
  const topProvider = allAggregates[0]
    ? `${allAggregates[0].provider} - ${allAggregates[0].model}`
    : "-";

  return (
    <ProductShell
      eyebrow="GESTIONE AI"
      title="Monitoraggio AI"
      description="Consulta lo storico dei test, controlla token, chiamate AI e costi generati."
      stats={[
        { label: "Test salvati", value: totalReplays, tone: "accent" },
        { label: "Chiamate AI", value: calls, tone: "success" },
        { label: "Token totali", value: totalTokens.toLocaleString("it-IT"), tone: "warning" },
      ]}
    >
      <div className="pf-actions" style={{ marginBottom: 18 }}>
        <button
          className={tab === "history" ? "pf-button" : "pf-button-secondary"}
          type="button"
          onClick={() => setTab("history")}
        >
          Storico test
        </button>
        <button
          className={tab === "costs" ? "pf-button" : "pf-button-secondary"}
          type="button"
          onClick={() => setTab("costs")}
        >
          Consumi e costi
        </button>
      </div>

      {tab === "history" ? (
        <section className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Storico test</h2>
              <p className="pf-muted">
                Rivedi i test e i replay gia eseguiti sui prompt.
              </p>
            </div>
            <Link className="pf-button-secondary" href="/ai-tuner/replays">
              Apri storico completo
            </Link>
          </div>
          {!replays.length ? (
            <EmptyState
              title="Nessun test salvato"
              description="Esegui un test su casi reali o standard per popolare lo storico."
            />
          ) : (
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Data test</th>
                  <th>Prompt / caso</th>
                  <th>Provider AI</th>
                  <th>Esito</th>
                  <th>Token</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {replays.slice(0, 10).map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.createdAt).toLocaleString("it-IT")}</td>
                    <td>
                      {item.area?.name ?? "Area"} - {item.athleteLabel}
                    </td>
                    <td>
                      {item.provider} - {item.model}
                    </td>
                    <td>{item.status}</td>
                    <td>{item.totalTokens ?? "-"}</td>
                    <td>
                      <Link
                        className="pf-button-secondary"
                        href={`/ai-tuner/replays/${item.id}`}
                      >
                        Apri dettaglio
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : (
        <section className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Consumi e costi</h2>
              <p className="pf-muted">
                Monitora token utilizzati, numero di chiamate AI, provider e
                costi generati.
              </p>
            </div>
            <Link className="pf-button-secondary" href="/ai-tuner/cost">
              Apri dettaglio costi
            </Link>
          </div>

          <section className="pf-grid" style={{ marginBottom: 18 }}>
            <article className="pf-score-card">
              <span>Token input</span>
              <strong>{inputTokens.toLocaleString("it-IT")}</strong>
            </article>
            <article className="pf-score-card">
              <span>Token output</span>
              <strong>{outputTokens.toLocaleString("it-IT")}</strong>
            </article>
            <article className="pf-score-card">
              <span>Provider piu usato</span>
              <strong>{topProvider}</strong>
            </article>
          </section>

          {!allAggregates.length ? (
            <EmptyState
              title="Nessun consumo disponibile"
              description="I consumi appariranno dopo le prime chiamate AI tracciate."
            />
          ) : (
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Chiamate</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Totale</th>
                  <th>Stima costo</th>
                </tr>
              </thead>
              <tbody>
                {allAggregates.map((row, index) => (
                  <tr key={`${row.provider}-${row.model}-${index}`}>
                    <td>
                      {row.provider} - {row.model}
                    </td>
                    <td>{row.count}</td>
                    <td>{row.inputTokens.toLocaleString("it-IT")}</td>
                    <td>{row.outputTokens.toLocaleString("it-IT")}</td>
                    <td>{row.totalTokens.toLocaleString("it-IT")}</td>
                    <td>
                      <StatusBadge tone="neutral">da tariffario</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </ProductShell>
  );
}
