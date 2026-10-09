export type Settings = {
  creditsToUnlock: number;
  creditsInitialAssessment: number;
  creditsCalibrationRound: number;
  creditsMicroTest: number;
};

export type Athlete = {
  userId: string;
  email?: string;
  name?: string;
  level?: string | null;
  levelConfidence?: number | null;
  calibrationStatus?: string | null;
  deadlineAt?: string | null;
};

export type Overview = {
  settings: Settings;
  clubs: Array<{
    id: string;
    name: string;
    city: string | null;
    freeLessonsEnabled: boolean;
  }>;
  coaches: Array<{ id: string; email: string; firstName: string | null }>;
  areas: Array<{ id: string; name: string }>;
  lessons: Array<{
    id: string;
    partnerId: string;
    club: string;
    startsAt: string;
    durationMinutes: number;
    capacity: number;
    levelLabel: string | null;
    status: string;
    coach: { id: string; email: string; firstName: string | null } | null;
    seats: Array<Athlete & { status: string }>;
  }>;
  requests: Array<
    Athlete & { partnerId: string; club: string; requestedAt: string }
  >;
  microTests: Array<{
    id: string;
    areaId: string;
    areaName: string;
    title: string;
    instructions: string;
    options: Array<{ value: string; label: string; score: number }>;
    isActive: boolean;
  }>;
};

export const LEVELS: Record<string, string> = {
  BEGINNER: "Principiante",
  INTERMEDIATE: "Intermedio",
  ADVANCED: "Avanzato",
  COMPETITIVE: "Agonista",
  PRO: "Professionista",
};

export const athleteLabel = (a: Athlete) =>
  `${a.name || a.email || a.userId} · ${a.level ? LEVELS[a.level] : "livello non stimato"}${
    a.levelConfidence != null ? ` (${a.levelConfidence}%)` : ""
  }`;

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
