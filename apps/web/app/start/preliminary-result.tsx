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
  const measure = (key: string) => {
    const q = config.questions.find((q) => q.contextKey === key);
    return q ? Number(questionValue(draft, q)) : NaN;
  };
  const weight = measure("general_weight_kg");
  const height = measure("general_height_cm");
  const bmi = weight > 0 && height > 0 ? weight / (height / 100) ** 2 : null;
  const goal = rows.find((r) => r.target === "goalId");
  return (
    <>
      <section className="pf4-body pf4-result">
        <div className="pf4-highlight">
          <span className="pf4-badge">Il tuo profilo fisico</span>
          <h1>
            Questi sono
            <br />i tuoi vincoli.
          </h1>
          <p>
            {config.sportContext?.mode === "fixed"
              ? config.sportContext.sport.label
              : rows.find((r) => r.target === "sportId")?.value}
            <br />
            {config.sportContext?.mode === "fixed"
              ? config.sportContext.specialization.label
              : rows.find((r) => r.target === "specializationId")?.value}
          </p>
          <div className="pf4-highlight-meta">
            Discovery completata · {config.questions.length} passaggi
          </div>
        </div>
        <h2>Ora serve la misura.</h2>
        {bmi !== null && (
          <div className="pf4-bmi">
            <span className="pf4-kicker">Indice di massa corporea · BMI</span>
            <strong>{bmi.toFixed(1)}</strong>
            <p className="pf4-note">
              Calcolato da peso e altezza dichiarati. È un indicatore
              preliminare, non il tuo Performance Index.
            </p>
          </div>
        )}
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
