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
  { upTo: Infinity, label: "Obesità" },
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
  return (
    <>
      <section className="pf4-body pf4-result">
        {/* Fase gratuita del Blueprint (A3/A4): profilo e calibrazione, il programma si sceglie dopo. */}
        <aside className="pf4-offer" aria-label="Come si parte">
          <span className="pf4-kicker">Fase gratuita</span>
          <p className="pf4-offer-title">
            Gratis finché non ti conosciamo abbastanza.
          </p>
          <p>
            Profilo, micro-test e coach AI senza carta, fino alla chiusura della
            calibrazione (al massimo circa 30 giorni).
          </p>
        </aside>
        <h1>Questi sono i tuoi vincoli.</h1>
        <p>
          Ora crea l’account: il tuo profilo parte da qui e si definisce mentre
          ti alleni.
        </p>
        {bmi !== null && band && (
          <div className="pf4-bmi">
            <span className="pf4-kicker">Indice di massa corporea</span>
            <div className="pf4-bmi-value">
              <strong>{bmi.toFixed(1)}</strong>
              <span>{band.label}</span>
            </div>
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
