import type { CSSProperties, ReactNode } from "react";
import { AccountScreen } from "./account-shell";
import "./assessment-hex.css";

/**
 * Animazioni dell'esagono della demo PF10 mentre l'AI lavora: «Preparo le tue
 * domande» prima della prima coppia e il lato dell'area appena chiusa fra una
 * coppia e l'altra. Girano in loop finché il server non ha risposto.
 */

const C = 100;
const R = 84;

/** Vertici nello stesso ordine dello Spider: dall'alto, in senso orario. */
export function hexVertices(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
    return {
      x: Math.round((C + Math.cos(angle) * R) * 10) / 10,
      y: Math.round((C + Math.sin(angle) * R) * 10) / 10,
    };
  });
}

const points = (v: { x: number; y: number }[]) =>
  v.map((p) => `${p.x},${p.y}`).join(" ");

function Grid({ vertices }: { vertices: { x: number; y: number }[] }) {
  return (
    <>
      <polygon className="pf-hex-frame" points={points(vertices)} />
      {vertices.map((p, i) => (
        <line
          key={i}
          className="pf-hex-spoke"
          x1={C}
          y1={C}
          x2={p.x}
          y2={p.y}
        />
      ))}
    </>
  );
}

function Stage({
  children,
  title,
  sub,
  kicker,
  error,
  onRetry,
  retryLabel = "Riprova",
  loop,
}: {
  children: ReactNode;
  title: string;
  sub: string;
  kicker?: string;
  error?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Durata di un giro dell'animazione, anche della barra in basso. */
  loop: string;
}) {
  return (
    <AccountScreen tone="dark">
      <section
        className="pf-hex"
        role="status"
        style={{ "--pf-hex-loop": loop } as CSSProperties}
      >
        <div className="pf-hex-art">{children}</div>
        {kicker && <span className="pf-hex-kicker">{kicker}</span>}
        <h1 className="pf-acc-title">{title}</h1>
        <p>{sub}</p>
        {error ? (
          <>
            <p className="pf-acc-error" role="alert">
              {error}
            </p>
            {onRetry && (
              <button type="button" className="pf-acc-link" onClick={onRetry}>
                {retryLabel}
              </button>
            )}
          </>
        ) : (
          <span className="pf-hex-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
        <span className="pf-hex-bar" aria-hidden="true">
          <i />
        </span>
      </section>
    </AccountScreen>
  );
}

/** Attesa della prima coppia o del calcolo: l'esagono si disegna e ricomincia. */
export function HexPrep({
  title,
  sub,
  areas = 6,
  error,
  onRetry,
}: {
  title: string;
  sub: string;
  areas?: number;
  error?: string;
  onRetry?: () => void;
}) {
  const v = hexVertices(Math.max(3, areas));
  const inner = v.map((p) => ({
    x: C + (p.x - C) * 0.58,
    y: C + (p.y - C) * 0.58,
  }));
  return (
    <Stage title={title} sub={sub} error={error} onRetry={onRetry} loop="2.6s">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <Grid vertices={v} />
        <polygon className="pf-hex-breath" points={points(inner)} />
        <polygon className="pf-hex-trace" points={points(v)} pathLength={1} />
        {v.map((p, i) => (
          <circle
            key={i}
            className="pf-hex-vertex"
            cx={p.x}
            cy={p.y}
            r={3.5}
            style={{ animationDelay: `${0.1 + i * 0.35}s` }}
          />
        ))}
      </svg>
    </Stage>
  );
}

/**
 * Passaggio d'area: il lato che arriva sul vertice dell'area appena chiusa,
 * con il suo nome; le aree già fatte restano accese. Dopo l'ultima l'esagono
 * si riempie mentre l'AI calcola la performance.
 */
export function HexSide({
  names,
  index,
  error,
  onRetry,
  retryLabel,
}: {
  /** Aree nell'ordine dello Spider. */
  names: string[];
  /** Area appena completata. */
  index: number;
  error?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const n = Math.max(3, names.length);
  const v = hexVertices(n);
  const at = Math.min(Math.max(0, index), n - 1);
  const last = index >= names.length - 1;
  const side = (i: number) => ({
    x1: v[(i + n - 1) % n].x,
    y1: v[(i + n - 1) % n].y,
    x2: v[i].x,
    y2: v[i].y,
  });
  const name = names[at] ?? "";
  const next = names[at + 1] ?? "";
  return (
    <Stage
      kicker={names.length ? `Area ${at + 1} di ${names.length}` : undefined}
      title={last ? "Esagono completo." : `${name}, fatto.`}
      sub={
        last
          ? "Sto calcolando la tua performance."
          : `Ora ${next.toLowerCase()}.`
      }
      error={error}
      onRetry={onRetry}
      retryLabel={retryLabel}
      loop={last ? "3s" : "2.3s"}
    >
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <polygon className="pf-hex-frame is-dashed" points={points(v)} />
        {v.map((p, i) => (
          <line
            key={i}
            className="pf-hex-spoke"
            x1={C}
            y1={C}
            x2={p.x}
            y2={p.y}
          />
        ))}
        {last && <polygon className="pf-hex-fill" points={points(v)} />}
        {Array.from({ length: at }, (_, i) => (
          <line key={i} className="pf-hex-side is-done" {...side(i)} />
        ))}
        {Array.from({ length: at }, (_, i) => (
          <circle
            key={i}
            className="pf-hex-dot is-done"
            cx={v[i].x}
            cy={v[i].y}
            r={3}
          />
        ))}
        <line className="pf-hex-side is-now" pathLength={1} {...side(at)} />
        <circle className="pf-hex-glow" cx={v[at].x} cy={v[at].y} r={9} />
        <circle
          className="pf-hex-dot is-now"
          cx={v[at].x}
          cy={v[at].y}
          r={5.5}
        />
      </svg>
      {names.slice(0, at + 1).map((label, i) => (
        <span
          key={label + i}
          className={`pf-hex-pill${i === at ? " is-now" : ""}`}
          style={{
            left: `${v[i].x / 2}%`,
            top: `${v[i].y / 2}%`,
            transform: `translate(${
              v[i].x > 150 ? "-20%" : v[i].x < 50 ? "-80%" : "-50%"
            }, ${v[i].y < C ? "calc(-100% - 14px)" : "14px"})`,
          }}
        >
          {label}
        </span>
      ))}
    </Stage>
  );
}
