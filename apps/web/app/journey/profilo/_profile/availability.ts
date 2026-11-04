/**
 * Disponibilità dell'atleta (GET/POST /athlete/training/availability): le
 * stesse voci del profilo che il programma legge quando viene creato.
 */
export type Availability = {
  currentFrequency: string | null;
  daysPerWeek: number | null;
  sessionDurationMinutes: number | null;
  programDurationWeeks: number | null;
  /** Giorni ISO: lunedì 1, domenica 7. */
  preferredDays: number[];
};

export const AVAILABILITY_PATH = "/athlete/training/availability";

/** Frequenza abituale: valori del server, testi delle schede della demo. */
export const FREQUENCIES = [
  { value: "0_1", n: "0–1", short: "0–1/sett." },
  { value: "2_3", n: "2–3", short: "2–3/sett." },
  { value: "4_5", n: "4–5", short: "4–5/sett." },
  { value: "6_PLUS", n: "6+", short: "6+/sett." },
] as const;

/** Durate ammesse dal server (le opzioni del template operativo). */
export const DURATIONS = [
  { value: 30, n: "30" },
  { value: 45, n: "45" },
  { value: 60, n: "60" },
  { value: 90, n: "90" },
  { value: 120, n: "120+" },
] as const;

export const WEEKDAYS = ["L", "M", "M", "G", "V", "S", "D"] as const;

/** Giorni e durata salvati: il programma può partire. */
export const availabilityComplete = (a: Availability | null | undefined) =>
  !!a?.daysPerWeek && !!a.sessionDurationMinutes;

/**
 * Giorni da colorare nel riepilogo: quelli scelti, altrimenti una settimana
 * tipo con lo stesso numero di giorni (come nella demo). Indici 0-6 da lunedì.
 */
export function weekPattern(a: Availability) {
  if (a.preferredDays.length) return a.preferredDays.map((d) => d - 1);
  const typical: Record<number, number[]> = {
    1: [2],
    2: [1, 4],
    3: [0, 2, 4],
    4: [0, 2, 4, 5],
    5: [0, 1, 3, 4, 5],
    6: [0, 1, 2, 3, 4, 5],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return typical[a.daysPerWeek ?? 0] ?? [];
}

export const durationLabel = (minutes: number | null) =>
  DURATIONS.find((d) => d.value === minutes)?.n ?? "—";

export const frequencyShort = (value: string | null) =>
  FREQUENCIES.find((f) => f.value === value)?.short ?? "—";

/** Durata del programma, quando c'è: 12, 26 o 52 settimane. */
export function programLabel(weeks: number | null) {
  if (!weeks) return "—";
  const months = { 12: 3, 26: 6, 52: 12 }[weeks];
  return months ? `${months} mesi` : `${weeks} settimane`;
}
