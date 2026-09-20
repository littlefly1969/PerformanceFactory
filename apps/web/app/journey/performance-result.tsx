import { useState } from "react";
import type { Driver, Journey } from "./journey-types";
function Radar({ drivers }: { drivers: Driver[] }) {
  const point = (score: number, i: number) => {
    const angle = (i * Math.PI * 2) / drivers.length - Math.PI / 2;
    return `${150 + Math.cos(angle) * score * 1.05},${150 + Math.sin(angle) * score * 1.05}`;
  };
  return (
    <svg
      viewBox="0 0 300 300"
      className="pf4-radar"
      role="img"
      aria-label="Confronto tra performance attuale e potenziale per driver"
    >
      {[25, 50, 75, 100].map((s) => (
        <polygon
          key={s}
          points={drivers.map((_, i) => point(s, i)).join(" ")}
          fill="none"
          stroke="#deded8"
        />
      ))}
      <polygon
        points={drivers.map((d, i) => point(d.potential, i)).join(" ")}
        fill="#c8f02e"
        fillOpacity=".75"
      />
      <polygon
        points={drivers.map((d, i) => point(d.current, i)).join(" ")}
        fill="#0b0b0c"
      />
      {drivers.map((d, i) => (
        <text
          key={d.id}
          x={point(130, i).split(",")[0]}
          y={point(130, i).split(",")[1]}
          textAnchor="middle"
          fontSize="10"
        >
          {i + 1}
        </text>
      ))}
    </svg>
  );
}
export function PerformanceVisual({
  performance: r,
}: {
  performance: {
    current: number;
    potential: number | null;
    gap: number | null;
    drivers: Driver[];
  };
}) {
  return (
    <>
      <div className="pf4-metrics">
        <div>
          <span>Current Performance Index</span>
          <strong>{r.current}</strong>
        </div>
        <div>
          <span>Potenziale</span>
          <strong>{r.potential ?? "—"}</strong>
        </div>
        <div>
          <span>Gap</span>
          <strong>
            {r.gap === null ? "—" : `${r.gap >= 0 ? "+" : ""}${r.gap}`}
          </strong>
        </div>
      </div>
      <Radar drivers={r.drivers} />
      <div className="pf4-legend">
        ● Attuale <span>● Potenziale</span>
      </div>
      <div className="pf4-driver-scores">
        {r.drivers.map((d, i) => (
          <div key={d.id}>
            <header>
              <span>
                {String(i + 1).padStart(2, "0")} · {d.name}
              </span>
              <strong>
                {d.current} <small>→ {d.potential}</small>
              </strong>
            </header>
            <div className="pf4-score-track">
              <span style={{ width: `${d.potential}%` }} />
              <span style={{ width: `${d.current}%` }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
export function PerformanceResult({
  journey,
  busy,
  onContinue,
}: {
  journey: Journey;
  busy: boolean;
  onContinue: () => void;
}) {
  const r = journey.result;
  if (!r) return <p role="alert">Il risultato non è ancora disponibile.</p>;
  return (
    <section className="pf4-body pf4-performance">
      <span className="pf4-kicker">Performance Result</span>
      <h1>
        La tua performance,
        <br />
        da qui in avanti.
      </h1>
      <PerformanceVisual performance={r} />
      {r.priority && (
        <div className="pf4-highlight">
          <span className="pf4-kicker">La tua leva di miglioramento</span>
          <h2>{r.priority.name}</h2>
          <p>
            {r.priority.current} oggi · {r.priority.potential} potenziale
          </p>
        </div>
      )}
      <button className="pf4-cta" disabled={busy} onClick={onContinue}>
        Quanto tempo ti dai →
      </button>
    </section>
  );
}
export function DurationStep({
  journey,
  busy,
  onSelect,
}: {
  journey: Journey;
  busy: boolean;
  onSelect: (weeks: number) => void;
}) {
  const [weeks, setWeeks] = useState(
    journey.programDurationWeeks ?? journey.durationOptions[0]?.weeks,
  );
  return (
    <section className="pf4-body">
      <span className="pf4-kicker">Il tuo programma</span>
      <h1>Quanto tempo ti dai?</h1>
      <p>
        Scegli l’orizzonte del tuo percorso. La durata sarà usata per costruire
        il programma.
      </p>
      <div className="pf4-options pf4-duration">
        {journey.durationOptions.map((d) => (
          <button
            className={`pf4-option ${weeks === d.weeks ? "is-selected" : ""}`}
            aria-pressed={weeks === d.weeks}
            key={d.weeks}
            onClick={() => setWeeks(d.weeks)}
          >
            <span>
              {d.label}
              <small>{d.description}</small>
            </span>
            <span className="pf4-dot" />
          </button>
        ))}
      </div>
      <button
        className="pf4-cta"
        disabled={busy || !weeks}
        onClick={() => onSelect(weeks!)}
      >
        Conferma la durata
      </button>
    </section>
  );
}
