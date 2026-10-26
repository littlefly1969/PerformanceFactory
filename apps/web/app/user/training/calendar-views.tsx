"use client";
import Link from "next/link";
import { useState } from "react";
import type { History, Session } from "../_components/athlete-types";
import { addDays, displayDate } from "../_components/athlete-types";
import { dayState } from "../_components/calendar-strip";
import {
  capitalized,
  effortFromRating,
  modeLabels,
  relativeDay,
  sessionArea,
} from "../_components/session-format";

const weekdays = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const legend = [
  ["DONE", "Fatto"],
  ["TODAY", "Oggi"],
  ["SKIPPED", "Saltato"],
  ["SCHEDULED", "In programma"],
] as const;
const stateLabels: Record<string, string> = {
  DONE: "Fatto",
  TODAY: "Oggi",
  SKIPPED: "Saltato",
  MISSED: "Non svolto",
  SCHEDULED: "In programma",
};

export function weekStart(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

function dayHeading(date: string, today: string) {
  const label = displayDate(date, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return date === today ? `Oggi · ${label}` : capitalized(label);
}

export function MonthView({
  from,
  to,
  today,
  selected,
  sessions,
  onSelect,
}: {
  from: string;
  to: string;
  today: string;
  selected: string;
  sessions: Session[];
  onSelect: (date: string) => void;
}) {
  const inMonth = sessions.filter((s) => s.date >= from && s.date <= to);
  const blanks = (new Date(`${from}T12:00:00Z`).getUTCDay() + 6) % 7;
  const ofDay = inMonth.filter((s) => s.date === selected);
  return (
    <>
      <div className="pfs-stats">
        <div>
          <strong>
            {inMonth.filter((s) => s.status === "COMPLETED").length}
          </strong>
          <span>Fatti</span>
        </div>
        <div className="is-muted">
          <strong>
            {inMonth.filter((s) => s.status === "SKIPPED").length}
          </strong>
          <span>Saltati</span>
        </div>
        <div>
          <strong>
            {inMonth.filter((s) => s.status === "SCHEDULED").length}
          </strong>
          <span>In programma</span>
        </div>
      </div>
      <div className="pfs-month" aria-label="Giorni del mese">
        {weekdays.map((d) => (
          <small key={d}>{d}</small>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: Number(to.slice(-2)) }, (_, i) => {
          const date = addDays(from, i),
            daySessions = inMonth.filter((s) => s.date === date),
            state = dayState(daySessions, date, today);
          return (
            <button
              key={date}
              className={`pfs-day state-${state}${date === selected ? " is-selected" : ""}`}
              onClick={() => onSelect(date)}
              aria-pressed={date === selected}
              aria-label={`${displayDate(date)} · ${daySessions.length} sessioni${state !== "EMPTY" ? ` · ${stateLabels[state]}` : ""}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="pfs-legend">
        {legend.map(([state, label]) => (
          <span key={state}>
            <i className={`state-${state}`} />
            {label}
          </span>
        ))}
      </div>
      <section className="pfs-section">
        <span className="pfs-kicker">{dayHeading(selected, today)}</span>
        {ofDay.map((s) => (
          <Link
            key={s.id}
            className={`pfs-day-cta${s.status === "SCHEDULED" ? "" : " is-quiet"}`}
            href={`/user/training/sessions/${s.id}`}
          >
            <span>
              <small>
                {s.status === "SCHEDULED"
                  ? s.date === today
                    ? "Da fare oggi"
                    : "In programma"
                  : stateLabels[s.displayStatus]}
                {s.track === "AREA" ? ` · ${sessionArea(s)}` : ""}
              </small>
              <strong>
                {s.title}
                {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
              </strong>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
        {!ofDay.length && (
          <p className="pfs-muted">Nessuna sessione in questa data.</p>
        )}
      </section>
    </>
  );
}

export function WeekView({
  start,
  today,
  sessions,
}: {
  start: string;
  today: string;
  sessions: Session[];
}) {
  return (
    <ol className="pfs-week">
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(start, i);
        const daySessions = sessions.filter((s) => s.date === date);
        const day = (
          <span className="pfs-week-day">
            <small>{displayDate(date, { weekday: "short" })}</small>
            <strong>{date.slice(-2)}</strong>
          </span>
        );
        if (!daySessions.length)
          return (
            <li key={date} className="is-rest">
              {day}
              <span className="pfs-week-body">
                <strong>Riposo</strong>
                <small>Nessuna sessione</small>
              </span>
            </li>
          );
        return daySessions.map((s) => (
          <li key={s.id} className={date === today ? "is-today" : undefined}>
            {day}
            <Link
              className="pfs-week-body"
              href={`/user/training/sessions/${s.id}`}
            >
              <strong>{s.title}</strong>
              <small>
                {[
                  s.durationMinutes
                    ? `${s.durationMinutes} min`
                    : sessionArea(s),
                  s.mode ? modeLabels[s.mode].toLowerCase() : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </Link>
            <em>
              {s.status === "SCHEDULED" && date !== today
                ? ""
                : stateLabels[s.displayStatus]}
            </em>
          </li>
        ));
      })}
    </ol>
  );
}

export function DayView({
  date,
  today,
  sessions,
}: {
  date: string;
  today: string;
  sessions: Session[];
}) {
  const ofDay = sessions.filter((s) => s.date === date);
  if (!ofDay.length)
    return (
      <section className="pfs-card">
        <span className="pfs-kicker">{dayHeading(date, today)}</span>
        <h2>Riposo</h2>
        <p className="pfs-muted">Nessuna sessione in questa data.</p>
      </section>
    );
  return (
    <>
      {ofDay.map((s) => (
        <section key={s.id} className="pfs-card pfs-day-card">
          <span className="pfs-kicker">{dayHeading(date, today)}</span>
          <h2>{s.title}</h2>
          <dl className="pfs-facts">
            <div>
              <dt>Durata</dt>
              <dd>{s.durationMinutes ? `${s.durationMinutes} min` : "—"}</dd>
            </div>
            <div>
              <dt>Quando</dt>
              <dd>{relativeDay(s.date, today)}</dd>
            </div>
            <div>
              <dt>Come</dt>
              <dd>{s.mode ? modeLabels[s.mode] : sessionArea(s)}</dd>
            </div>
          </dl>
          <Link className="pfs-cta" href={`/user/training/sessions/${s.id}`}>
            Apri la scheda <span aria-hidden="true">→</span>
          </Link>
          <button className="pfs-link pfs-print" onClick={() => window.print()}>
            Stampa
          </button>
        </section>
      ))}
    </>
  );
}

function EffortBars({ rating }: { rating: number | null }) {
  const effort = effortFromRating(rating) ?? 0;
  return (
    <span
      className="pfs-bars"
      aria-label={effort ? `Fatica ${effort} su 5` : "Fatica non indicata"}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= effort ? "is-on" : undefined} />
      ))}
    </span>
  );
}

export function HistoryList({
  history,
  expanded = false,
}: {
  history?: History;
  expanded?: boolean;
}) {
  const [all, setAll] = useState(false);
  if (!history) return null;
  const visible = all ? history.sessions : history.sessions.slice(0, 4);
  return (
    <section className="pfs-history">
      <div className="pfs-history-head">
        <span className="pfs-kicker">
          Storico allenamenti · {history.completed}{" "}
          {history.completed === 1 ? "sessione" : "sessioni"} ·{" "}
          {history.minutes} minuti
        </span>
        {(!expanded || history.sessions.length > 4) && (
          <button className="pfs-link" onClick={() => setAll((v) => !v)}>
            {all ? "Meno" : "Tutto"} <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
      {(expanded || all) && (
        <ol>
          {visible.map((s) => (
            <li key={s.id}>
              <small>{`${s.date.slice(8)}/${s.date.slice(5, 7)}`}</small>
              <Link href={`/user/training/sessions/${s.id}`}>
                <strong>{s.title}</strong>
                <span>
                  {[
                    s.durationMinutes ? `${s.durationMinutes} min` : null,
                    s.status === "SKIPPED" ? "saltata" : sessionArea(s),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
              <EffortBars rating={s.completionRating} />
            </li>
          ))}
          {!history.sessions.length && (
            <li className="is-empty">Nessuna sessione conclusa, per ora.</li>
          )}
        </ol>
      )}
    </section>
  );
}
