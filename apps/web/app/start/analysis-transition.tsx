import { useEffect, useState, type CSSProperties } from "react";

/**
 * Transizione UX fra l'ultima risposta e il riepilogo: non è una valutazione AI.
 * Con un'analisi server-side la durata diventerà
 * max(DISCOVERY_ANALYSIS_MIN_DURATION_MS, durata dell'elaborazione).
 */
export const DISCOVERY_ANALYSIS_MIN_DURATION_MS = 4000;
const PHASES = [
  { at: 0, text: "Analizziamo le tue risposte…" },
  { at: 1300, text: "Organizziamo il tuo profilo…" },
  { at: 2600, text: "Prepariamo il tuo punto di partenza…" },
];

export function AnalysisTransition() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timers = PHASES.slice(1).map(({ at }, index) =>
      setTimeout(() => setPhase(index + 1), at),
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <section
      className="pf4-body pf4-analysis"
      role="status"
      style={
        {
          "--pf4-analysis-ms": `${DISCOVERY_ANALYSIS_MIN_DURATION_MS}ms`,
        } as CSSProperties
      }
    >
      <h1 key={phase}>{PHASES[phase].text}</h1>
      <div className="pf4-analysis-bar" aria-hidden="true">
        <span />
      </div>
      <ol className="pf4-analysis-steps" aria-hidden="true">
        {PHASES.map(({ text }, index) => (
          <li
            key={text}
            className={
              index < phase ? "is-done" : index === phase ? "is-active" : ""
            }
          >
            {text}
          </li>
        ))}
      </ol>
    </section>
  );
}
