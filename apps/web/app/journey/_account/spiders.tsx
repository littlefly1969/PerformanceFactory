/** Spider dell'area atleta: grande nel profilo, piccolo nelle schede. */
type Scale = { min: number; max: number };

const point = (
  center: number,
  radius: number,
  index: number,
  count: number,
  ratio: number,
  clamp = true,
) => {
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  const r = (clamp ? Math.max(0, Math.min(1, ratio)) : ratio) * radius;
  return {
    x: center + Math.cos(angle) * r,
    y: center + Math.sin(angle) * r,
  };
};

const polygon = (center: number, radius: number, ratios: number[], dx = 0) =>
  ratios
    .map((ratio, i) => {
      const p = point(center, radius, i, ratios.length, ratio);
      return `${(p.x + dx).toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");

const ratioOf = (value: number, scale: Scale) =>
  (value - scale.min) / (scale.max - scale.min || 1);

export type SpiderAxis = {
  id: string;
  label: string;
  value: number | null;
  /** Confidenza del driver: dove sappiamo meno, il punto è più tenue. */
  confidence?: number;
};

/**
 * Spider del profilo con le sei aree e il valore sotto ogni etichetta.
 * Senza valori resta l'esagono vuoto; provvisorio, il tratto è tratteggiato.
 */
export function ProfileSpider({
  axes,
  scale,
  provisional,
}: {
  axes: SpiderAxis[];
  scale: Scale;
  provisional: boolean;
}) {
  if (axes.length < 3) return null;
  const c = 150;
  const r = 78;
  const dx = 30;
  const known = axes.every((a) => a.value !== null);
  const ratios = axes.map((a) =>
    a.value === null ? 0 : ratioOf(a.value, scale),
  );
  return (
    <svg
      className="pf-acc-spider"
      viewBox="0 0 360 300"
      role="img"
      aria-label={`Il tuo Spider${provisional ? " provvisorio" : ""}: ${axes
        .map(
          (a) =>
            `${a.label} ${a.value === null ? "non ancora stimato" : Math.round(a.value)}`,
        )
        .join(", ")}`}
    >
      {[1, 0.75, 0.5, 0.25].map((ring) => (
        <polygon
          key={ring}
          className="pf-acc-spider-ring"
          points={polygon(
            c,
            r,
            axes.map(() => ring),
            dx,
          )}
        />
      ))}
      {known && (
        <polygon
          className={`pf-acc-spider-shape${provisional ? " is-provisional" : ""}`}
          points={polygon(c, r, ratios, dx)}
        />
      )}
      {known &&
        axes.map((a, i) => {
          const p = point(c, r, i, axes.length, ratios[i]);
          return (
            <circle
              key={a.id}
              className="pf-acc-spider-point"
              cx={p.x + dx}
              cy={p.y}
              r={3.5}
              opacity={0.35 + 0.65 * Math.min(1, (a.confidence ?? 100) / 100)}
            />
          );
        })}
      {axes.map((a, i) => {
        // Sopra e sotto serve più spazio: etichetta e valore sono impilati.
        const angle = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
        const p = point(
          c,
          r,
          i,
          axes.length,
          1.25 + 0.3 * Math.abs(Math.sin(angle)),
          false,
        );
        const x = p.x + dx;
        const anchor =
          Math.abs(p.x - c) < 8 ? "middle" : p.x < c ? "end" : "start";
        return (
          <g key={a.id} className="pf-acc-spider-label">
            <text x={x} y={p.y - 6} textAnchor={anchor}>
              {a.label.toUpperCase()}
            </text>
            <text className="is-value" x={x} y={p.y + 12} textAnchor={anchor}>
              {a.value === null ? "—" : Math.round(a.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Esagono piccolo: R in nero, P in lime; tratteggiato se provvisorio. */
export function MiniSpider({
  real,
  potential,
  scale,
  provisional = false,
  size = 96,
}: {
  real: number[];
  potential?: number[];
  scale: Scale;
  provisional?: boolean;
  size?: number;
}) {
  const count = Math.max(real.length, 6);
  const c = 50;
  const r = 44;
  const ring = (ratio: number) =>
    polygon(
      c,
      r,
      Array.from({ length: count }, () => ratio),
    );
  return (
    <svg
      className="pf-acc-mini"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
    >
      {[1, 0.66, 0.33].map((ratio) => (
        <polygon
          key={ratio}
          className="pf-acc-mini-ring"
          points={ring(ratio)}
        />
      ))}
      {potential && potential.length >= 3 && (
        <polygon
          className="pf-acc-mini-potential"
          points={polygon(
            c,
            r,
            potential.map((v) => ratioOf(v, scale)),
          )}
        />
      )}
      {real.length >= 3 && (
        <polygon
          className={`pf-acc-mini-real${provisional ? " is-provisional" : ""}`}
          points={polygon(
            c,
            r,
            real.map((v) => ratioOf(v, scale)),
          )}
        />
      )}
    </svg>
  );
}
