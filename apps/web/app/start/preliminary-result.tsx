import { visibleQuestions } from "./discovery-branches";
import type { DiscoveryConfiguration, DiscoveryDraft } from "./discovery-types";
import { optionsFor, questionValue } from "./discovery-state";
import { HEIGHT_KEY, WEIGHT_KEY } from "./funnel-screens";
import { oneLine } from "./funnel-question";
import { counterLabel } from "./choice-counter";

const TITLE = "Questi sono i tuoi vincoli.";
const GOAL = "pf4_goal";
const EVENT = "pf4_event";
const EVENT_DATE = "pf4_event_date";
/** Le coppie del riepilogo, da sinistra a destra. */
const SUMMARY = ["pf4_experience", "pf4_frequency", "pf4_limitations", EVENT];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** «2026-12-12» → «12 dic 2026», senza spostamenti di fuso orario. */
const italianDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

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
      code: q.code,
      value: selected.length
        ? selected
            .map((o) => counterLabel(q, optionsFor(q, draft), o.id) ?? o.label)
            .join(", ")
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
  const byCode = (code: string) => rows.find((r) => r.code === code);
  const eventDate = byCode(EVENT_DATE)?.value;
  // Riepilogo della demo PF10 (note di Stefano del 3 novembre): obiettivo,
  // esperienza | frequenza, limitazioni | evento, poi l'indice di massa corporea.
  const demo =
    byCode(GOAL) && SUMMARY.every((code) => byCode(code))
      ? [
          { ...byCode(GOAL)!, title: "Obiettivo" },
          ...SUMMARY.map((code) => {
            const row = byCode(code)!;
            return code === EVENT && eventDate && ISO_DATE.test(eventDate)
              ? { ...row, value: `${row.value} · ${italianDate(eventDate)}` }
              : row;
          }),
        ]
      : undefined;
  const profile = demo ?? [
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
        <h1 {...oneLine(TITLE)}>{TITLE}</h1>
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
      </section>
      <footer className="pf4-footer">
        <button className="pf4-cta" onClick={onContinue}>
          Crea il tuo account
        </button>
      </footer>
    </>
  );
}
