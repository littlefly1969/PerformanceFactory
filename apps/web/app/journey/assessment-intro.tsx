import { minutesInWords, questionsInWords } from "./italian-number";
import type { Journey } from "./journey-types";

/** Tappe del Blueprint dopo l'assessment: testo statico, nessuna durata promessa. */
const UNLOCKED_LATER = [
  "Livello stimato sui sei driver",
  "Scenari a 3, 6 e 12 mesi",
  "Programma e coaching",
];

/** Intro PF5 dopo i consensi: nome e numeri arrivano dal backend. */
export function AssessmentIntro({
  journey,
  busy,
  onStart,
}: {
  journey: Journey;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <>
      <section className="pf4-body pf5-intro">
        <div className="pf4-highlight pf5-intro-card">
          <div className="pf5-trial">
            <span className="pf4-badge">Percorso gratuito</span>
          </div>
          <h1>{journey.firstName ? `Ciao ${journey.firstName}.` : "Ciao."}</h1>
          <p>
            Prima di programmare qualcosa misuriamo dove sei:{" "}
            {questionsInWords(journey.count)},{" "}
            {minutesInWords(journey.estimatedMinutes)}.
          </p>
          <button
            className="pf4-cta pf5-intro-cta"
            disabled={busy}
            onClick={onStart}
          >
            <span>
              {busy ? "Prepariamo le domande…" : "Scopri la tua performance"}
            </span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
      <section className="pf4-body pf5-locked" aria-labelledby="pf5-locked">
        <h2 id="pf5-locked" className="pf4-kicker">
          Cosa si attiva dopo
        </h2>
        <ul>
          {UNLOCKED_LATER.map((item) => (
            <li key={item}>
              <span>{item}</span>
              <span className="pf5-locked-tag">Bloccato</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
