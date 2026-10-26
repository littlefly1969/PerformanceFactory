const TICKS = 44;
/** Arco di 270°, aperto in basso: parte da sinistra-basso e gira in senso orario. */
const START_DEG = 135;
const SWEEP_DEG = 270;

function tick(index: number, inner: number, outer: number) {
  const angle =
    ((START_DEG + (SWEEP_DEG * index) / (TICKS - 1)) * Math.PI) / 180;
  const at = (radius: number) => [
    +(100 + radius * Math.cos(angle)).toFixed(2),
    +(100 + radius * Math.sin(angle)).toFixed(2),
  ];
  const [x1, y1] = at(inner);
  const [x2, y2] = at(outer);
  return { x1, y1, x2, y2 };
}

/** Quadrante della risposta numerica: le tacche si accendono fino al valore. */
export function NumberGauge({
  value,
  min,
  max,
  unit,
}: {
  value?: number;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const low = min ?? 0;
  const high = max ?? Math.max(low + 10, (value ?? 0) * 2);
  const ratio =
    value === undefined
      ? -1
      : Math.min(1, Math.max(0, (value - low) / (high - low || 1)));
  const active = ratio < 0 ? -1 : Math.round(ratio * (TICKS - 1));
  return (
    <div className="pf4-gauge" aria-hidden="true">
      <svg viewBox="0 0 200 200">
        {Array.from({ length: TICKS }, (_, index) => (
          <line
            key={index}
            {...(index === active ? tick(index, 62, 82) : tick(index, 70, 80))}
            className={
              index === active ? "is-current" : index < active ? "is-on" : ""
            }
          />
        ))}
      </svg>
      <div className="pf4-gauge-value">
        <strong>{value ?? "—"}</strong>
        {unit && <sup>{unit}</sup>}
      </div>
    </div>
  );
}
