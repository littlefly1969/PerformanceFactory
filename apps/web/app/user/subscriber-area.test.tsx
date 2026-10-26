import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";
import ObjectivesPage from "./obiettivi/page";
import TrainingPage from "./training/page";
import type {
  History,
  Home,
  Objective,
  Session,
} from "./_components/athlete-types";
import { calendarFile, objectiveProgress } from "./_components/session-format";
vi.mock("next/navigation", () => ({
  usePathname: () => "/user",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("date=2026-09-08&view=week"),
}));
vi.mock("../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (path: string, init?: RequestInit) => fetch(path, init),
}));
const session: Session = {
  track: "SPORT",
  areaName: null,
  id: "s1",
  date: "2026-09-08",
  sequence: 3,
  status: "SCHEDULED",
  displayStatus: "TODAY",
  title: "Forza esplosiva e appoggi",
  type: "TRAINING",
  body: "Spinta laterale.",
  summary: "",
  details: [],
  canAct: true,
  completedAt: null,
  skippedAt: null,
  completionNotes: null,
  completionRating: null,
  durationMinutes: 30,
  equipment: "Corpo libero",
  mode: "SOLO",
  planVersion: 1,
  exercises: [],
};
const lesson: Session = {
  ...session,
  track: "AREA",
  areaName: "Tecnico-tattico",
  id: "lesson",
  date: "2026-09-10",
  displayStatus: "SCHEDULED",
  title: "Il terzo colpo: quando alzare",
  durationMinutes: 20,
};
const plank: Objective = {
  area: "Preparazione atletica",
  title: "Plank",
  unit: "sec",
  baseline: 48,
  current: 54,
  target: 60,
  targetLabel: null,
  deadline: "Entro fine blocco",
  source: "CHECK_IN_TEST",
};
const coach: Objective = {
  ...plank,
  area: "Tecnico-tattico",
  title: "Rovescio di parete",
  unit: null,
  baseline: null,
  current: null,
  target: null,
  targetLabel: "Valutazione del coach",
  deadline: "Prossima lezione",
  source: "COACH_EVALUATION",
};
const home = {
  firstName: "Stefano",
  today: "2026-09-08",
  performance: {
    snapshotId: "x",
    date: "2026-09-01",
    current: 83,
    drivers: [],
  },
  program: {
    durationWeeks: 12,
    status: "ACTIVE",
    summary: null,
    completed: 0,
    total: 4,
    cycle: {
      version: 1,
      startsOn: "2026-09-01",
      endsOn: "2026-09-14",
      windowDays: 14,
      sessionsPerWeek: 2,
      macroBlock: 1,
      windowInProgram: 1,
      windowsPerProgram: 6,
    },
  },
  primaryAction: { type: "TRAINING_SESSION", session },
  nextSession: null,
  objectives: [plank, coach],
  lessons: [lesson],
  checkIn: { id: "c", kind: "TRAINING", title: "Come stai?", count: 3 },
  streak: { days: 7 },
  week: {
    from: "2026-09-07",
    to: "2026-09-13",
    today: "2026-09-08",
    timeZone: "Europe/Rome",
    sessions: [],
  },
  coaches: [],
} satisfies Home;
const history: History = {
  completed: 1,
  minutes: 30,
  sessions: [
    {
      ...session,
      id: "old",
      date: "2026-09-07",
      status: "COMPLETED",
      displayStatus: "DONE",
      completionRating: 2,
    },
  ],
};
const respond = (value: unknown) => new Response(JSON.stringify(value));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("area abbonato", () => {
  it("home: R, piano, sessione di oggi, check-in, obiettivo e lezioni per area", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(home)),
    );
    render(<HomePage />);
    expect(await screen.findByText("83")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Piano v1.0" })).toHaveAttribute(
      "href",
      "/user/training",
    );
    expect(screen.getByRole("link", { name: /Obiettivi/ })).toHaveAttribute(
      "href",
      "/user/obiettivi",
    );
    expect(screen.getByText("30 min · Corpo libero")).toBeInTheDocument();
    expect(
      screen.getByText("3 domande · 2 min · serie di 7 giorni"),
    ).toBeInTheDocument();
    expect(screen.getByText("Plank · 54 → 60 sec")).toBeInTheDocument();
    expect(
      screen.getByText("Il terzo colpo: quando alzare"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Apri la lezione/ }),
    ).toHaveAttribute("href", "/user/training/sessions/lesson");
  });
  it("obiettivi: valore, scadenza, fonte e avanzamento", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(home)),
    );
    render(<ObjectivesPage />);
    expect(await screen.findByText("54 → 60 sec")).toBeInTheDocument();
    expect(screen.getByText("Valutazione del coach")).toBeInTheDocument();
    expect(
      screen.getByText("Fonte: valutazione del coach"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Avanzamento Plank" }),
    ).toHaveAttribute("aria-valuenow", "50");
  });
  it("calendario: settimana con riposi e storico con la fatica", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("history")) return respond(history);
        const query = new URL(url, "http://test").searchParams;
        return respond({
          from: query.get("from"),
          to: query.get("to"),
          today: "2026-09-08",
          timeZone: "Europe/Rome",
          sessions: [session, lesson],
        });
      }),
    );
    render(<TrainingPage />);
    expect(
      await screen.findByText("Calendario · Piano v1.0"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Riposo")).toHaveLength(5);
    expect(screen.getByText("30 min · da solo")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Giorno" }));
    expect(screen.getByText("Oggi · martedì 8 settembre")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Apri la scheda/ }),
    ).toHaveAttribute("href", "/user/training/sessions/s1");
    expect(
      screen.getByText("Storico allenamenti · 1 sessione · 30 minuti"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Fatica 4 su 5")).toBeInTheDocument();
  });
  it("progress verso un bersaglio che scende e calendario esportabile", () => {
    expect(
      objectiveProgress({
        ...plank,
        baseline: 6.1,
        current: 5.85,
        target: 5.6,
      }),
    ).toBeCloseTo(0.5);
    const ics = calendarFile([session], new Date("2026-09-01T10:00:00Z"));
    expect(ics).toContain("DTSTART;VALUE=DATE:20260908");
    expect(ics).toContain("DTEND;VALUE=DATE:20260909");
    expect(ics).toContain("SUMMARY:Forza esplosiva e appoggi");
  });
});
