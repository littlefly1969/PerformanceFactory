import type { Exercise, Objective, Session } from "./athlete-types";
import { displayDate } from "./athlete-types";

export const modeLabels = {
  SOLO: "Da solo",
  PARTNER: "Con un compagno",
  COACH: "Con il coach",
} as const;

/** Area della lezione o, per il programma sportivo, l'allenamento. */
export function sessionArea(session: Session) {
  return session.track === "AREA" && session.areaName
    ? session.areaName
    : "Allenamento";
}

export function sessionMeta(session: Session) {
  return [
    session.durationMinutes ? `${session.durationMinutes} min` : null,
    session.equipment,
    session.exercises?.length
      ? `${session.exercises.length} ${session.exercises.length === 1 ? "esercizio" : "esercizi"}`
      : null,
  ].filter(Boolean) as string[];
}

/** Passi da eseguire: gli esercizi o, per le sessioni senza, la sessione intera. */
export function sessionSteps(session: Session): Exercise[] {
  if (session.exercises?.length) return session.exercises;
  return [
    {
      name: session.title,
      prescription: session.durationMinutes
        ? `${session.durationMinutes} min`
        : "Sessione",
      cue: session.body,
      demo: "",
      workSeconds: null,
      restSeconds: null,
    },
  ];
}

/**
 * L'atleta dice quanto è stata dura (1 troppo facile, 5 al limite); il backend
 * conserva la valutazione nel verso opposto (bassa = difficile) e riduce il
 * carico quando la media scende a 2. Conversione nei due sensi.
 */
export const ratingFromEffort = (effort: number) => 6 - effort;
export const effortFromRating = (rating: number | null) =>
  rating === null ? null : 6 - rating;

const numberWords = [
  "zero",
  "uno",
  "due",
  "tre",
  "quattro",
  "cinque",
  "sei",
  "sette",
  "otto",
  "nove",
  "dieci",
  "undici",
  "dodici",
];
export function inWords(value: number) {
  return numberWords[value] ?? String(value);
}
export function capitalized(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function twoDigits(value: number) {
  return String(value).padStart(2, "0");
}

export function relativeDay(date: string, today: string) {
  if (date === today) return "Oggi";
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
  if (date === tomorrow) return "Domani";
  return capitalized(displayDate(date, { weekday: "long", day: "numeric" }));
}

const numberFormat = new Intl.NumberFormat("it-IT", {
  maximumFractionDigits: 2,
});
export function objectiveValue(value: number | null) {
  return value === null ? "—" : numberFormat.format(value);
}
export const objectiveSources: Record<Objective["source"], string> = {
  CHECK_IN_TEST: "test del check-in",
  COACH_EVALUATION: "valutazione del coach",
  ATHLETE_ANSWERS: "le tue risposte",
};
/** Avanzamento verso il bersaglio, anche quando il valore deve scendere. */
export function objectiveProgress(objective: Objective) {
  const { baseline, current, target } = objective;
  if (baseline === null || current === null || target === null) return 0;
  if (target === baseline) return current === target ? 1 : 0;
  return Math.min(1, Math.max(0, (current - baseline) / (target - baseline)));
}

function icsDate(date: string) {
  return date.replaceAll("-", "");
}
function icsText(text: string) {
  return text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
}
/** Calendario .ics delle sessioni caricate, come eventi di un giorno intero. */
export function calendarFile(sessions: Session[], stamp = new Date()) {
  const now = stamp.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const events = sessions.map((s) => {
    const next = new Date(Date.parse(`${s.date}T12:00:00Z`) + 86400000)
      .toISOString()
      .slice(0, 10);
    return [
      "BEGIN:VEVENT",
      `UID:${s.id}@performancefactory`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${icsDate(s.date)}`,
      `DTEND;VALUE=DATE:${icsDate(next)}`,
      `SUMMARY:${icsText(s.title)}`,
      `DESCRIPTION:${icsText([sessionArea(s), ...sessionMeta(s)].join(" · "))}`,
      "END:VEVENT",
    ].join("\r\n");
  });
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Performance Factory//Piano//IT",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}
export function downloadCalendar(sessions: Session[], name: string) {
  const url = URL.createObjectURL(
    new Blob([calendarFile(sessions)], { type: "text/calendar" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
