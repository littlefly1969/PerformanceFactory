"use client";
import { useEffect, useRef } from "react";
import { useAdminReport } from "../components/use-admin-report";
import {
  Attempt,
  Operation,
  OPERATIONS,
  STATUS,
  ERRORS,
  VALIDATION,
  dateTime,
  duration,
} from "./log-model";

export function LogDetail({
  id,
  onClose,
  auto,
}: {
  id: string;
  onClose: () => void;
  auto: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const { data, error, loading, refresh } = useAdminReport<
    Operation & { attempts: Attempt[] }
  >(`/admin/ai-logs/${id}`, auto ? 15000 : 0);
  return (
    <section
      className="pf-panel report-detail"
      id="ai-operation-detail"
      aria-label="Dettaglio operazione AI"
      aria-busy={loading}
    >
      <div className="report-heading">
        <h2 ref={heading} tabIndex={-1}>
          Dettaglio operazione
        </h2>
        <div className="ws-page-buttons">
          <button className="ws-control" onClick={refresh} disabled={loading}>
            Aggiorna dettaglio
          </button>
          <button className="ws-control" onClick={onClose}>
            Chiudi dettaglio
          </button>
        </div>
      </div>
      <p className="report-id">{id}</p>
      {error && (
        <p role="alert" className="pf-alert warning">
          {error}
        </p>
      )}
      {!data && loading && <p role="status">Caricamento tentativi…</p>}
      {data && (
        <>
          <dl className="report-metadata">
            <div>
              <dt>Operazione</dt>
              <dd>{OPERATIONS[data.operation] ?? data.operation}</dd>
            </div>
            <div>
              <dt>Esito completo</dt>
              <dd>{STATUS[data.status] ?? data.status}</dd>
            </div>
            <div>
              <dt>Provider / modello</dt>
              <dd>
                {data.provider ?? "Non contattato"} / {data.model ?? "—"}
              </dd>
            </div>
            <div>
              <dt>Durata complessiva</dt>
              <dd>{duration(data.durationMs)}</dd>
            </div>
            <div>
              <dt>Inizio / fine</dt>
              <dd>
                {dateTime(data.startedAt)} /{" "}
                {data.finishedAt ? dateTime(data.finishedAt) : "—"}
              </dd>
            </div>
            <div>
              <dt>Output non validi</dt>
              <dd>{data.validationFailures}</dd>
            </div>
          </dl>
          {!!data.validationCodes?.length && (
            <p>
              <strong>Controlli falliti:</strong>{" "}
              {data.validationCodes.map((c) => VALIDATION[c] ?? c).join(" · ")}
            </p>
          )}
          {data.errorCode && (
            <p className="pf-alert warning">
              {ERRORS[data.errorCode] ?? "Operazione non riuscita."}{" "}
              <code>{data.errorCode}</code>
            </p>
          )}
          {data.status === "INTERRUPTED" && (
            <p className="pf-alert warning">
              Nessun esito registrato da oltre un’ora. Il processo potrebbe
              essere stato interrotto; il risultato non è confermato.
            </p>
          )}
          <h3>Tentativi HTTP ({data.attempts.length})</h3>
          <p className="pf-muted">
            HTTP 200 indica il trasporto riuscito. L’esito completo comprende
            anche lettura e validazione dell’output. I tentativi includono i
            retry di rete e le nuove richieste per output non validi.
          </p>
          <div
            className="ws-table-scroll"
            tabIndex={0}
            aria-label="Tentativi della chiamata"
          >
            <table className="ws-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ora</th>
                  <th>Provider / modello</th>
                  <th>Trasporto</th>
                  <th>HTTP</th>
                  <th>Durata</th>
                </tr>
              </thead>
              <tbody>
                {data.attempts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.sequence}</td>
                    <td>{dateTime(a.startedAt)}</td>
                    <td>
                      {a.provider}
                      <small>{a.model}</small>
                    </td>
                    <td>{STATUS[a.status] ?? a.status}</td>
                    <td>{a.httpStatus ?? "—"}</td>
                    <td>{duration(a.durationMs)}</td>
                  </tr>
                ))}
                {!data.attempts.length && (
                  <tr>
                    <td colSpan={6} className="ws-no-results">
                      {data.provider === "stub"
                        ? "Simulazione locale: nessuna chiamata esterna."
                        : "Nessun tentativo HTTP registrato."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
