"use client";
import { useState } from "react";
import { useAdminReport } from "../components/use-admin-report";
import { adminRequest } from "../components/admin-request";
import { dateTime } from "./log-model";

type Control = {
  enabled: boolean;
  captureEnabled?: boolean;
  updatedAt: string | null;
  updatedById: string | null;
  changes: {
    id: string;
    enabled: boolean;
    actorId: string;
    createdAt: string;
  }[];
  writer: {
    pendingWrites: number;
    pendingCaptures: number;
    lastFailureAt: string | null;
  };
};
export function DiagnosticControl() {
  const { data, error, loading, refresh } = useAdminReport<Control>(
    "/admin/ai-logs/configuration",
    10000,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  async function toggle() {
    if (!data) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await adminRequest("/admin/ai-logs/configuration", "PATCH", {
        enabled: !data.enabled,
      });
      setMessage(
        data.enabled
          ? "Registrazione integrale disattivata per le nuove invocazioni."
          : "Registrazione integrale attivata per le nuove invocazioni.",
      );
      refresh();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Impossibile modificare la diagnostica.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="pf-panel ai-diagnostic-control"
      aria-label="Controllo diagnostica AI"
    >
      <div className="report-heading">
        <div>
          <h2>Diagnostica integrale</h2>
          <p className="pf-muted">
            Richieste e risposte complete per analisi e tuning. Gestione e
            consultazione riservate agli amministratori.
          </p>
        </div>
        <button
          className="ws-control"
          onClick={() => void toggle()}
          disabled={!data || loading || busy}
          aria-pressed={data?.enabled ?? false}
        >
          {busy
            ? "Salvataggio…"
            : data?.enabled
              ? "Disabilita log completi"
              : "Abilita log completi"}
        </button>
      </div>
      <p>
        <strong
          className={`report-status ${data?.enabled && data.captureEnabled !== false ? "report-status-success" : ""}`}
        >
          {data
            ? data.enabled
              ? data.captureEnabled === false
                ? "ACQUISIZIONE SOSPESA"
                : "ATTIVA"
              : "DISATTIVA"
            : "Stato non disponibile"}
        </strong>{" "}
        Prompt, contesto, schema, scambi HTTP, risultato elaborato e dettagli
        degli errori sono conservati per 30 giorni. Vengono rimossi soltanto
        chiavi API e credenziali.
      </p>
      <p className="pf-muted">
        La scelta si applica alle nuove invocazioni; sulle altre istanze può
        richiedere fino a 5 secondi. Lo storico precedente non può essere
        ricostruito. Se la verifica dello stato non riesce, la cattura completa
        per le nuove invocazioni si arresta; la verifica vale al massimo 10
        secondi. Un’invocazione già avviata mantiene la modalità iniziale.
      </p>
      {error && (
        <p role="alert" className="pf-alert warning">
          {error}{" "}
          <button className="ws-control" onClick={refresh}>
            Riprova stato
          </button>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {data?.writer?.lastFailureAt && (
        <p role="alert" className="pf-alert warning">
          Ultimo problema di persistenza: {dateTime(data.writer.lastFailureAt)}.
          Lo storico può essere incompleto; richieste AI non bloccate.
        </p>
      )}
      {data && (
        <details>
          <summary>Stato scritture e ultime modifiche</summary>
          <p className="pf-muted">
            Scritture in attesa: {data.writer?.pendingWrites ?? 0} · risposte in
            acquisizione: {data.writer?.pendingCaptures ?? 0}
          </p>
          <div className="ws-table-scroll">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Ora</th>
                  <th>Diagnostica</th>
                  <th>Amministratore</th>
                </tr>
              </thead>
              <tbody>
                {data.changes?.map((c) => (
                  <tr key={c.id}>
                    <td>{dateTime(c.createdAt)}</td>
                    <td>{c.enabled ? "Attivata" : "Disattivata"}</td>
                    <td className="report-id">{c.actorId}</td>
                  </tr>
                ))}
                {!data.changes?.length && (
                  <tr>
                    <td colSpan={3}>Nessuna modifica registrata.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
