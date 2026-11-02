"use client";
import { useEffect, useRef, useState, type Ref } from "react";

/**
 * Campo da padel della demo PF10 visto dall'alto: linee che si tracciano,
 * quattro giocatori e una pallina che va e viene. Solo illustrazione.
 */
export function PadelCourt({
  ballRef,
  zone,
}: {
  /** Con il minigioco la pallina la muove il codice, non l'animazione CSS. */
  ballRef?: Ref<SVGGElement>;
  /** Zona di colpo evidenziata: "idle" visibile, "hot" pallina dentro. */
  zone?: "idle" | "hot";
}) {
  return (
    <div
      className={`pf4-court${ballRef ? " is-manual" : ""}`}
      aria-hidden="true"
    >
      <span className="pf4-court-glow" />
      <svg viewBox="0 0 354 164">
        <polygon
          className="pf4-court-orb"
          points="177,30 222,56 222,108 177,134 132,108 132,56"
        />
        <rect
          className="pf4-court-floor"
          x="47"
          y="17"
          width="260"
          height="130"
          rx="6"
        />
        <path
          className="pf4-court-trace"
          pathLength="1"
          d="M53 17H301Q307 17 307 23V141Q307 147 301 147H53Q47 147 47 141V23Q47 17 53 17Z"
        />
        <path
          className="pf4-court-trace pf4-court-lines"
          pathLength="1"
          d="M87 17V147M267 17V147M87 82H267"
        />
        <path
          className="pf4-court-walls"
          d="M47 17H99M47 147H99M255 17H307M255 147H307M47 17V147M307 17V147"
        />
        <g className="pf4-court-net">
          <line x1="177" y1="9" x2="177" y2="155" />
          <circle cx="177" cy="9" r="3" />
          <circle cx="177" cy="155" r="3" />
        </g>
        {zone && (
          <circle
            className={`pf4-court-zone${zone === "hot" ? " is-hot" : ""}`}
            cx={ZONE.x}
            cy={ZONE.y}
            r="17"
          />
        )}
        <g className="pf4-court-players">
          <circle cx="78" cy="58" r="5" />
          <circle cx="112" cy="114" r="5" />
          <circle cx="276" cy="104" r="5" />
          <circle cx="242" cy="50" r="5" />
        </g>
        <g className="pf4-court-ball" ref={ballRef}>
          <circle r="10" className="pf4-court-ball-halo" />
          <circle r="4.5" />
        </g>
      </svg>
    </div>
  );
}

/** Tappe dello scambio, come i keyframe CSS: [fase, x, y, scala]. */
const RALLY: [number, number, number, number][] = [
  [0, 84, 60, 1],
  [0.04, 84, 60, 1],
  [0.25, 177, 52, 1.7],
  [0.46, 270, 102, 1],
  [0.54, 270, 102, 1],
  [0.75, 177, 112, 1.7],
  [0.96, 84, 60, 1],
  [1, 84, 60, 1],
];
const ZONE = { x: 270, y: 102 };
/** Uno scambio completo; la finestra di colpo è tollerante (≈ mezzo secondo). */
export const RHYTHM_PERIOD_MS = 2600;
export const RHYTHM_WINDOW = { from: 0.4, to: 0.6 };
export const RHYTHM_GOAL = 3;
/** Un salto oltre questo (scheda in background, frame perso) non conta. */
const MAX_FRAME_MS = 50;

export function rallyAt(phase: number) {
  const p = ((phase % 1) + 1) % 1;
  const i = RALLY.findIndex(([at], k) => p <= at && k > 0);
  const [a0, x0, y0, s0] = RALLY[i - 1];
  const [a1, x1, y1, s1] = RALLY[i];
  const t = a1 === a0 ? 0 : (p - a0) / (a1 - a0);
  const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  return {
    x: x0 + (x1 - x0) * e,
    y: y0 + (y1 - y0) * e,
    scale: s0 + (s1 - s0) * e,
  };
}

/** Esito di un colpo alla fase data dello scambio. */
export function judgeHit(phase: number) {
  if (phase >= RHYTHM_WINDOW.from && phase <= RHYTHM_WINDOW.to) return "hit";
  if (phase > 0.15 && phase < RHYTHM_WINDOW.from) return "early";
  if (phase > RHYTHM_WINDOW.to && phase < 0.85) return "late";
  return "wait";
}

