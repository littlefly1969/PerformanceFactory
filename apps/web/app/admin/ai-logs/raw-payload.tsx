"use client";
import { useState } from "react";

export function downloadDiagnostic(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
export function RawPayload({
  title,
  text,
  empty = "Dato non acquisito.",
}: {
  title: string;
  text: string | null | undefined;
  empty?: string;
}) {
  const [pretty, setPretty] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [status, setStatus] = useState("");
  let view = text;
  if (pretty && text) {
    try {
      view = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      /* Keep malformed text verbatim. */
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text ?? "");
      setStatus("Testo originale copiato");
    } catch {
      setStatus("Copia non disponibile: seleziona il testo nel riquadro.");
    }
  }
  return (
    <section className="ai-payload" aria-label={title}>
      <div className="ai-payload-toolbar">
        <h4>{title}</h4>
        <div className="ws-page-buttons">
          <button
            className="ws-control"
            onClick={() => setPretty(!pretty)}
            aria-pressed={pretty}
          >
            {pretty ? "Vista leggibile" : "Testo originale"}
          </button>
          <button
            className="ws-control"
            onClick={() => setWrap(!wrap)}
            aria-pressed={wrap}
          >
            A capo
          </button>
          <button
            className="ws-control"
            onClick={() => void copy()}
            disabled={text == null}
          >
            Copia originale
          </button>
        </div>
      </div>
      <p className="pf-muted">
        {text == null
          ? empty
          : `${text.length.toLocaleString("it-IT")} caratteri · contenuto integrale, escluse le credenziali`}
      </p>
      <pre
        tabIndex={0}
        className={wrap ? "is-wrapped" : ""}
        aria-label={`Contenuto ${title}`}
      >
        {view ?? empty}
      </pre>
      {status && <p role="status">{status}</p>}
    </section>
  );
}
