import { visibleQuestions } from "./discovery-branches";
import type { DiscoveryConfiguration, DiscoveryDraft } from "./discovery-types";
import { optionsFor, questionValue } from "./discovery-state";

/** Fasce OMS del BMI; la scala visiva copre l'intervallo 15-40. */
const BMI_SCALE = { min: 15, max: 40 };
const BMI_BANDS = [
  { upTo: 18.5, label: "Sottopeso" },
  { upTo: 25, label: "Normopeso" },
  { upTo: 30, label: "Sovrappeso" },
  { upTo: Infinity, label: "Obesità" },
];
const MEASURES = ["general_height_cm", "general_weight_kg"];

export function PreliminaryResult({
  config,
  draft,
  onContinue,
}: {
  config: DiscoveryConfiguration;
  draft: DiscoveryDraft;
  onContinue: () => void;
}) {
  const questions = visibleQuestions(config.questions, draft);
  const rows = questions.map((q) => {
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
      contextKey: q.contextKey,
      value: selected.length
        ? selected.map((o) => o.label).join(", ")
        : value !== undefined
          ? String(value)
          : "Non indicato",
    };
  });
  const measure = (key: string) => {
    const q = questions.find((q) => q.contextKey === key);
    return q ? Number(questionValue(draft, q)) : NaN;
  };
  const weight = measure("general_weight_kg");
  const height = measure("general_height_cm");
  const bmi = weight > 0 && height > 0 ? weight / (height / 100) ** 2 : null;
  const band = bmi === null ? null : BMI_BANDS.find((b) => bmi < b.upTo)!;
  const sport =
    config.sportContext?.mode === "fixed"
      ? [
          config.sportContext.sport.label,
          config.sportContext.specialization.label,
        ]
      : ["sportId", "specializationId"].map(
          (target) => rows.find((r) => r.target === target)?.value,
        );
  const profile = [
    ...rows
      .filter((r) => r.target === "goalId")
      .map((r) => ({ ...r, title: "Obiettivo" })),
    ...(sport.some(Boolean)
      ? [
          {
            id: "sport",
            title: "Sport",
            value: sport.filter(Boolean).join(" · "),
          },
        ]
      : []),
    // Altezza e peso sono gia rappresentati dal BMI.
    ...rows.filter(
      (r) =>
        !r.target &&
        !(bmi !== null && r.contextKey && MEASURES.includes(r.contextKey)),
    ),
  ];
  return (
    <>
      <section className="pf4-body pf4-result">
        {/* Offerta commerciale: non dipende dalle risposte della discovery. */}
        <aside className="pf4-highlight pf4-offer" aria-label="Offerta">
          <span className="pf4-badge">Premio sbloccato</span>
          <p className="pf4-offer-title">7 giorni gratis</p>
          <p>
            Assessment, programma e analisi dei sei driver.
            <br />
            Tutto sbloccato da subito.
          </p>
          <ul className="pf4-highlight-meta pf4-offer-terms">
            <li>Nessuna carta</li>
            <li>Disdici quando vuoi</li>
          </ul>
        </aside>
        <h1>
          Questi sono <br />i tuoi vincoli.
        </h1>
        <p>
          Ora serve la misura: crea l’account, attiva la prova e fai
          l’assessment sui sei driver.
        </p>
        {bmi !== null && band && (
          <div className="pf4-bmi">
            <span className="pf4-kicker">Indice di massa corporea</span>
            <div className="pf4-bmi-value">
              <strong>{bmi.toFixed(1)}</strong>
              <span>{band.label}</span>
            </div>
            <div className="pf4-bmi-scale" aria-hidden="true">
              {BMI_BANDS.map((b, index) => {
                const from = index ? BMI_BANDS[index - 1].upTo : BMI_SCALE.min;
                return (
                  <span
                    key={b.label}
                    className={b === band ? "is-active" : undefined}
                    style={{ flexGrow: Math.min(b.upTo, BMI_SCALE.max) - from }}
                  />
                );
              })}
              <i
                style={{
                  left: `${Math.min(100, Math.max(0, ((bmi - BMI_SCALE.min) / (BMI_SCALE.max - BMI_SCALE.min)) * 100))}%`,
                }}
              />
            </div>
            <p className="pf4-note">
              Calcolato da peso e altezza dichiarati. È un indicatore
              preliminare, non il tuo Performance Index.
            </p>
          </div>
        )}
        <dl className="pf4-profile">
          {profile.map((row) => (
            <div key={row.id}>
              <dt>{row.title}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="pf4-note">
          Questo è un riepilogo preliminare delle tue risposte, non un
          Performance Index né una previsione di risultato.
        </p>
      </section>
      <footer className="pf4-footer">
        <button className="pf4-cta" onClick={onContinue}>
          Attiva la prova gratuita
        </button>
      </footer>
    </>
  );
}
