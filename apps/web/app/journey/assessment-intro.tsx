import type { Journey } from "./journey-types";

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Intro PF5 dopo i consensi: numeri e giorni arrivano dal backend. */
export function AssessmentIntro({
  journey,
  busy,
  onStart,
}: {
  journey: Journey;
  busy: boolean;
  onStart: () => void;
}) {
  const daysLeft = journey.trial?.daysLeft;
  return (
    <section className="pf4-body pf5-intro">
      <span className="pf4-badge pf5-trial">
        Prova gratuita attiva
        {daysLeft !== undefined &&
          ` · ${plural(daysLeft, "giorno rimasto", "giorni rimasti")}`}
      </span>
      <h1>{journey.firstName ? `Ciao ${journey.firstName}.` : "Ciao."}</h1>
      <p className="pf5-intro-lead">
        Prima di programmare qualcosa
        <br />
        misuriamo dove sei:{" "}
        <strong>
          {plural(journey.count, "domanda", "domande")}, circa{" "}
          {plural(journey.estimatedMinutes, "minuto", "minuti")}.
        </strong>
      </p>
      <button className="pf4-cta" disabled={busy} onClick={onStart}>
        {busy ? "Prepariamo le domande…" : "Scopri la tua performance"}
      </button>
      <ul className="pf5-intro-points">
        <li>
          <strong>Disponibilità</strong>
          Giorni e tempo che puoi dedicare: diventano i vincoli del tuo
          programma.
        </li>
        <li>
          <strong>Driver della performance</strong>
          Come stai oggi, driver per driver, nel tuo sport.
        </li>
        <li>
          <strong>Il tuo punto di partenza</strong>
          Una misura, non un giudizio: rispondi con sincerità.
        </li>
      </ul>
    </section>
  );
}
