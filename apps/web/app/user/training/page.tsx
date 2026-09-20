"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AthleteShell } from "../_components/athlete-shell";
import { useAthlete } from "../_components/use-athlete";
import {
  CalendarLegend,
  dayState,
  SessionCard,
} from "../_components/calendar-strip";
import {
  addDays,
  displayDate,
  todayDate,
  sessionLabels,
  type Calendar,
} from "../_components/athlete-types";
function monthRange(date: string) {
  const start = `${date.slice(0, 7)}-01`;
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return { from: start, to: d.toISOString().slice(0, 10) };
}
function TrainingCalendar() {
  const params = useSearchParams();
  const initial = params.get("date");
  const [selected, setSelected] = useState(
    initial &&
      /^\d{4}-\d{2}-\d{2}$/.test(initial) &&
      !isNaN(Date.parse(initial))
      ? initial
      : todayDate(),
  );
  const range = monthRange(selected);
  const { data, error, reload } = useAthlete<Calendar>(
    `/athlete/training/calendar?from=${range.from}&to=${range.to}`,
  );
  const current = data?.from === range.from ? data : undefined;
  const blanks = (new Date(`${range.from}T12:00:00Z`).getUTCDay() + 6) % 7;
  const move = (offset: number) => {
    const d = new Date(`${range.from}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + offset);
    setSelected(d.toISOString().slice(0, 10));
  };
  return (
    <AthleteShell
      label="Training · Calendario"
      error={error}
      reload={reload}
      loading={!current}
    >
      <div className="pf4-month-heading">
        <h1>{displayDate(range.from, { month: "long", year: "numeric" })}</h1>
        <div>
          <button onClick={() => move(-1)} aria-label="Mese precedente">
            ←
          </button>
          <button onClick={() => setSelected(todayDate())}>Oggi</button>
          <button onClick={() => move(1)} aria-label="Mese successivo">
            →
          </button>
        </div>
      </div>
      {current && (
        <>
          <div className="pf4-calendar-stats">
            <div>
              <strong>{current.sessions.length}</strong>
              <span>Sessioni</span>
            </div>
            <div>
              <strong>
                {
                  current.sessions.filter((s) => s.status === "COMPLETED")
                    .length
                }
              </strong>
              <span>Fatte</span>
            </div>
            <div>
              <strong>
                {current.sessions.filter((s) => s.status === "SKIPPED").length}
              </strong>
              <span>Saltate</span>
            </div>
          </div>
          <div className="pf4-calendar-grid" aria-label="Giorni del mese">
            {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
              <small key={d}>{d}</small>
            ))}
            {Array.from({ length: blanks }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: Number(range.to.slice(-2)) }, (_, i) => {
              const date = addDays(range.from, i),
                sessions = current.sessions.filter((s) => s.date === date),
                state = dayState(sessions, date, current.today);
              return (
                <button
                  className={`pf4-calendar-cell ${date === selected ? "is-selected" : ""}`}
                  key={date}
                  onClick={() => setSelected(date)}
                  aria-pressed={date === selected}
                  aria-label={`${displayDate(date)} · ${sessions.length} sessioni${state !== "EMPTY" ? ` · ${sessionLabels[state]}` : ""}`}
                >
                  <span className={`pf4-calendar-day state-${state}`}>
                    {i + 1}
                  </span>
                  <em>
                    {sessions.length > 1
                      ? sessions.length
                      : sessions.length
                        ? "·"
                        : ""}
                  </em>
                </button>
              );
            })}
          </div>
          <CalendarLegend />
          <section className="pf4-athlete-section pf4-selected-sessions">
            <span className="pf4-kicker">
              {selected === current.today ? "Oggi · " : ""}
              {displayDate(selected)}
            </span>
            {current.sessions
              .filter((s) => s.date === selected)
              .map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            {!current.sessions.some((s) => s.date === selected) && (
              <p>Nessuna sessione in questa data.</p>
            )}
          </section>
          <section className="pf4-athlete-section">
            <span className="pf4-kicker">Le sessioni del mese</span>
            {current.sessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
            {!current.sessions.length && (
              <p>
                Le sessioni compariranno quando il programma sarà pubblicato.
                Puoi esplorare gli altri mesi.
              </p>
            )}
          </section>
        </>
      )}
    </AthleteShell>
  );
}
export default function TrainingPage() {
  return (
    <Suspense>
      <TrainingCalendar />
    </Suspense>
  );
}
