import Link from "next/link";
import type { Calendar, Session } from "./athlete-types";
import { addDays, displayDate, sessionLabels } from "./athlete-types";
export function CalendarLegend() {
  return (
    <div className="pf4-calendar-legend">
      {(["DONE", "TODAY", "SKIPPED", "SCHEDULED", "MISSED"] as const).map(
        (state) => (
          <span key={state}>
            <i className={`state-${state}`} />
            {sessionLabels[state]}
          </span>
        ),
      )}
    </div>
  );
}
export function dayState(sessions: Session[], date: string, today: string) {
  if (sessions.length && sessions.every((s) => s.status === "COMPLETED"))
    return "DONE";
  if (date === today) return "TODAY";
  if (sessions.some((s) => s.displayStatus === "MISSED")) return "MISSED";
  if (sessions.some((s) => s.status === "SCHEDULED")) return "SCHEDULED";
  return sessions.length ? "SKIPPED" : "EMPTY";
}
export function CalendarStrip({ calendar }: { calendar: Calendar }) {
  return (
    <section className="pf4-athlete-section">
      <div className="pf4-section-heading">
        <span>Questa settimana</span>
        <Link href="/user/training">Calendario →</Link>
      </div>
      <div className="pf4-calendar-week">
        {Array.from({ length: 7 }, (_, i) => {
          const date = addDays(calendar.from, i),
            sessions = calendar.sessions.filter((s) => s.date === date);
          return (
            <Link
              key={date}
              href={`/user/training?date=${date}`}
              aria-label={`${displayDate(date)} · ${sessions.length} sessioni`}
            >
              <small>{displayDate(date, { weekday: "short" })}</small>
              <span
                className={`pf4-calendar-day state-${dayState(sessions, date, calendar.today)}`}
              >
                {Number(date.slice(-2))}
              </span>
              <em>{sessions.length ? "·" : ""}</em>
            </Link>
          );
        })}
      </div>
      <CalendarLegend />
    </section>
  );
}
export function SessionCard({ session }: { session: Session }) {
  return (
    <Link
      className="pf4-session-card"
      href={`/user/training/sessions/${session.id}`}
    >
      <div>
        <span className="pf4-kicker">
          {sessionLabels[session.displayStatus]} · {displayDate(session.date)}
          {session.track === "AREA" && session.areaName
            ? ` · ${session.areaName}`
            : ""}
        </span>
        <h2>{session.title}</h2>
        <p>
          {session.type}
          {session.details.map((d) => ` · ${d.value} ${d.label}`).join("")}
        </p>
      </div>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
