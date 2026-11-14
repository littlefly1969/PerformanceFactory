import { roundedRing } from "../../journey/profilo/_profile/profile-hex";
import type { SpiderDriver } from "../../components/estimated-spider";
import "./performance-preview.css";

/** Posto sul giro (dall'alto, in senso orario) di ciascuna delle sei aree. */
const DEMO_ORDER = [0, 2, 3, 5, 4, 1];
const C = 100;
const R = 84;
/** Riquadro della demo: SVG 330 px con viewBox -30 -20 260 240. */
const BOX = 330;
const VIEW = { x: -30, y: -20, w: 260, h: 240 };

const vertex = (k: number, n: number, radius: number) => {
  const a = -Math.PI / 2 + (k / n) * Math.PI * 2;
  return [C + radius * Math.cos(a), C + radius * Math.sin(a)] as const;
};

/** Nome breve sull'esagono, come nella demo: «Preparazione», «Mental». */
export const shortArea = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * Esagono della slide 3 del benvenuto (demo V11): le sei aree scritte intorno,
 * il reale in bianco. Prima dell'assessment il reale è la stima fatta con le
 * risposte del funnel; il potenziale non esiste ancora, per questo la legenda
 * lo annuncia senza disegnarlo.
 */
export function PerformancePreview({
  drivers,
  scale,
}: {
  drivers: SpiderDriver[];
  scale: { min: number; max: number };
}) {
  const n = drivers.length;
  if (n < 3) return null;
  const ring = n === 6 ? DEMO_ORDER.map((i) => drivers[i]) : drivers;
  const span = scale.max - scale.min || 1;
  const ratio = (v: number) => Math.max(0, Math.min(1, (v - scale.min) / span));
  const points = ring.map((d, k) => vertex(k, n, R * ratio(d.score)));
  const k = BOX / VIEW.w;
  const top = (BOX - VIEW.h * k) / 2;
  return (
    <figure className="pf-wk-perf">
      <div className="pf-wk-perf-box">
        <svg
          viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
          role="img"
          aria-label={`La tua performance stimata: ${drivers
            .map((d) => `${d.name} ${Math.round(d.score)}`)
            .join(", ")}`}
        >
          <path d={roundedRing(n, 84, 13)} className="is-outer" />
          <path d={roundedRing(n, 63, 10)} />
          <path d={roundedRing(n, 42, 7)} />
          <path d={roundedRing(n, 21, 3.5)} />
          {ring.map((d, i) => {
            const [x, y] = vertex(i, n, R);
            return (
              <line
                key={d.id}
                x1={C}
                y1={C}
                x2={x.toFixed(1)}
                y2={y.toFixed(1)}
              />
            );
          })}
          <polygon
            className="pf-wk-perf-real"
            points={points
              .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
              .join(" ")}
          />
          {points.map(([x, y], i) => (
            <circle
              key={ring[i].id}
              className="pf-wk-perf-dot"
              cx={x.toFixed(1)}
              cy={y.toFixed(1)}
              r="3"
            />
          ))}
        </svg>
        {ring.map((d, i) => {
          const [x, y] = vertex(i, n, 100);
          const cos = (x - C) / 100;
          const side = Math.abs(cos) < 0.2 ? "mid" : cos > 0 ? "right" : "left";
          return (
            <span
              key={d.id}
              className={`pf-wk-perf-label is-${side}`}
              style={{
                left: `${(((x - VIEW.x) * k) / BOX) * 100}%`,
                top: `${(((y - VIEW.y) * k + top) / BOX) * 100}%`,
              }}
              aria-hidden="true"
            >
              {shortArea(d.name)}
            </span>
          );
        })}
      </div>
      <figcaption className="pf-wk-perf-legend">
        <span className="is-real">Reale</span>
        <span className="is-potential">Potenziale · dopo l’assessment</span>
      </figcaption>
    </figure>
  );
}
