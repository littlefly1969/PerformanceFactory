"use client";

import { useEffect, useState } from "react";
import { ProductShell, EmptyState } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Aggregate = {
  provider: string;
  model: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMsSum?: number;
  durationMsSum?: number;
};

type Recent = {
  id: string;
  createdAt: string;
  provider: string;
  model: string;
  area: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
};

type Summary = {
  byProvider: Aggregate[];
  replays: Aggregate[];
  recent: Recent[];
};

export default function CostPage() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    secureFetch(`${API_BASE}/ai-tuning/cost`).then(async (res) => {
      if (res.ok) setSummary((await res.json()) as Summary);
    });
  }, []);

  if (!summary) {
    return (
      <ProductShell eyebrow="MONITORAGGIO AI" title="Consumi e costi">
        <p>Caricamento…</p>
      </ProductShell>
    );
  }

  return (
    <ProductShell
      eyebrow="MONITORAGGIO AI"
      title="Consumi e costi"
      description="Monitora token utilizzati, numero di chiamate AI, provider e costi generati."
    >
      <div className="pf-stack" style={{ gap: 18 }}>
        <section className="pf-card">
          <h3>Produzione (proposte cicli)</h3>
          {summary.byProvider.length === 0 ? (
            <EmptyState
              title="Nessun dato"
              description="Genera qualche ciclo per popolare il dashboard."
            />
          ) : (
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Provider · Modello</th>
                  <th>Chiamate</th>
                  <th>Input tok</th>
                  <th>Output tok</th>
                  <th>Totale tok</th>
                  <th>Latenza somma (s)</th>
                </tr>
              </thead>
              <tbody>
                {summary.byProvider.map((row) => (
                  <tr key={`${row.provider}-${row.model}`}>
                    <td>
                      {row.provider} · {row.model}
                    </td>
                    <td>{row.count}</td>
                    <td>{row.inputTokens.toLocaleString("it-IT")}</td>
                    <td>{row.outputTokens.toLocaleString("it-IT")}</td>
                    <td>
                      <strong>
                        {row.totalTokens.toLocaleString("it-IT")}
                      </strong>
                    </td>
                    <td>
                      {((row.latencyMsSum ?? 0) / 1000).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="pf-card">
          <h3>Test prompt</h3>
          {summary.replays.length === 0 ? (
            <EmptyState
              title="Nessun test"
              description="Esegui qualche test per popolare questo blocco."
            />
          ) : (
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Provider · Modello</th>
                  <th>Test</th>
                  <th>Input tok</th>
                  <th>Output tok</th>
                  <th>Totale tok</th>
                  <th>Durata somma (s)</th>
                </tr>
              </thead>
              <tbody>
                {summary.replays.map((row) => (
                  <tr key={`r-${row.provider}-${row.model}`}>
                    <td>
                      {row.provider} · {row.model}
                    </td>
                    <td>{row.count}</td>
                    <td>{row.inputTokens.toLocaleString("it-IT")}</td>
                    <td>{row.outputTokens.toLocaleString("it-IT")}</td>
                    <td>
                      <strong>
                        {row.totalTokens.toLocaleString("it-IT")}
                      </strong>
                    </td>
                    <td>
                      {((row.durationMsSum ?? 0) / 1000).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="pf-card">
          <h3>Ultime 100 chiamate (audit)</h3>
          {summary.recent.length === 0 ? (
            <p className="pf-meta">Nessun dato disponibile.</p>
          ) : (
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Area</th>
                  <th>Provider</th>
                  <th>Tot tok</th>
                  <th>Latenza</th>
                </tr>
              </thead>
              <tbody>
                {summary.recent.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString("it-IT")}</td>
                    <td>{r.area ?? "—"}</td>
                    <td>
                      {r.provider} · {r.model}
                    </td>
                    <td>{r.totalTokens ?? "—"}</td>
                    <td>{r.latencyMs != null ? `${r.latencyMs}ms` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </ProductShell>
  );
}
