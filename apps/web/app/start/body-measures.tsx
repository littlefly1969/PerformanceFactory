import type { CSSProperties, Ref } from "react";
import type { DiscoveryQuestion } from "./discovery-types";

/** Valori proposti prima che l'atleta tocchi i cursori. */
const DEFAULTS = { height: 175, weight: 72 };
/** Il righello va da 0 a 230 cm: la figura cresce dal suolo. */
const SCALE_CM = 230;
const GROUND = 236;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function proposedMeasure(question: DiscoveryQuestion, fallback: number) {
  const step = question.step ?? 1;
  const min = question.min ?? 0;
  const value = clamp(fallback, min, question.max ?? Infinity);
  return min + Math.round((value - min) / step) * step;
}

/**
 * Sagoma che segue le misure: l'altezza allunga la figura, il rapporto
 * peso/altezza (BMI) la allarga. È un'illustrazione, non una valutazione.
 */
export function BodyFigure({
  height,
  weight,
}: {
  height: number;
  weight: number;
}) {
  const valid = height > 0 && weight > 0;
  const h = valid ? clamp(height, 100, SCALE_CM) : DEFAULTS.height;
  const bmi = valid ? weight / (h / 100) ** 2 : 23.5;
  const girth = clamp(bmi / 22, 0.72, 1.7);
  const figure = (GROUND - 4) * (h / SCALE_CM);
  const top = GROUND - figure;
  const head = figure * 0.068 * (0.9 + 0.1 * girth);
  const torsoTop = top + head * 2 + figure * 0.02;
  const torsoHeight = figure * 0.36;
  const torsoWidth = figure * 0.2 * girth;
  const arm = figure * 0.052 * girth;
  const legTop = torsoTop + torsoHeight - figure * 0.02;
  const leg = (torsoWidth - figure * 0.012) / 2;
  const center = 65;
  return (
    <svg
      className="pf4-figure"
      viewBox="0 0 130 240"
      aria-hidden="true"
      data-height={h}
      data-girth={girth.toFixed(2)}
    >
      <ellipse cx={center} cy={GROUND} rx={torsoWidth * 0.9} ry="3" />
      <circle cx={center} cy={top + head} r={head} />
      <rect
        x={center - torsoWidth / 2}
        y={torsoTop}
        width={torsoWidth}
        height={torsoHeight}
        rx={Math.min(torsoWidth / 3, 12)}
      />
      {[-1, 1].map((side) => (
        <rect
          key={`arm${side}`}
          x={
            side < 0
              ? center - torsoWidth / 2 - arm - 3
              : center + torsoWidth / 2 + 3
          }
          y={torsoTop + 2}
          width={arm}
          height={figure * 0.38}
          rx={arm / 2}
        />
      ))}
      {[-1, 1].map((side) => (
        <rect
          key={`leg${side}`}
          x={side < 0 ? center - torsoWidth / 2 : center + figure * 0.006}
          y={legTop}
          width={leg}
          height={GROUND - 2 - legTop}
          rx={Math.min(leg / 2, 6)}
        />
      ))}
    </svg>
  );
}

function Measure({
  question,
  label,
  value,
  onChange,
}: {
  question: DiscoveryQuestion;
  label: string;
  value: number;
  onChange: (value: number | null) => void;
}) {
  const min = question.min ?? 0;
  const max = question.max ?? Math.max(min + 100, value * 2);
  const unit = question.ui?.unit ?? "";
  const fill = clamp(((value - min) / (max - min || 1)) * 100, 0, 100);
  return (
    <div className="pf4-measure">
      <label className="pf4-kicker" htmlFor={question.id}>
        {label}
      </label>
      <div className="pf4-measure-value">
        <input
          id={question.id}
          type="number"
          inputMode="decimal"
          min={question.min}
          max={question.max}
          step={question.step ?? 1}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) =>
            // Campo svuotato: null, così non torna la proposta mentre si scrive.
            onChange(e.target.value === "" ? null : e.target.valueAsNumber)
          }
        />
        <span>{unit}</span>
      </div>
      <input
        type="range"
        aria-label={`${label} — cursore`}
        aria-valuetext={`${value} ${unit}`.trim()}
        min={min}
        max={max}
        step={question.step ?? 1}
        value={Number.isFinite(value) ? value : min}
        style={{ "--pf4-fill": `${fill}%` } as CSSProperties}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </div>
  );
}

export function BodyMeasures({
  height,
  weight,
  values,
  valid,
  headingRef,
  onChange,
  onContinue,
}: {
  height: DiscoveryQuestion;
  weight: DiscoveryQuestion;
  values: { height?: unknown; weight?: unknown };
  valid: (values: { height: number; weight: number }) => boolean;
  headingRef: Ref<HTMLHeadingElement>;
  onChange: (question: DiscoveryQuestion, value: number | null) => void;
  onContinue: (values: { height: number; weight: number }) => void;
}) {
  // Senza risposta si mostra una proposta: «Continua» conferma ciò che si vede.
  const shown = {
    height:
      typeof values.height === "number"
        ? values.height
        : values.height === undefined
          ? proposedMeasure(height, DEFAULTS.height)
          : NaN,
    weight:
      typeof values.weight === "number"
        ? values.weight
        : values.weight === undefined
          ? proposedMeasure(weight, DEFAULTS.weight)
          : NaN,
  };
  // Il segno sul righello sta alla quota della testa (viewBox alto 240).
  const crown =
    ((240 -
      GROUND +
      (GROUND - 4) * clamp((shown.height || 0) / SCALE_CM, 0, 1)) /
      240) *
    100;
  return (
    <>
      <section className="pf4-body pf4-measures">
        <h1 ref={headingRef} tabIndex={-1}>
          Quanto sei alto e quanto pesi?
        </h1>
        <p>Serve per calibrare i carichi, non per giudicarti.</p>
        <div className="pf4-measures-grid">
          <div className="pf4-figure-wrap">
            <div className="pf4-ruler" aria-hidden="true">
              <i style={{ bottom: `${crown}%` }} />
            </div>
            <BodyFigure height={shown.height} weight={shown.weight} />
          </div>
          <div>
            <Measure
              question={height}
              label="Altezza"
              value={shown.height}
              onChange={(value) => onChange(height, value)}
            />
            <Measure
              question={weight}
              label="Peso"
              value={shown.weight}
              onChange={(value) => onChange(weight, value)}
            />
          </div>
        </div>
      </section>
      <footer className="pf4-footer">
        <button
          className="pf4-cta"
          disabled={!valid(shown)}
          onClick={() => onContinue(shown)}
        >
          Continua
        </button>
      </footer>
    </>
  );
}
