import { type ReactNode, useId } from "react";

/** Una punta dell'esagono del profilo: valore e confidenza in 0-100. */
export type HexAxis = {
  id: string;
  label: string;
  score: number | null;
  confidence: number;
  /** Area che conosciamo abbastanza: linea piena, altrimenti tratteggiata. */
  defined: boolean;
};

/** Posto sul giro (dall'alto, in senso orario) di ciascuna delle sei aree. */
const DEMO_ORDER = [0, 2, 3, 5, 4, 1];

const C = 100;
const R = 84;

const vertex = (k: number, n: number, radius: number) => {
  const a = -Math.PI / 2 + (k / n) * Math.PI * 2;
  return [C + radius * Math.cos(a), C + radius * Math.sin(a)] as const;
};

const f = (p: readonly [number, number]) =>
  `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

/** Anello a angoli arrotondati, come gli anelli dello Spider della demo. */
export function roundedRing(n: number, radius: number, corner: number) {
  const v = Array.from({ length: n }, (_, k) => vertex(k, n, radius));
  const t = Math.min(0.45, corner / radius);
  const lerp = (a: readonly [number, number], b: readonly [number, number]) =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as const;
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = v[(i + n - 1) % n];
    const cur = v[i];
    const next = v[(i + 1) % n];
    d += `${i === 0 ? "M " : " L "}${f(lerp(cur, prev))} Q ${f(cur)} ${f(lerp(cur, next))}`;
  }
  return `${d} Z`;
}

/**
 * Posizione dell'etichetta di una punta, in percentuale del riquadro
 * 402×356 della demo: sopra e sotto al centro, ai lati accanto al vertice.
 */
function labelPlace(k: number, n: number) {
  const a = -Math.PI / 2 + (k / n) * Math.PI * 2;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  if (Math.abs(cos) < 0.2)
    return sin < 0
      ? { side: "top" as const, left: 50, top: (12 / 356) * 100 }
      : { side: "bottom" as const, left: 50, top: (306 / 356) * 100 };
  // Vertice sullo schermo: centro (201, 189), raggio 105.
  const y = 189 + 105 * sin;
  return {
    side: cos > 0 ? ("right" as const) : ("left" as const),
    left: cos > 0 ? (300 / 402) * 100 : (102 / 402) * 100,
    // Come nella demo: 108 px sopra, 222 px sotto.
    top: ((y - (sin < 0 ? 29 : 19)) / 356) * 100,
  };
}

/**
 * Esagono grande del profilo (demo PF10): anelli, raggi, area lime con
 * l'opacità della confidenza complessiva, lati pieni dove l'area è definita
 * e tratteggiati dove non lo è ancora, etichette con il valore.
 */
export function ProfileHex({
  axes,
  overallConfidence,
  scale,
  children,
}: {
  axes: HexAxis[];
  /** 0-100; null prima dell'assessment, quando lo Spider è vuoto. */
  overallConfidence: number | null;
  scale: { min: number; max: number };
  /** Contenuto sopra l'esagono vuoto, per esempio «Inizia l'assessment». */
  children?: ReactNode;
}) {
  const n = Math.max(axes.length, 3);
  // Con sei aree il giro è quello della demo e dell'animazione dell'assessment:
  // la prima in alto, la seconda in alto a sinistra, la terza in alto a destra.
  const ring = axes.length === 6 ? DEMO_ORDER.map((i) => axes[i]) : axes;
  const known =
    overallConfidence !== null && axes.every((a) => a.score !== null);
  const ratio = (v: number) =>
    Math.max(0, Math.min(1, (v - scale.min) / (scale.max - scale.min || 1)));
  const points = ring.map((a, k) =>
    vertex(k, n, R * (known ? ratio(a.score ?? 0) : 0)),
  );
  const conf = (a: HexAxis) => Math.max(0, Math.min(1, a.confidence / 100));
  return (
    <div className={`pf-prof-hex${known ? "" : " is-empty"}`}>
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label={
          known
            ? `Il tuo Spider: ${axes
                .map(
                  (a) =>
                    `${a.label} ${Math.round(a.score ?? 0)}${a.defined ? "" : " provvisorio"}`,
                )
                .join(", ")}`
            : "Il tuo Spider, ancora vuoto"
        }
      >
        <path d={roundedRing(n, 84, 13)} className="is-outer" />
        <path d={roundedRing(n, 63, 10)} />
        <path d={roundedRing(n, 42, 7)} />
        <path d={roundedRing(n, 21, 3.5)} />
        {Array.from({ length: n }, (_, k) => {
          const [x, y] = vertex(k, n, R);
          return (
            <line
              key={k}
              className="pf-prof-hex-spoke"
              x1={C}
              y1={C}
              x2={x.toFixed(1)}
              y2={y.toFixed(1)}
            />
          );
        })}
        {known && (
          <>
            <polygon
              className="pf-prof-hex-fill"
              points={points.map(f).join(" ")}
              style={{ opacity: 0.1 + 0.2 * (overallConfidence / 100) }}
            />
            {ring.map((a, k) => {
              const b = ring[(k + 1) % ring.length];
              const p = points[k];
              const q = points[(k + 1) % ring.length];
              const c = (conf(a) + conf(b)) / 2;
              const solid = a.defined && b.defined;
              return (
                <line
                  key={a.id}
                  className={`pf-prof-hex-edge${solid ? "" : " is-dashed"}`}
                  x1={p[0].toFixed(1)}
                  y1={p[1].toFixed(1)}
                  x2={q[0].toFixed(1)}
                  y2={q[1].toFixed(1)}
                  style={{ opacity: +(0.12 + 0.88 * c).toFixed(2) }}
                />
              );
            })}
            {ring.map((a, k) => (
              <circle
                key={a.id}
                className="pf-prof-hex-dot"
                cx={points[k][0].toFixed(1)}
                cy={points[k][1].toFixed(1)}
                r={(2 + 2 * conf(a)).toFixed(1)}
                style={{ opacity: +(0.18 + 0.82 * conf(a)).toFixed(2) }}
              />
            ))}
          </>
        )}
      </svg>
      {known &&
        ring.map((a, k) => {
          const place = labelPlace(k, n);
          return (
            <div
              key={a.id}
              className={`pf-prof-hex-label is-${place.side}`}
              style={{ left: `${place.left}%`, top: `${place.top}%` }}
              aria-hidden="true"
            >
              <span>{a.label}</span>
              <b>
                {a.defined ? "" : "≈ "}
                {Math.round(a.score ?? 0)}
              </b>
            </div>
          );
        })}
      {children}
    </div>
  );
}

/**
 * Anello di un'area: arco pari alla confidenza, lime e pieno se l'area è
 * definita, grigio e tratteggiato se no.
 */
export function AreaRing({
  confidence,
  defined,
  children,
}: {
  confidence: number;
  defined: boolean;
  children: ReactNode;
}) {
  const mask = `pf-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const circ = 2 * Math.PI * 19;
  const arc = (circ * Math.max(0, Math.min(100, confidence))) / 100;
  return (
    <div className={`pf-prof-ring${defined ? " is-defined" : ""}`}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="pf-prof-ring-track" cx="24" cy="24" r="19" />
        {defined ? (
          <circle
            className="pf-prof-ring-arc"
            cx="24"
            cy="24"
            r="19"
            strokeDasharray={`${arc.toFixed(1)} ${circ.toFixed(1)}`}
          />
        ) : (
          // Tratteggio lungo quanto l'arco: una maschera ritaglia l'arco.
          <>
            <mask id={mask}>
              <circle
                cx="24"
                cy="24"
                r="19"
                fill="none"
                stroke="#fff"
                strokeWidth="6"
                strokeDasharray={`${arc.toFixed(1)} ${circ.toFixed(1)}`}
              />
            </mask>
            <circle
              className="pf-prof-ring-arc is-dashed"
              cx="24"
              cy="24"
              r="19"
              mask={`url(#${mask})`}
            />
          </>
        )}
      </svg>
      <span>{children}</span>
    </div>
  );
}
