"use client";

import { useState } from "react";
import { ProductShell } from "@/app/components/product-shell";
import { useAdminReport } from "../components/use-admin-report";
import { DiagnosticControl } from "./diagnostic-control";
import { LogDetail } from "./log-detail";
import { Logs, OPERATIONS, STATUS, dateTime, duration } from "./log-model";

export default function AiLogsPage() {
  const [filters, setFilters] = useState({
    days: "7",
    provider: "",
    operation: "",
    status: "",
    pageSize: "25",
    diagnostics: "",
  });
  const [page, setPage] = useState(1);
  const [auto, setAuto] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [id, setId] = useState("");
  const params = new URLSearchParams({ page: String(page) });
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  if (id) params.set("id", id);
  const { data, error, loading, refresh } = useAdminReport<Logs>(
    `/admin/ai-logs?${params}`,
    auto ? 15000 : 0,
  );
  const change = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
    setSelected(null);
  };
  return (
    <ProductShell
      eyebrow="Amministrazione"
      title="Log chiamate AI"
      description="Storico delle operazioni API verso l’AI, con esito completo e singoli tentativi HTTP. Orari di Roma."
      stats={[
        { label: "Operazioni filtrate", value: data?.total ?? "—" },
        { label: "Riuscite", value: data?.counts.SUCCESS ?? (data ? 0 : "—") },
        {
          label: "Errori",
          value: data?.counts.ERROR ?? (data ? 0 : "—"),
          tone: "accent",
        },
        {
          label: "In corso / senza esito",
          value: data
            ? `${data.counts.RUNNING ?? 0} / ${data.counts.INTERRUPTED ?? 0}`
            : "—",
        },
      ]}
    >
      <DiagnosticControl />
      <section className="pf-panel report-filters" aria-label="Filtri log AI">
        <div className="ws-table-tools">
          <label>
            Periodo
            <select
              aria-label="Periodo"
              value={filters.days}
              onChange={(e) => change("days", e.target.value)}
            >
              {[1, 7, 30].map((d) => (
                <option value={d} key={d}>
                  Ultimi {d} giorni
                </option>
              ))}
            </select>
          </label>
          <label>
            Provider
            <select
              aria-label="Provider"
              value={filters.provider}
              onChange={(e) => change("provider", e.target.value)}
            >
              <option value="">Tutti</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="stub">Simulazione</option>
            </select>
          </label>
          <label>
            Operazione
            <select
              aria-label="Operazione"
              value={filters.operation}
              onChange={(e) => change("operation", e.target.value)}
            >
              <option value="">Tutte</option>
              {Object.entries(OPERATIONS).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Esito
            <select
              aria-label="Esito"
              value={filters.status}
              onChange={(e) => change("status", e.target.value)}
            >
              <option value="">Tutti</option>
              {["ERROR", "SUCCESS", "RUNNING", "INTERRUPTED"].map((s) => (
                <option value={s} key={s}>
                  {STATUS[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Acquisizione
            <select
              aria-label="Acquisizione"
              value={filters.diagnostics}
              onChange={(e) => change("diagnostics", e.target.value)}
            >
              <option value="">Tutte</option>
              <option value="true">Con diagnostica integrale</option>
              <option value="false">Solo metadati</option>
            </select>
          </label>
          <button className="ws-control" disabled={loading} onClick={refresh}>
            {loading ? "Aggiornamento…" : "Aggiorna"}
          </button>
          <label className="report-checkbox">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            Aggiornamento ogni 15 s
          </label>
        </div>
        <form
          className="ws-table-tools"
          onSubmit={(e) => {
            e.preventDefault();
            setId(search.trim());
            setPage(1);
            setSelected(null);
          }}
        >
          <label className="ws-search">
            <span>ID</span>
            <input
              aria-label="ID operazione"
              placeholder="ID invocazione AI o processo completo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
            />
          </label>
          <button className="ws-control" type="submit">
            Cerca ID
          </button>
          <button
            className="ws-control"
            type="button"
            onClick={() => {
              setFilters({
                days: "7",
                provider: "",
                operation: "",
                status: "",
                pageSize: "25",
                diagnostics: "",
              });
              setId("");
              setSearch("");
              setPage(1);
              setSelected(null);
            }}
          >
            Azzera filtri
          </button>
        </form>
        <p className="pf-muted">
          Conservazione: 30 giorni. Lo storico inizia con questa versione; le
          chiamate precedenti non sono ricostruibili. Con diagnostica attiva
          include prompt e risposte integrali, escluse soltanto chiavi API e
          credenziali.
        </p>
        <p className="pf-muted" role="status">
          {data
            ? `Aggiornato: ${dateTime(data.generatedAt)} · conteggi riferiti ai filtri selezionati`
            : "Caricamento storico…"}
        </p>
      </section>
      {error && (
        <p role="alert" className="pf-alert warning">
          {error}{" "}
          {data &&
            "I dati mostrati risalgono all’ultimo aggiornamento riuscito."}
        </p>
      )}
      {selected && (
        <LogDetail
          key={selected}
          id={selected}
          auto={auto}
          onClose={() => {
            document.getElementById(`ai-log-${selected}`)?.focus();
            setSelected(null);
          }}
        />
      )}
      <section
        className="pf-panel"
        aria-label="Elenco operazioni AI"
        aria-busy={loading}
      >
        <div
          className="ws-table-scroll"
          tabIndex={0}
          aria-label="Tabella operazioni AI"
        >
          <table className="ws-table">
            <thead>
              <tr>
                <th>Inizio ↓</th>
                <th>Operazione</th>
                <th>Provider / modello</th>
                <th>Esito</th>
                <th>Durata</th>
                <th>Tentativi HTTP</th>
                <th>Output non validi</th>
                <th>Diagnostica</th>
                <th>Dettaglio</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r) => (
                <tr
                  key={r.id}
                  className={selected === r.id ? "is-expanded" : ""}
                >
                  <td>{dateTime(r.startedAt)}</td>
                  <td>
                    <strong>{OPERATIONS[r.operation] ?? r.operation}</strong>
                    <small className="report-id">{r.id.slice(0, 8)}</small>
                  </td>
                  <td>
                    {r.provider ?? "—"}
                    <small>{r.model ?? "Non disponibile"}</small>
                  </td>
                  <td>
                    <span
                      className={`report-status report-status-${r.status.toLowerCase()}`}
                    >
                      {STATUS[r.status] ?? r.status}
                    </span>
                    {r.errorCode && <small>{r.errorCode}</small>}
                  </td>
                  <td>{duration(r.durationMs)}</td>
                  <td>{r._count.attempts}</td>
                  <td>{r.validationFailures}</td>
                  <td>
                    {r.diagnosticsEnabled ? "Integrale" : "Metadati"}
                    {r.contextId && (
                      <small className="report-id" title={r.contextId}>
                        Processo {r.contextId.slice(0, 8)}
                      </small>
                    )}
                  </td>
                  <td>
                    <button
                      className="ws-control"
                      id={`ai-log-${r.id}`}
                      aria-controls="ai-operation-detail"
                      aria-label={`Apri operazione ${r.id}`}
                      aria-expanded={selected === r.id}
                      onClick={() => setSelected(r.id)}
                    >
                      Apri
                    </button>
                  </td>
                </tr>
              ))}
              {!data?.rows.length && (
                <tr>
                  <td colSpan={9} className="ws-no-results">
                    {loading
                      ? "Caricamento…"
                      : error
                        ? "Storico non disponibile."
                        : "Nessuna operazione per questi filtri."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="ws-table-footer">
          <label>
            Righe per pagina
            <select
              aria-label="Righe per pagina"
              value={filters.pageSize}
              onChange={(e) => change("pageSize", e.target.value)}
            >
              {[25, 50, 100].map((n) => (
                <option value={n} key={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span>
            {data
              ? `${data.total} operazioni · pagina ${data.page} di ${data.pages}`
              : "—"}
          </span>
          <div className="ws-page-buttons">
            <button
              className="ws-control"
              disabled={loading || !data || data.page <= 1}
              onClick={() => setPage((data?.page ?? 1) - 1)}
            >
              Precedente
            </button>
            <button
              className="ws-control"
              disabled={loading || !data || data.page >= data.pages}
              onClick={() => setPage((data?.page ?? 1) + 1)}
            >
              Successiva
            </button>
          </div>
        </div>
      </section>
    </ProductShell>
  );
}
