import type { Driver } from "../../journey/journey-types";
export type Session = {
  /** SPORT: programma sportivo. AREA: seduta di un'abilità a calendario. */
  track: "SPORT" | "AREA";
  areaName: string | null;
  id: string;
  date: string;
  sequence: number;
  status: "SCHEDULED" | "COMPLETED" | "SKIPPED";
  displayStatus: "DONE" | "TODAY" | "SKIPPED" | "SCHEDULED" | "MISSED";
  title: string;
  type: string;
  body: string;
  summary: string;
  details: { label: string; value: string }[];
  canAct: boolean;
  completedAt: string | null;
  skippedAt: string | null;
  completionNotes: string | null;
  completionRating: number | null;
  /** Campi scritti dall'AI per l'esecuzione: assenti nelle sessioni precedenti. */
  durationMinutes?: number | null;
  restSeconds?: number | null;
  equipment?: string | null;
  mode?: "SOLO" | "PARTNER" | "COACH" | null;
  goal?: string | null;
  prerequisites?: string | null;
  exercises?: Exercise[];
  week?: number | null;
  planVersion?: number;
};
export type Exercise = {
  name: string;
  prescription: string;
  cue: string;
  /** Descrizione del video dimostrativo, mostrata finché l'archivio non c'è. */
  demo: string;
  workSeconds: number | null;
  restSeconds: number | null;
};
export type Objective = {
  area: string;
  title: string;
  unit: string | null;
  baseline: number | null;
  current: number | null;
  target: number | null;
  targetLabel: string | null;
  deadline: string;
  source: "CHECK_IN_TEST" | "COACH_EVALUATION" | "ATHLETE_ANSWERS";
};
export type History = {
  completed: number;
  minutes: number;
  sessions: Session[];
};
export type Calendar = {
  from: string;
  to: string;
  today: string;
  timeZone: string;
  sessions: Session[];
};
export type Performance = {
  snapshotId: string;
  date: string;
  current: number;
  drivers: Driver[];
};
export type Lifecycle = {
  cycleId: string | null;
  status:
    | "EMPTY"
    | "PREPARING"
    | "READY"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "ERROR";
  preparingNext: boolean;
  retryScheduled: boolean;
  requestAllowed: boolean;
  errorCode?: string | null;
};
export type Home = {
  lifecycle?: Lifecycle;
  firstName: string | null;
  today: string;
  performance: Performance | null;
  program: {
    durationWeeks: number | null;
    cycle?: {
      version: number;
      startsOn: string;
      endsOn: string;
      windowDays: number;
      sessionsPerWeek: number | null;
      macroBlock: number | null;
      windowInProgram: number | null;
      windowsPerProgram: number | null;
    } | null;
    status: string;
    summary: string | null;
    completed: number;
    total: number;
  };
  primaryAction:
    | { type: "TRAINING_SESSION"; session: Session }
    | {
        type:
          | "CHECK_IN"
          | "PREPARING"
          | "NONE"
          | "REQUEST_PLAN"
          | "ERROR"
          | "WINDOW_COMPLETE";
      };
  nextSession: Session | null;
  objectives?: Objective[];
  /** Prossima lezione di ogni area a calendario. */
  lessons?: Session[];
  checkIn: { id: string; kind: string; title: string; count: number } | null;
  streak: { days: number };
  week: Calendar;
  coaches: { name: string }[];
};
export type CheckIn = {
  id: string;
  kind: "TRAINING" | "AREA";
  title: string;
  questions: {
    id: string;
    text: string;
    options: { id: string; label: string }[];
  }[];
};
export const sessionLabels: Record<Session["displayStatus"], string> = {
  DONE: "Fatto",
  TODAY: "Oggi",
  SKIPPED: "Saltato",
  SCHEDULED: "In programma",
  MISSED: "Non svolto",
};
export function displayDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) {
  return new Intl.DateTimeFormat("it-IT", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));
}
export function todayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function addDays(date: string, offset: number) {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + offset * 86400000)
    .toISOString()
    .slice(0, 10);
}
