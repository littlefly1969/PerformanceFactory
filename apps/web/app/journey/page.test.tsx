import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import JourneyPage from "./page";
import { DRAFT_KEY } from "../start/discovery-state";
vi.mock("../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
}));
const document = {
  type: "PRIVACY",
  title: "Privacy",
  summary: "Sintesi",
  body: ["Testo vigente"],
  version: "1",
  documentHash: "hash",
};
const base = {
  phase: "ASSESSMENT",
  nextStep: "ASSESSMENT",
  currentQuestion: 0,
  assessmentComplete: false,
  count: 1,
  estimatedMinutes: 1,
  driverList: [],
  answers: {},
  questions: [
    {
      id: "configured-question",
      title: "Domanda configurata",
      areaName: "Tecnica",
      options: [{ value: "yes", label: "Risposta configurata" }],
    },
  ],
  durationOptions: [
    { weeks: 12, label: "12 settimane", description: "Un ciclo completo" },
  ],
  programDurationWeeks: null,
  result: {
    snapshotId: "real-snapshot",
    current: 37,
    potential: 52,
    gap: 15,
    drivers: [
      { id: "a", name: "Tecnica", current: 37, potential: 52, gap: 15 },
    ],
    priority: { id: "a", name: "Tecnica", current: 37, potential: 52, gap: 15 },
  },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/journey");
});
describe("PF4 authenticated journey functions", () => {
  it("renders server questions, submits, displays server result and saves duration", async () => {
    let state = { ...base };
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        requests.push({ url, body });
        if (url.endsWith("/answer"))
          state = { ...state, currentQuestion: 1, assessmentComplete: true };
        if (url.endsWith("/submit")) state = { ...state, phase: "RESULT" };
        if (url.endsWith("/duration"))
          state = { ...state, phase: body.weeks ? "COMPLETE" : "DURATION" };
        return new Response(JSON.stringify(state));
      }),
    );
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ currentStep: "forged", answers: { bad: true } }),
    );
    render(<JourneyPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Risposta configurata" }),
    );
    expect(requests.find((r) => r.url.endsWith("/answer"))?.body).toEqual({
      questionId: "configured-question",
      value: "yes",
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Scopri la tua performance" }),
    );
    expect((await screen.findAllByText("37")).length).toBeGreaterThan(0);
    await userEvent.click(
      screen.getByRole("button", { name: /Quanto tempo ti dai/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Conferma la durata" }),
    );
    expect(
      requests.filter((r) => r.url.endsWith("/duration")).at(-1)?.body,
    ).toEqual({ weeks: 12 });
    expect(
      await screen.findByRole("link", { name: /Vai al programma/ }),
    ).toHaveAttribute("href", "/user");
  });
  it("resumes the backend duration stage directly, without an anonymous draft", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ...base, phase: "DURATION" })),
      ),
    );
    render(<JourneyPage />);
    expect(
      await screen.findByRole("heading", { name: "Quanto tempo ti dai?" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Domanda configurata")).not.toBeInTheDocument();
  });
  it("keeps Google discovery through redirect until explicit current consents and successful registration", async () => {
    window.history.replaceState(null, "", "/journey?google=complete");
    const draft = {
      version: 9,
      currentStep: "registration",
      answers: { weight: 75 },
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    let completed: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/athlete-discovery"))
          return new Response(
            JSON.stringify({
              version: 9,
              questions: [
                {
                  id: "weight",
                  code: "weight",
                  title: "Peso",
                  type: "number",
                  required: true,
                  order: 1,
                  min: 30,
                  max: 200,
                  options: [],
                },
              ],
            }),
          );
        if (url.endsWith("/pending"))
          return new Response(JSON.stringify({ email: "google@example.test" }));
        if (url.endsWith("/documents"))
          return new Response(JSON.stringify([document]));
        if (url.endsWith("/complete")) {
          completed = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ status: "ACTIVE" }));
        }
        return new Response(JSON.stringify(base));
      }),
    );
    render(<JourneyPage />);
    expect(
      await screen.findByRole("button", { name: "Accetta e continua" }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(
      screen.getByRole("button", { name: "Accetta e continua" }),
    );
    await waitFor(() => expect(completed?.discovery).toEqual(draft));
    expect(completed?.acceptedDocuments).toEqual([
      { type: "PRIVACY", version: "1", documentHash: "hash" },
    ]);
    expect(await screen.findByText("Domanda configurata")).toBeInTheDocument();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe("PF5 assessment intro and questions", () => {
  const journey = (extra: Record<string, unknown>) => ({
    ...base,
    phase: "ASSESSMENT_INTRO",
    questions: [],
    firstName: "Stefano",
    trial: { days: 7, daysLeft: 5 },
    ...extra,
  });
  function serve(state: Record<string, unknown>) {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requests.push(url);
        return new Response(JSON.stringify(state));
      }),
    );
    return requests;
  }

  it.each([
    [12, 4, "12 domande, circa 4 minuti."],
    [14, 5, "14 domande, circa 5 minuti."],
    [16, 6, "16 domande, circa 6 minuti."],
  ])(
    "shows the backend count %i in the PF5 intro",
    async (count, estimatedMinutes, text) => {
      serve(journey({ count, estimatedMinutes }));
      render(<JourneyPage />);
      expect(
        await screen.findByRole("heading", { name: "Ciao Stefano." }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Prova gratuita attiva · 5 giorni rimasti"),
      ).toBeInTheDocument();
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Scopri la tua performance" }),
      ).toBeEnabled();
      cleanup();
    },
  );

  it("starts from the intro and shows the operational section first", async () => {
    const requests = serve(journey({ count: 14, estimatedMinutes: 5 }));
    render(<JourneyPage />);
    const operational = {
      ...base,
      count: 14,
      questions: [
        {
          id: "days",
          kind: "OPERATIONAL",
          section: "Disponibilità",
          title: "Quanti giorni alla settimana puoi realisticamente allenarti?",
          areaId: null,
          areaName: null,
          options: [{ value: 2, label: "2 giorni" }],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requests.push(url);
        return new Response(JSON.stringify(operational));
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Scopri la tua performance" }),
    );
    expect(requests.at(-1)).toBe("/api/athlete-journey/start");
    expect(await screen.findByText("1 / 14 · Disponibilità")).toBeVisible();
    // Il progressivo usa il totale del backend.
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemax",
      "14",
    );
  });

  it("stops at the last answer without submitting on its own", async () => {
    const requests = serve({
      ...base,
      count: 14,
      currentQuestion: 14,
      assessmentComplete: true,
    });
    render(<JourneyPage />);
    expect(
      await screen.findByRole("heading", {
        name: "Le tue risposte sono complete.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Domanda configurata")).not.toBeInTheDocument();
    expect(requests.some((url) => url.endsWith("/submit"))).toBe(false);
  });

  it("explains a configuration error instead of starting", async () => {
    serve({ ...base, phase: "ASSESSMENT_UNAVAILABLE", questions: [] });
    render(<JourneyPage />);
    expect(
      await screen.findByRole("heading", {
        name: "Il questionario non è ancora disponibile.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Scopri la tua performance" }),
    ).not.toBeInTheDocument();
  });
});
