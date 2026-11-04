import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import JourneyPage from "./page";
vi.mock("../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Percorso in assessment: le domande arrivano a coppie, un'area alla volta. */
const base = {
  phase: "ASSESSMENT",
  nextStep: "ASSESSMENT",
  currentQuestion: 0,
  assessmentComplete: false,
  welcomeCompleted: true,
  estimatedMinutes: 1,
  answers: {},
  questions: [],
};
const journey = (extra: Record<string, unknown>) => ({
  ...base,
  phase: "ASSESSMENT_INTRO",
  firstName: "Stefano",
  trial: { days: 7, daysLeft: 5 },
  ...extra,
});

describe("Assessment a coppie come la demo PF10", () => {
  const drivers = [
    { id: "tt", name: "Tecnico-tattico", count: 2 },
    { id: "me", name: "Mental", count: 2 },
  ];
  const pairQuestion = (id: string, areaId: string, areaName: string) => ({
    id,
    kind: "AREA",
    section: areaName,
    title: `Domanda ${id}`,
    areaId,
    areaName,
    options: [{ value: "1", label: `Risposta ${id}` }],
  });

  it("starts from the button with the hexagon while the AI writes the first pair", async () => {
    let state: Record<string, unknown> = journey({
      count: 4,
      driverList: drivers,
    });
    const requests: string[] = [];
    let release: () => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requests.push(url);
        if (url.endsWith("/start"))
          state = { ...state, phase: "ASSESSMENT", questionsPending: true };
        if (url.endsWith("/questions")) {
          // L'AI lavora finché il test non la sblocca.
          await new Promise<void>((resolve) => (release = resolve));
          state = {
            ...state,
            questionsPending: false,
            questions: [
              pairQuestion("q1", "tt", "Tecnico-tattico"),
              pairQuestion("q2", "tt", "Tecnico-tattico"),
            ],
          };
        }
        return new Response(JSON.stringify(state));
      }),
    );
    render(<JourneyPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Inizia l’assessment" }),
    );
    expect(requests).toContain("/api/athlete-journey/start");
    // Nessuna domanda sul tempo: subito l'esagono, finché l'AI non risponde.
    expect(
      await screen.findByRole("heading", { name: "Preparo le tue domande." }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(requests.filter((url) => url.endsWith("/questions"))).toHaveLength(
        1,
      ),
    );
    await new Promise((r) => setTimeout(r, 2700));
    expect(
      screen.getByRole("heading", { name: "Preparo le tue domande." }),
    ).toBeInTheDocument();
    release();
    expect(await screen.findByText("Domanda q1")).toBeVisible();
    expect(screen.getByText("Tecnico-tattico")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemax",
      "4",
    );
    expect(requests.filter((url) => url.endsWith("/questions"))).toHaveLength(
      1,
    );
  }, 10000);

  it("draws the side of the closed area while the AI writes the next pair", async () => {
    const pair = [
      pairQuestion("q1", "tt", "Tecnico-tattico"),
      pairQuestion("q2", "tt", "Tecnico-tattico"),
    ];
    let state: Record<string, unknown> = {
      ...base,
      count: 4,
      driverList: drivers,
      currentQuestion: 1,
      questions: pair,
    };
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requests.push(url);
        if (url.endsWith("/answer"))
          state = { ...state, currentQuestion: 2, questionsPending: true };
        if (url.endsWith("/questions"))
          state = {
            ...state,
            questionsPending: false,
            questions: [
              ...pair,
              pairQuestion("q3", "me", "Mental"),
              pairQuestion("q4", "me", "Mental"),
            ],
          };
        return new Response(JSON.stringify(state));
      }),
    );
    render(<JourneyPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Risposta q2" }),
    );
    // Il lato dell'area appena chiusa, con il nome dell'area e la prossima.
    expect(
      await screen.findByRole("heading", { name: "Tecnico-tattico, fatto." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ora mental.")).toBeInTheDocument();
    expect(screen.getByText("Area 1 di 2")).toBeInTheDocument();
    await waitFor(() =>
      expect(requests.some((url) => url.endsWith("/questions"))).toBe(true),
    );
    // Anche con la coppia già pronta il lato resta almeno un giro.
    expect(screen.queryByText("Domanda q3")).toBeNull();
    expect(
      await screen.findByText("Domanda q3", {}, { timeout: 3000 }),
    ).toBeVisible();
  });

  it("offers a retry when the AI could not write the pair, with no fallback questions", async () => {
    let fail = true;
    let state: Record<string, unknown> = {
      ...base,
      count: 4,
      driverList: drivers,
      currentQuestion: 2,
      questionsPending: true,
      questions: [
        pairQuestion("q1", "tt", "Tecnico-tattico"),
        pairQuestion("q2", "tt", "Tecnico-tattico"),
      ],
    };
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requests.push(url);
        if (url.endsWith("/questions")) {
          if (fail)
            return new Response(
              JSON.stringify({
                message:
                  "Non siamo riusciti a preparare le tue domande. Riprova.",
              }),
              { status: 502 },
            );
          state = {
            ...state,
            questionsPending: false,
            questions: [
              ...(state.questions as unknown[]),
              pairQuestion("q3", "me", "Mental"),
              pairQuestion("q4", "me", "Mental"),
            ],
          };
        }
        return new Response(JSON.stringify(state));
      }),
    );
    render(<JourneyPage />);
    expect(
      await screen.findByText(
        "Non siamo riusciti a preparare le tue domande. Riprova.",
      ),
    ).toBeInTheDocument();
    // Un solo tentativo automatico: il nuovo è su richiesta.
    expect(requests.filter((url) => url.endsWith("/questions"))).toHaveLength(
      1,
    );
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Domanda q3")).toBeVisible();
    expect(requests.filter((url) => url.endsWith("/questions"))).toHaveLength(
      2,
    );
  });
});
