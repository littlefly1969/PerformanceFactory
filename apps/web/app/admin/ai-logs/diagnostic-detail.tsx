"use client";
import { useState } from "react";
import { DiagnosticOperation, dateTime } from "./log-model";
import { RawPayload, downloadDiagnostic } from "./raw-payload";

const PHASES: Record<string, string> = {
  PARSE: "Parsing JSON",
  VALIDATION: "Validazione",
  ERROR: "Errore dell’invocazione",
  BUSINESS: "Errore del processo",
};
export function DiagnosticDetail({ data }: { data: DiagnosticOperation }) {
  const [attemptId, setAttemptId] = useState<string>();
  const [tab, setTab] = useState("exchange");
  const attempt =
    data.attempts.find((a) => a.id === attemptId) ?? data.attempts[0];
  if (!data.diagnosticsEnabled)
    return (
      <p className="pf-alert warning">
        Diagnostica integrale non attiva all’avvio di questa invocazione. Sono
        disponibili solo i metadati; richieste e risposte precedenti non sono
        ricostruibili.
      </p>
    );
  const request = attempt?.request;
  const response = attempt?.response;
  return (
    <section
      className="ai-diagnostic-detail"
      aria-label="Diagnostica integrale invocazione"
    >
      <div className="report-heading">
        <h3>Richiesta, risposta ed errori</h3>
        <button
          className="ws-control"
          onClick={() => downloadDiagnostic(`ai-${data.id}.json`, data)}
        >
          Scarica invocazione completa
        </button>
      </div>
      {data.contextId && (
        <p>
          ID processo: <code className="report-id">{data.contextId}</code>
        </p>
      )}
      <div className="ws-tabs" role="group" aria-label="Sezioni diagnostica">
        {[
          ["exchange", "Scambi HTTP"],
          ["errors", `Errori e controlli (${data.events?.length ?? 0})`],
          ["input", "Input applicativo"],
          ["output", "Risultato elaborato"],
        ].map(([key, title]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {title}
          </button>
        ))}
      </div>
      {tab === "exchange" && (
        <>
          {attempt ? (
            <>
              <div className="ws-table-tools">
                <label className="ws-filter-date">
                  Tentativo HTTP
                  <select
                    aria-label="Tentativo HTTP"
                    value={attempt.id}
                    onChange={(e) => setAttemptId(e.target.value)}
                  >
                    {data.attempts.map((a) => (
                      <option key={a.id} value={a.id}>
                        #{a.sequence} · HTTP {a.httpStatus ?? "—"} ·{" "}
                        {dateTime(a.startedAt)}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="report-status">
                  {attempt.captureState === "CAPTURED"
                    ? "Risposta acquisita integralmente"
                    : attempt.captureState === "PENDING"
                      ? "Risposta in acquisizione: aggiorna il dettaglio"
                      : attempt.captureState === "NO_RESPONSE"
                        ? "Nessuna risposta HTTP ricevuta"
                        : "Acquisizione incompleta o fallita"}
                </span>
              </div>
              <p className="report-id">
                {request?.method ?? "POST"}{" "}
                {request?.url ?? "Endpoint non acquisito"}
              </p>
              <div className="ai-exchange-grid">
                <RawPayload
                  title="Corpo richiesta originale"
                  text={request?.body}
                />
                <RawPayload
                  title="Corpo risposta originale"
                  text={response?.body}
                  empty={
                    response?.captureError ??
                    "Risposta non acquisita o non ricevuta."
                  }
                />
              </div>
              <details>
                <summary>Header e metadati di trasporto</summary>
                <div className="ai-exchange-grid">
                  <RawPayload
                    title="Metadati richiesta"
                    text={
                      request
                        ? JSON.stringify(
                            { ...request, body: undefined },
                            null,
                            2,
                          )
                        : null
                    }
                  />
                  <RawPayload
                    title="Metadati risposta"
                    text={
                      response
                        ? JSON.stringify(
                            { ...response, body: undefined },
                            null,
                            2,
                          )
                        : null
                    }
                  />
                </div>
              </details>
            </>
          ) : (
            <p>
              Nessuna richiesta HTTP per questa invocazione. Consulta input,
              risultato ed errori.
            </p>
          )}
        </>
      )}
      {tab === "errors" && (
        <div className="ai-event-list">
          {data.events?.map((e) => (
            <article key={e.id} className="ai-event">
              <h4>
                {PHASES[e.phase] ?? e.phase} · {dateTime(e.createdAt)}
                {e.attemptSequence ? ` · tentativo #${e.attemptSequence}` : ""}
              </h4>
              <RawPayload
                title={`Dettaglio evento ${e.sequence}`}
                text={JSON.stringify(e.detail, null, 2)}
              />
            </article>
          ))}
          {!data.events?.length && (
            <p>Nessun errore o controllo respinto registrato.</p>
          )}
          {data.errorDetail != null && (
            <RawPayload
              title="Errore finale o del processo"
              text={JSON.stringify(data.errorDetail, null, 2)}
            />
          )}
        </div>
      )}
      {tab === "input" && (
        <RawPayload
          title="Input applicativo completo"
          text={data.invocationInput}
        />
      )}
      {tab === "output" && (
        <RawPayload
          title="Risultato elaborato dal backend"
          text={data.invocationOutput}
          empty="Nessun risultato elaborato disponibile: controlla risposta originale ed errori."
        />
      )}
    </section>
  );
}
