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

/** Arto affusolato con estremità arrotondate, da (x1, y1) a (x2, y2). */
function limb(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  from: number,
  to: number,
) {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / length;
  const ny = (x2 - x1) / length;
  const f = (n: number) => n.toFixed(2);
  const a = [x1 + nx * from, y1 + ny * from];
  const b = [x2 + nx * to, y2 + ny * to];
  const c = [x2 - nx * to, y2 - ny * to];
  const d = [x1 - nx * from, y1 - ny * from];
  return (
    `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}` +
    `A${f(to)} ${f(to)} 0 0 0 ${f(c[0])} ${f(c[1])}` +
    `L${f(d[0])} ${f(d[1])}` +
    `A${f(from)} ${f(from)} 0 0 0 ${f(a[0])} ${f(a[1])}Z`
  );
}

/**
 * Sagoma stilizzata che segue le misure: l'altezza allunga la figura, il
 * rapporto peso/altezza (BMI) allarga busto e arti. È un'illustrazione, non
 * una valutazione.
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
  const c = 65;
  const at = (ratio: number) => top + figure * ratio;
  const f = (n: number) => n.toFixed(2);
  // Proporzioni di una figura di circa 7,5 teste; le spalle crescono meno.
  const head = figure * 0.064;
  const shoulder = figure * 0.118 * (0.82 + 0.18 * girth);
  const waist = figure * 0.074 * girth;
  const hip = figure * 0.088 * (0.6 + 0.4 * girth);
  const neck = figure * 0.026 * (0.85 + 0.15 * girth);
  const yNeck = at(0.12);
  const yShoulder = at(0.175);
  const yWaist = at(0.4);
  const yHip = at(0.5);
  const round = figure * 0.05;
  const torso =
    `M${f(c - neck)} ${f(yNeck)}L${f(c + neck)} ${f(yNeck)}` +
    `L${f(c + neck)} ${f(yShoulder - round * 0.6)}` +
    `Q${f(c + shoulder)} ${f(yShoulder - round * 0.6)} ${f(c + shoulder)} ${f(yShoulder + round)}` +
    `Q${f(c + shoulder * 0.98)} ${f((yShoulder + yWaist) / 2)} ${f(c + waist)} ${f(yWaist)}` +
    `Q${f(c + hip * 1.04)} ${f((yWaist + yHip) / 2)} ${f(c + hip)} ${f(yHip)}` +
    `L${f(c - hip)} ${f(yHip)}` +
    `Q${f(c - hip * 1.04)} ${f((yWaist + yHip) / 2)} ${f(c - waist)} ${f(yWaist)}` +
    `Q${f(c - shoulder * 0.98)} ${f((yShoulder + yWaist) / 2)} ${f(c - shoulder)} ${f(yShoulder + round)}` +
    `Q${f(c - shoulder)} ${f(yShoulder - round * 0.6)} ${f(c - neck)} ${f(yShoulder - round * 0.6)}Z`;
  const arm = figure * 0.03 * (0.8 + 0.2 * girth);
  const leg = hip * 0.5;
  const foot = GROUND - 2;
  return (
    <svg
      className="pf4-figure"
      viewBox="0 0 130 240"
      aria-hidden="true"
      data-height={h}
      data-girth={girth.toFixed(2)}
    >
      <ellipse cx={c} cy={GROUND} rx={hip * 1.5} ry="3" />
      <circle cx={c} cy={top + head} r={head} />
      <path d={torso} />
      {[-1, 1].map((side) => (
        <path
          key={`arm${side}`}
          d={limb(
            c + side * (shoulder - arm * 1.1),
            yShoulder + round * 0.9,
            c + side * (shoulder + figure * 0.035),
            at(0.5),
            arm,
            arm * 0.72,
          )}
        />
      ))}
      {[-1, 1].map((side) => (
        <path
          key={`leg${side}`}
          d={limb(
            c + side * (hip - leg),
            yHip - leg * 0.4,
            c + side * (leg * 0.9),
            foot - leg * 0.5,
            leg,
            leg * 0.55,
          )}
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
          style={
            {
              "--pf4-digits": `${Math.max(2, String(Number.isFinite(value) ? value : "").length) + 0.2}ch`,
            } as CSSProperties
          }
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
      <section className="pf4-body pf4-plain pf4-measures">
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
