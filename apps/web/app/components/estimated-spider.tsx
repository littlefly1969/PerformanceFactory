/** Spider dei driver: tratteggiato finché è una stima, pieno con la valutazione. */
export type SpiderDriver = { id: string; name: string; score: number };

const RINGS = [1 / 3, 2 / 3, 1];

export function EstimatedSpider({
  drivers,
  scale,
  estimated,
  size = 260,
}: {
  drivers: SpiderDriver[];
  scale: { min: number; max: number };
  estimated: boolean;
  size?: number;
}) {
  const center = 150;
  const radius = 92;
  const span = scale.max - scale.min || 1;
  const point = (index: number, ratio: number) => {
    const angle = -Math.PI / 2 + (index / drivers.length) * Math.PI * 2;
    const r = Math.max(0, Math.min(1, ratio)) * radius;
    return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r };
  };
  const polygon = (ratio: (index: number) => number) =>
    drivers
      .map((_, i) => {
        const p = point(i, ratio(i));
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(" ");
  const ratio = (i: number) => (drivers[i].score - scale.min) / span;
  if (drivers.length < 3) return null;
  return (
    <figure className="pf-spider">
      <svg
        viewBox="-60 0 420 300"
        width={(size * 420) / 300}
        height={size}
        role="img"
        aria-label={`Spider ${estimated ? "stimato" : "attuale"}: ${drivers
          .map((d) => `${d.name} ${Math.round(d.score)}`)
          .join(", ")}`}
      >
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            className="pf-spider-ring"
            points={polygon(() => ring)}
          />
        ))}
        {drivers.map((d, i) => {
          const end = point(i, 1);
          return (
            <line
              key={d.id}
              className="pf-spider-axis"
              x1={center}
              y1={center}
              x2={end.x}
              y2={end.y}
            />
          );
        })}
        <polygon
          className={`pf-spider-shape${estimated ? " is-estimated" : ""}`}
          points={polygon(ratio)}
        />
        {drivers.map((d, i) => {
          const p = point(i, ratio(i));
          return (
            <circle
              key={d.id}
              className="pf-spider-point"
              cx={p.x}
              cy={p.y}
              r={4.5}
            />
          );
        })}
        {drivers.map((d, i) => {
          const p = point(i, 1.27);
          return (
            <text
              key={d.id}
              className="pf-spider-label"
              x={p.x}
              y={p.y}
              textAnchor={
                Math.abs(p.x - center) < 8
                  ? "middle"
                  : p.x < center
                    ? "end"
                    : "start"
              }
              dominantBaseline="middle"
            >
              {d.name}
            </text>
          );
        })}
      </svg>
    </figure>
  );
}
