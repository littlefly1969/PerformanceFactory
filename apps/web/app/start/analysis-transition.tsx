import { useEffect, useState } from "react";

/**
 * Transizione UX fra l'ultima risposta e il riepilogo, nella veste della demo
 * PF10: quattro barre che si riempiono una dopo l'altra. Non è una valutazione
 * AI: mette in fila le risposte date (PF-FS-PREPAYWALL, copy onesto). Con
 * un'analisi server-side la durata diventerà
 * max(DISCOVERY_ANALYSIS_MIN_DURATION_MS, durata dell'elaborazione).
 */
export const DISCOVERY_ANALYSIS_MIN_DURATION_MS = 4000;
const ROWS = ["Chi sei", "Vincoli", "Obiettivo", "Misure"];
const TICK_MS = 80;

export function AnalysisTransition() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      const now = Math.min(
        Date.now() - started,
        DISCOVERY_ANALYSIS_MIN_DURATION_MS,
      );
      setElapsed(now);
      if (now >= DISCOVERY_ANALYSIS_MIN_DURATION_MS) clearInterval(timer);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const slice = DISCOVERY_ANALYSIS_MIN_DURATION_MS / ROWS.length;
  return (
    <section className="pf4-body pf4-plain pf4-analysis" role="status">
      <h1>Analizziamo le tue risposte…</h1>
      <ol className="pf4-analysis-rows">
        {ROWS.map((label, index) => {
          const pct = Math.round(
            Math.min(1, Math.max(0, (elapsed - index * slice) / slice)) * 100,
          );
          return (
            <li key={label}>
              <div>
                <span>{label}</span>
                <small aria-hidden="true">{pct}%</small>
              </div>
              <b aria-hidden="true">
                <i style={{ width: `${pct}%` }} />
              </b>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
