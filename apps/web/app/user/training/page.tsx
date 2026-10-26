"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SubscriberShell } from "../_components/subscriber-shell";
import { useAthlete } from "../_components/use-athlete";
import {
  addDays,
  displayDate,
  todayDate,
  type Calendar,
  type History,
} from "../_components/athlete-types";
import { capitalized, downloadCalendar } from "../_components/session-format";
import {
  DayView,
  HistoryList,
  MonthView,
  WeekView,
  weekStart,
} from "./calendar-views";

type View = "month" | "week" | "day";
const views: [View, string][] = [
  ["month", "Mese"],
  ["week", "Settimana"],
  ["day", "Giorno"],
];

function monthRange(date: string) {
  const start = `${date.slice(0, 7)}-01`;
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return { from: start, to: d.toISOString().slice(0, 10) };
}
function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value))
    ? value
    : null;
}

function TrainingCalendar() {
  const params = useSearchParams();
  const [selected, setSelected] = useState(
    validDate(params.get("date")) ?? todayDate(),
  );
  const [view, setView] = useState<View>(
    (["week", "day"] as const).find((v) => v === params.get("view")) ?? "month",
  );
  const range = monthRange(selected);
  // La settimana può scavalcare il mese: si carica l'unione dei due intervalli.
  const start = weekStart(selected);
  const from = start < range.from ? start : range.from;
  const to = addDays(start, 6) > range.to ? addDays(start, 6) : range.to;
  const { data, error, reload } = useAthlete<Calendar>(
    `/athlete/training/calendar?from=${from}&to=${to}`,
  );
  const { data: history } = useAthlete<History>("/athlete/training/history");
  const current = data?.from === from ? data : undefined;
  const version = current?.sessions.find((s) => s.planVersion)?.planVersion;
  const move = (offset: number) => {
    if (view === "month") {
      const d = new Date(`${range.from}T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + offset);
      setSelected(d.toISOString().slice(0, 10));
    } else setSelected(addDays(selected, offset * (view === "week" ? 7 : 1)));
  };
  const unit = { month: "Mese", week: "Settimana", day: "Giorno" }[view];
  return (
    <SubscriberShell
      back="/user"
      kicker={`Calendario${version ? ` · Piano v${version}.0` : ""}`}
      action={
        <button
          className="pfs-link"
          disabled={!current?.sessions.length}
          onClick={() =>
            current &&
            downloadCalendar(
              current.sessions.filter(
                (s) => s.date >= range.from && s.date <= range.to,
              ),
              `piano-${range.from.slice(0, 7)}.ics`,
            )
          }
        >
          Esporta
        </button>
      }
      nav
      error={error}
      reload={reload}
      loading={!current}
    >
      <div className="pfs-month-heading">
        <h1 className="pfs-title">
          {capitalized(
            displayDate(range.from, { month: "long", year: "numeric" }),
          )}
        </h1>
        <div>
          <button
            className="pfs-arrow"
            onClick={() => move(-1)}
            aria-label={`${unit} precedente`}
          >
            ←
          </button>
          <button
            className="pfs-arrow"
            onClick={() => move(1)}
            aria-label={`${unit === "Settimana" ? "Settimana successiva" : `${unit} successivo`}`}
          >
            →
          </button>
        </div>
      </div>
      <div
        className="pfs-tabs"
        role="tablist"
        aria-label="Vista del calendario"
      >
        {views.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={view === value}
            onClick={() => setView(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {current && view === "month" && (
        <MonthView
          from={range.from}
          to={range.to}
          today={current.today}
          selected={selected}
          sessions={current.sessions}
          onSelect={setSelected}
        />
      )}
      {current && view === "week" && (
        <WeekView
          start={start}
          today={current.today}
          sessions={current.sessions}
        />
      )}
      {current && view === "day" && (
        <DayView
          date={selected}
          today={current.today}
          sessions={current.sessions}
        />
      )}
      {current && <HistoryList history={history} expanded={view === "day"} />}
    </SubscriberShell>
  );
}

export default function TrainingPage() {
  return (
    <Suspense>
      <TrainingCalendar />
    </Suspense>
  );
}
