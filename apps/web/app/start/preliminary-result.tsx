import { visibleQuestions } from "./discovery-branches";
import type { DiscoveryConfiguration, DiscoveryDraft } from "./discovery-types";
import { optionsFor, questionValue } from "./discovery-state";
import { HEIGHT_KEY, WEIGHT_KEY } from "./funnel-screens";

/** Fasce OMS del BMI; la scala visiva copre l'intervallo 15-40. */
const BMI_SCALE = { min: 15, max: 40 };
const BMI_BANDS = [
  { upTo: 18.5, label: "Sottopeso" },
  { upTo: 25, label: "Nella norma" },
  { upTo: 30, label: "Sovrappeso" },
  { upTo: Infinity, label: "Oltre la norma" },
];
const MEASURES = [HEIGHT_KEY, WEIGHT_KEY];
/** Tacche sotto la scala BMI. */
const BMI_TICKS = [15, 25, 40];
const bmiPosition = (value: number) =>
  Math.min(
    100,
    Math.max(
      0,
      ((value - BMI_SCALE.min) / (BMI_SCALE.max - BMI_SCALE.min)) * 100,
    ),
  );

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
      title: q.ui?.summaryLabel ?? q.title,
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
  const weight = measure(WEIGHT_KEY);
  const height = measure(HEIGHT_KEY);
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
  // Riepilogo della demo PF10: l'obiettivo in evidenza, poi le altre risposte.
  const [lead, ...others] = profile;
  return (
    <>
      <section className="pf4-body pf4-result pf4-summary">
        <p className="pf4-kicker">Il tuo punto di partenza</p>
        <h1>Questi sono i tuoi vincoli.</h1>
        <dl className="pf4-tiles">
          {[lead, ...others].filter(Boolean).map((row, index) => (
            <div
              key={row.id}
              className={`pf4-tile${index === 0 ? " is-lead is-wide" : ""}`}
              style={{ animationDelay: `${(0.15 + index * 0.07).toFixed(2)}s` }}
            >
              <dt>{row.title}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
          {bmi !== null && band && (
            <div
              className="pf4-tile pf4-tile-bmi is-wide"
              style={{
                animationDelay: `${(0.15 + profile.length * 0.07).toFixed(2)}s`,
              }}
            >
              <dt className="pf4-tile-head">
                Indice di massa corporea
                <span>{band.label}</span>
              </dt>
              <dd>
                <strong>{bmi.toFixed(1)}</strong>
                <div className="pf4-bmi-scale" aria-hidden="true">
                  <i style={{ left: `${bmiPosition(bmi)}%` }} />
                </div>
                <div className="pf4-bmi-ticks" aria-hidden="true">
                  {BMI_TICKS.map((tick) => (
                    <span key={tick} style={{ left: `${bmiPosition(tick)}%` }}>
                      {tick}
                    </span>
                  ))}
                </div>
              </dd>
            </div>
          )}
        </dl>
        {/* Fase gratuita del Blueprint (A3/A4): profilo e calibrazione, il programma si sceglie dopo. */}
        <aside className="pf4-free" aria-label="Come si parte">
          <span aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0B0B0C"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3.5" y="9" width="17" height="11" rx="2" />
              <path d="M12 9v11M3.5 13h17M12 9c-1.5-3-5-3.5-5-1.2C7 9 12 9 12 9zM12 9c1.5-3 5-3.5 5-1.2C17 9 12 9 12 9z" />
            </svg>
          </span>
          <p>
            Gratis finché non ti conosciamo abbastanza
            <small>Senza carta · al massimo circa 30 giorni</small>
          </p>
        </aside>
        <p className="pf4-note">
          Riepilogo preliminare delle tue risposte: il BMI viene da peso e
          altezza dichiarati e non è il tuo Performance Index.
        </p>
      </section>
      <footer className="pf4-footer">
        <button className="pf4-cta" onClick={onContinue}>
          Crea il tuo account
        </button>
      </footer>
    </>
  );
}
