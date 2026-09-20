"use client";
import { AthleteShell } from "../_components/athlete-shell";
import { useAthlete } from "../_components/use-athlete";
import { PerformanceVisual } from "../../journey/performance-result";
import { displayDate, type Performance } from "../_components/athlete-types";
export default function ProgressPage() {
  const { data, error, reload } = useAthlete<{
    current: Performance | null;
    history: Performance[];
  }>("/athlete/progress");
  return (
    <AthleteShell
      label="Progress"
      loading={!data}
      error={error}
      reload={reload}
    >
      <h1>La tua prossima versione.</h1>
      {data?.current ? (
        <>
          <p>Performance attuale → potenziale</p>
          <PerformanceVisual performance={data.current} />
          <section className="pf4-athlete-section">
            <span className="pf4-kicker">Il tuo percorso nel tempo</span>
            {data.history.length > 1 && (
              <svg
                className="pf4-history-chart"
                viewBox="0 0 400 120"
                role="img"
                aria-label="Andamento del Performance Index, dal meno recente al più recente"
              >
                <line x1="10" y1="110" x2="390" y2="110" stroke="#eaeae7" />
                <polyline
                  fill="none"
                  stroke="#0b0b0c"
                  strokeWidth="2"
                  points={[...data.history]
                    .reverse()
                    .map(
                      (s, i) =>
                        `${10 + (i * 380) / (data.history.length - 1)},${110 - s.current}`,
                    )
                    .join(" ")}
                />
              </svg>
            )}
            {data.history.map((s) => (
              <div className="pf4-history-row" key={s.snapshotId}>
                <span>
                  {displayDate(s.date, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <strong>
                  {s.current} <small>→ {s.potential ?? "—"}</small>
                </strong>
              </div>
            ))}
          </section>
        </>
      ) : (
        data && (
          <p>
            Il tuo Performance Index sarà disponibile dopo il primo assessment.
          </p>
        )
      )}
    </AthleteShell>
  );
}
