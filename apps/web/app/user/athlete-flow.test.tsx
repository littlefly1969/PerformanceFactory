import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";
import { TrainingAvailability } from "./profile/training-availability";
import TrainingPage from "./training/page";
import CheckInPage from "./check-in/page";
import ProgressPage from "./performance/page";
import { SessionDetail } from "./training/sessions/[id]/session-detail";
import { SessionPlayer } from "./training/sessions/[id]/esegui/session-player";
import type { Home, Session } from "./_components/athlete-types";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/user",
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("date=2026-09-19"),
}));
vi.mock("../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (path: string, init?: RequestInit) => fetch(path, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
}));
const session: Session = {
  track: "SPORT",
  areaName: null,
  id: "session-one",
  date: "2026-09-19",
  sequence: 1,
  status: "SCHEDULED",
  displayStatus: "TODAY",
  title: "Appoggi e controllo",
  type: "EXERCISE",
  body: "Tre serie di passi laterali.",
  summary: "Il tuo ciclo",
  details: [],
  canAct: true,
  completedAt: null,
  skippedAt: null,
  completionNotes: null,
  completionRating: null,
};
const executable: Session = {
  ...session,
  durationMinutes: 30,
  equipment: "Corpo libero",
  mode: "SOLO",
  goal: "Spinta laterale",
  prerequisites: null,
  week: 2,
  planVersion: 1,
  exercises: [
    {
      name: "Skip laterale",
      prescription: "2 × 40 sec",
      cue: "Busto alto.",
      demo: "Skip lungo la linea di fondo, vista frontale.",
      workSeconds: 40,
      restSeconds: 45,
    },
    {
      name: "Affondi laterali",
      prescription: "12 per lato",
      cue: "Ginocchio sopra il piede.",
      demo: "Affondo laterale.",
      workSeconds: null,
      restSeconds: 45,
    },
  ],
};
const home: Home = {
  firstName: "Ada",
  today: "2026-09-19",
  performance: {
    snapshotId: "s",
    date: "2026-09-19",
    current: 68,
    drivers: [{ id: "a", name: "Tecnica", current: 68 }],
  },
  program: {
    durationWeeks: 12,
    status: "ACTIVE",
    summary: "Il tuo ciclo",
    completed: 0,
    total: 1,
  },
  primaryAction: { type: "TRAINING_SESSION", session },
  nextSession: null,
  checkIn: null,
  streak: { days: 0 },
  week: {
    from: "2026-09-14",
    to: "2026-09-20",
    today: "2026-09-19",
    timeZone: "Europe/Rome",
    sessions: [session],
  },
  coaches: [],
};
const requests: { url: string; body?: unknown }[] = [];
function respond(value: unknown) {
  return new Response(JSON.stringify(value));
}
beforeEach(() => {
  requests.length = 0;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("PF4 athlete experience", () => {
  it("keeps logout in the profile, reached from the home avatar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(home)),
    );
    render(<HomePage />);
    expect(
      await screen.findByRole("link", { name: "Il tuo profilo" }),
    ).toHaveAttribute("href", "/user/profile");
  });
  it("shows real performance and one prominent session CTA", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(home)),
    );
    render(<HomePage />);
    expect(
      await screen.findByRole("heading", { name: session.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Inizia ora/ })).toHaveAttribute(
      "href",
      "/user/training/sessions/session-one/esegui",
    );
    expect(screen.getByText("68")).toBeInTheDocument();
    expect(screen.queryByText(/calorie|punti|minuti/i)).not.toBeInTheDocument();
  });
  it("shows preparation without a fabricated workout or duration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond({
          ...home,
          primaryAction: { type: "PREPARING" },
          performance: null,
          program: {
            status: "PREPARING",
            total: 0,
            completed: 0,
            durationWeeks: null,
          },
          week: { ...home.week, sessions: [] },
        }),
      ),
    );
    render(<HomePage />);
    expect(
      await screen.findByText("Stiamo preparando il tuo programma."),
    ).toBeInTheDocument();
    expect(screen.queryByText(session.title)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Inizia la sessione/ }),
    ).not.toBeInTheDocument();
  });
  it("requests a plan once and displays preparation after the saved command", async () => {
    let requested = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          requests.push({ url });
          requested = true;
          return respond({ status: "PREPARING" });
        }
        return respond({
          ...home,
          program: {
            ...home.program,
            status: requested ? "PREPARING" : "EMPTY",
          },
          primaryAction: { type: requested ? "PREPARING" : "REQUEST_PLAN" },
          lifecycle: {
            status: requested ? "PREPARING" : "EMPTY",
            requestAllowed: !requested,
          },
        });
      }),
    );
    render(<HomePage />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Prepara il mio piano/ }),
    );
    expect(
      await screen.findByText("Stiamo preparando il tuo programma."),
    ).toBeInTheDocument();
    expect(requests).toEqual([{ url: "/api/training/lifecycle/request" }]);
  });
  it("explains automatic recovery without exposing provider or approval details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond({
          ...home,
          program: { ...home.program, status: "ERROR" },
          primaryAction: { type: "ERROR" },
          lifecycle: {
            status: "ERROR",
            retryScheduled: true,
            requestAllowed: true,
            errorCode: "AI_GENERATION_FAILED",
          },
        }),
      ),
    );
    render(<HomePage />);
    expect(
      await screen.findByText(/La richiesta è salvata/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /AI_GENERATION_FAILED|professional approval|coach lookup/,
      ),
    ).not.toBeInTheDocument();
  });
  it("describes preparation of the next cycle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond({
          ...home,
          program: { ...home.program, status: "PREPARING" },
          primaryAction: { type: "PREPARING" },
          lifecycle: { status: "PREPARING", preparingNext: true },
        }),
      ),
    );
    render(<HomePage />);
    expect(
      await screen.findByText("Stiamo preparando il prossimo ciclo."),
    ).toBeInTheDocument();
  });
  it("waits for the end of a completed window and keeps the strategic program duration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond({
          ...home,
          primaryAction: { type: "WINDOW_COMPLETE" },
          program: {
            ...home.program,
            cycle: {
              version: 3,
              startsOn: "2026-10-01",
              endsOn: "2026-10-14",
              windowDays: 14,
              sessionsPerWeek: 4,
              macroBlock: 1,
              windowInProgram: 3,
              windowsPerProgram: 6,
            },
          },
        }),
      ),
    );
    render(<HomePage />);
    expect(
      await screen.findByText("Hai concluso gli allenamenti di questo blocco."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Il prossimo ciclo sarà preparato alla fine della finestra, il 14 ottobre/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Finestra corrente")).toHaveTextContent(
      "Finestra 3 / 6 · programma di 12 settimane",
    );
    expect(
      screen.queryByRole("button", { name: /Prepara il mio piano/ }),
    ).not.toBeInTheDocument();
  });
  it("asks for missing availability through the athlete profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond({
          ...home,
          primaryAction: { type: "ERROR" },
          lifecycle: {
            status: "ERROR",
            errorCode: "TRAINING_AVAILABILITY_REQUIRED",
            retryScheduled: true,
            requestAllowed: true,
          },
        }),
      ),
    );
    render(<HomePage />);
    expect(
      await screen.findByRole("link", { name: /Completa il profilo/ }),
    ).toHaveAttribute("href", "/user/profile");
    expect(
      screen.queryByText(/TRAINING_AVAILABILITY_REQUIRED/),
    ).not.toBeInTheDocument();
  });
  it("saves actual availability and the existing duration choices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST")
          requests.push({ url, body: JSON.parse(String(init.body)) });
        return respond({
          currentFrequency: "2_3",
          daysPerWeek: null,
          sessionDurationMinutes: null,
          programDurationWeeks: 12,
          preferredDays: [],
        });
      }),
    );
    render(<TrainingAvailability />);
    await userEvent.selectOptions(
      await screen.findByLabelText(/Quanti giorni/),
      "4",
    );
    await userEvent.selectOptions(screen.getByLabelText(/Quanto tempo/), "60");
    expect(screen.getByLabelText("Durata del programma")).toHaveValue("12");
    await userEvent.click(
      screen.getByRole("button", { name: /Salva disponibilità/ }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Disponibilità salvata",
    );
    expect(requests[0]).toEqual({
      url: "/api/athlete/training/availability",
      body: {
        currentFrequency: "2_3",
        daysPerWeek: 4,
        sessionDurationMinutes: 60,
        programDurationWeeks: 12,
        preferredDays: [],
      },
    });
  });
  it("navigates bounded calendar months and selects persisted sessions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requests.push({ url });
        const query = new URL(url, "http://test").searchParams;
        return respond({
          ...home.week,
          from: query.get("from"),
          to: query.get("to"),
          sessions: query.get("from") === "2026-09-01" ? [session] : [],
          completed: 0,
          minutes: 0,
        });
      }),
    );
    render(<TrainingPage />);
    expect(await screen.findByText(session.title)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Mese successivo" }),
    );
    await waitFor(() =>
      expect(
        requests.filter((r) => r.url.includes("calendar")).at(-1)?.url,
      ).toContain("from=2026-09-28&to=2026-10-31"),
    );
    expect(
      await screen.findByText("Nessuna sessione in questa data."),
    ).toBeInTheDocument();
  });
  it("mostra nel calendario anche le sedute di area con la loro abilita", async () => {
    const areaSession: Session = {
      ...session,
      track: "AREA",
      areaName: "Preparazione atletica",
      id: "area-session",
      title: "Forza e stabilità",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const query = new URL(url, "http://test").searchParams;
        return respond({
          ...home.week,
          from: query.get("from"),
          to: query.get("to"),
          sessions:
            query.get("from") === "2026-09-01" ? [session, areaSession] : [],
        });
      }),
    );
    render(<TrainingPage />);
    expect(await screen.findByText("Forza e stabilità")).toBeInTheDocument();
    expect(screen.getAllByText(/Preparazione atletica/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(session.title)).toBeInTheDocument();
  });
  it("uses one check-in question at a time and submits existing option IDs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          requests.push({ url, body: JSON.parse(String(init.body)) });
          return respond({ status: "CLOSED" });
        }
        return respond({
          id: "check",
          kind: "TRAINING",
          title: "Check-in allenamento",
          questions: [
            {
              id: "q1",
              text: "Come stai?",
              options: [{ id: "o1", label: "Bene" }],
            },
            {
              id: "q2",
              text: "Come recuperi?",
              options: [{ id: "o2", label: "Recupero completo" }],
            },
          ],
        });
      }),
    );
    render(<CheckInPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Bene/ }));
    expect(screen.queryByText("Come recuperi?")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Continua/ }));
    await userEvent.click(
      screen.getByRole("button", { name: /Recupero completo/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: /Concludi/ }));
    expect(await screen.findByText("✓ Check-in salvato")).toBeInTheDocument();
    expect(requests[0]).toEqual({
      url: "/api/answers/training/batch",
      body: {
        questionSetId: "check",
        answers: [
          { questionId: "q1", answerOptionId: "o1" },
          { questionId: "q2", answerOptionId: "o2" },
        ],
      },
    });
  });
  it("shows the session sheet with its exercises and lets the athlete skip it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          requests.push({ url });
          return respond({ status: "SKIPPED" });
        }
        return respond(executable);
      }),
    );
    render(<SessionDetail id={session.id} />);
    expect(
      await screen.findByRole("heading", { name: session.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sessione 01 · Settimana 02")).toBeInTheDocument();
    expect(screen.getByText("Spinta laterale")).toBeInTheDocument();
    expect(screen.getByText("Da solo")).toBeInTheDocument();
    expect(screen.getByText("Skip laterale")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Inizia la sessione" }),
    ).toHaveAttribute("href", "/user/training/sessions/session-one/esegui");
    await userEvent.click(
      screen.getByRole("button", { name: "Salta la sessione" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Conferma: salta la sessione/ }),
    );
    expect(requests[0]).toEqual({
      url: "/api/athlete/training/sessions/session-one/skip",
    });
  });
  it("runs the session exercise by exercise, rests, and saves the effort", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          requests.push({ url, body: JSON.parse(String(init.body)) });
          return respond({ status: "COMPLETED" });
        }
        return respond(executable);
      }),
    );
    render(<SessionPlayer id={session.id} />);
    expect(await screen.findByText("01 / 02")).toBeInTheDocument();
    expect(screen.getByText("Video demo · Placeholder")).toBeInTheDocument();
    expect(
      screen.getByText("Skip lungo la linea di fondo, vista frontale."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fatto" }));
    expect(screen.getByText("Riposo")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Salta il riposo" }),
    );
    expect(screen.getByText("Affondi laterali")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Salta questo esercizio" }),
    );
    expect(screen.getByText("Uno su due.")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Torna alla home" });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    await userEvent.click(save);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/user"));
    // 2 = abbastanza facile: il backend conserva la valutazione rovesciata.
    expect(requests[0]).toEqual({
      url: "/api/athlete/training/sessions/session-one/complete",
      body: {
        completionRating: 4,
        completionNotes: "Esercizi saltati: Affondi laterali.",
      },
    });
  });
  it("records a session with every exercise skipped as skipped, or resumes it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          requests.push({ url });
          return respond({ status: "SKIPPED" });
        }
        return respond(executable);
      }),
    );
    window.sessionStorage.clear();
    render(<SessionPlayer id={session.id} />);
    for (let i = 0; i < 2; i++)
      await userEvent.click(
        await screen.findByRole("button", { name: "Salta questo esercizio" }),
      );
    expect(screen.getByText("Zero su due.")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Riprendi la sessione" }),
    );
    expect(screen.getByText("01 / 02")).toBeInTheDocument();
    for (let i = 0; i < 2; i++)
      await userEvent.click(
        screen.getByRole("button", { name: "Salta questo esercizio" }),
      );
    await userEvent.click(
      screen.getByRole("button", { name: "Segna come saltata" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/user"));
    expect(requests).toEqual([
      { url: "/api/athlete/training/sessions/session-one/skip" },
    ]);
  });
  it("shows the perceived effort of a completed session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond({
          ...executable,
          status: "COMPLETED",
          displayStatus: "DONE",
          canAct: false,
          completionRating: 4,
          completionNotes: "Ottimo",
        }),
      ),
    );
    render(<SessionDetail id={session.id} />);
    expect(
      await screen.findByText("Fatica percepita: 2 / 5"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ottimo")).toBeInTheDocument();
  });
  it("reuses performance visuals and renders real history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond({ current: home.performance, history: [home.performance] }),
      ),
    );
    render(<ProgressPage />);
    expect(
      await screen.findByRole("img", {
        name: "Performance attuale per driver",
      }),
    ).toBeInTheDocument();
    // La P a passo fisso non si mostra all'atleta.
    expect(screen.queryByText(/otenziale/)).not.toBeInTheDocument();
    expect(screen.getByText("01 · Tecnica")).toBeInTheDocument();
  });
});
