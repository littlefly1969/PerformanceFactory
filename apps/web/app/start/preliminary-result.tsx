import type { DiscoveryConfiguration, DiscoveryDraft } from "./discovery-types";
import { optionsFor, questionValue } from "./discovery-state";

export function PreliminaryResult({
  config,
  draft,
  onContinue,
}: {
  config: DiscoveryConfiguration;
  draft: DiscoveryDraft;
  onContinue: () => void;
}) {
  const rows = config.questions.map((q) => {
    const value = questionValue(draft, q);
    const selected = optionsFor(q, draft).filter((o) =>
      q.type === "boolean"
        ? o.value === value
        : Array.isArray(value)
          ? value.includes(o.id)
          : o.id === value,
    );
    return {
      id: q.id,
      title: q.title,
      target: q.target,
      value: selected.length
        ? selected.map((o) => o.label).join(", ")
        : value !== undefined
          ? String(value)
          : "Non indicato",
    };
  });
  const goal = rows.find((r) => r.target === "goalId");
  return (
    <>
      <section className="pf4-body pf4-result">
        <div className="pf4-highlight">
          <span className="pf4-badge">Profilo preliminare</span>
          <h1>
            Il tuo punto
            <br />
            di partenza.
          </h1>
          <p>
            {rows.find((r) => r.target === "sportId")?.value}
            <br />
            {rows.find((r) => r.target === "specializationId")?.value}
          </p>
          <div className="pf4-highlight-meta">
            Discovery completata · {config.questions.length} passaggi
          </div>
        </div>
        <h2>Da qui puoi migliorare.</h2>
        <p>
          Il tuo obiettivo: <strong>{goal?.value}</strong>. Le tue risposte
          saranno il punto di partenza del prossimo assessment.
        </p>
        <p className="pf4-note">
          Questo è un riepilogo preliminare delle tue risposte, non un
          Performance Index né una previsione di risultato.
        </p>
        <dl className="pf4-profile">
          {rows
            .filter((r) => !r.target)
            .map((row) => (
              <div key={row.id}>
                <dt>{row.title}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
        </dl>
      </section>
      <footer className="pf4-footer">
        <button className="pf4-cta" onClick={onContinue}>
          Continua con il mio assessment
        </button>
      </footer>
    </>
  );
}