const FEEDBACK = {
  hit: "Preso!",
  early: "Un po' presto: aspetta la zona.",
  late: "Un po' tardi: riprova al prossimo scambio.",
  wait: "Aspetta che la pallina arrivi nella zona.",
  again: "Già preso: aspetta il prossimo scambio.",
};

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

/**
 * Minigioco facoltativo «Trova il ritmo» dentro il campo dell'intro: nessun
 * passaggio, nessun salvataggio, nessun effetto sul percorso. Si ferma e si
 * ripulisce quando si lascia la schermata.
 */
export function RhythmCourt() {
  const reduced = usePrefersReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [hits, setHits] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [hot, setHot] = useState(false);
  const ball = useRef<SVGGElement>(null);
  const elapsed = useRef(0);
  const hitPass = useRef(-1);
  const won = hits >= RHYTHM_GOAL;
  const running = playing && !won && !reduced;

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last: number | undefined;
    const draw = () => {
      const phase = (elapsed.current % RHYTHM_PERIOD_MS) / RHYTHM_PERIOD_MS;
      const { x, y, scale } = rallyAt(phase);
      if (ball.current)
        ball.current.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(2)})`;
      const inside = judgeHit(phase) === "hit";
      setHot((current) => (current === inside ? current : inside));
    };
    const tick = (now: number) => {
      // Un intervallo lungo (scheda nascosta, rallentamento) vale un frame.
      const dt = last === undefined ? 0 : Math.min(now - last, MAX_FRAME_MS);
      last = now;
      elapsed.current += dt;
      draw();
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      last = undefined;
      frame = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(frame);
      else start();
    };
    draw();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    const node = ball.current;
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      // Torna lo scambio automatico dell'animazione CSS.
      if (node) node.style.transform = "";
    };
  }, [running]);

  useEffect(() => {
    if (!feedback || won) return;
    const timer = setTimeout(() => setFeedback(""), 1400);
    return () => clearTimeout(timer);
  }, [feedback, hits, won]);

  const begin = () => {
    elapsed.current = 0;
    hitPass.current = -1;
    setHits(0);
    setFeedback("");
    setHot(false);
    setPlaying(true);
  };
  const stop = () => {
    setPlaying(false);
    setHits(0);
    setFeedback("");
    setHot(false);
  };
  const strike = () => {
    if (!running) return;
    const pass = Math.floor(elapsed.current / RHYTHM_PERIOD_MS);
    const phase = (elapsed.current % RHYTHM_PERIOD_MS) / RHYTHM_PERIOD_MS;
    const result = judgeHit(phase);
    if (result === "hit" && hitPass.current === pass) {
      setFeedback(FEEDBACK.again);
      return;
    }
    if (result === "hit") {
      hitPass.current = pass;
      setHits((n) => n + 1);
    }
    setFeedback(FEEDBACK[result]);
  };

  const showGame = playing && !reduced;
  return (
    <div className="pf4-rhythm">
      <PadelCourt
        ballRef={running ? ball : undefined}
        zone={showGame && !won ? (hot ? "hot" : "idle") : undefined}
      />
      {!reduced && (
        <div className="pf4-rhythm-bar">
          {!showGame && (
            <button type="button" className="pf4-rhythm-try" onClick={begin}>
              Prova il ritmo
            </button>
          )}
          {showGame && (
            <>
              <span
                className="pf4-rhythm-count"
                aria-label={`Colpi riusciti ${hits} su ${RHYTHM_GOAL}`}
              >
                {Array.from({ length: RHYTHM_GOAL }, (_, i) => (
                  <i key={i} className={i < hits ? "is-on" : ""} />
                ))}
                <b>
                  {Math.min(hits, RHYTHM_GOAL)}/{RHYTHM_GOAL}
                </b>
              </span>
              {won ? (
                <button
                  type="button"
                  className="pf4-rhythm-hit"
                  onClick={begin}
                >
                  Gioca ancora
                </button>
              ) : (
                <button
                  type="button"
                  className="pf4-rhythm-hit"
                  onClick={strike}
                >
                  Colpisci
                </button>
              )}
              <button
                type="button"
                className="pf4-rhythm-close"
                aria-label="Chiudi il gioco"
                onClick={stop}
              >
                ×
              </button>
            </>
          )}
        </div>
      )}
      <p className="pf4-rhythm-feedback" role="status" aria-live="polite">
        {showGame
          ? won
            ? "Hai trovato il ritmo! Ora tocca al percorso."
            : feedback ||
              "Premi «Colpisci» quando la pallina entra nel cerchio."
          : ""}
      </p>
    </div>
  );
}
