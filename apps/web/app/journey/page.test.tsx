import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import JourneyPage from "./page";
import { DRAFT_KEY } from "../start/discovery-state";
vi.mock("../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
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
    drivers: [{ id: "a", name: "Tecnica", current: 37 }],
    priority: { id: "a", name: "Tecnica", current: 37 },
  },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/journey");
});
describe("PF4 authenticated journey functions", () => {
  it("lets the athlete log out during the journey", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requests.push(url);
        return new Response(JSON.stringify(base));
      }),
    );
    render(<JourneyPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Esci" }));
    expect(requests).toContain("/api/auth/logout");
  });
  it("renders server questions and stops after the last answer without submitting", async () => {
    let state = { ...base };
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        requests.push({ url, body });
        if (url.endsWith("/answer"))
          state = { ...state, currentQuestion: 1, assessmentComplete: true };
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
    expect(
      await screen.findByRole("heading", { name: "Risposte registrate." }),
    ).toBeInTheDocument();
    // Nessun invio automatico: la valutazione parte solo su conferma.
    expect(
      screen.queryAllByRole("button", { name: /Scopri|Invia|Continua/ }),
    ).toHaveLength(0);
    expect(requests.some((r) => r.url.endsWith("/submit"))).toBe(false);
  });
  it("keeps the existing result and duration steps for already submitted athletes", async () => {
    let state = { ...base, phase: "RESULT" };
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        requests.push({ url, body });
        if (url.endsWith("/duration"))
          state = { ...state, phase: body.weeks ? "COMPLETE" : "DURATION" };
        return new Response(JSON.stringify(state));
      }),
    );
    render(<JourneyPage />);
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
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Ho letto e accetto/ }),
    );
    // Con Google l'età si dichiara qui: senza, non si prosegue.
    expect(
      screen.getByRole("button", { name: "Accetta e continua" }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("checkbox", { name: /almeno 18 anni/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Accetta e continua" }),
    );
    await waitFor(() => expect(completed?.discovery).toEqual(draft));
    expect(completed?.acceptedDocuments).toEqual([
      { type: "PRIVACY", version: "1", documentHash: "hash" },
    ]);
    expect(completed?.adultConfirmed).toBe(true);
    // Il marketing è facoltativo e resta spento se non lo si sceglie.
    expect(completed?.marketingAccepted).toBe(false);
    expect(completed?.attribution).toMatchObject({
      anonymousId: expect.any(String),
    });
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
    [12, 4, "dodici domande, quattro minuti."],
    [14, 5, "quattordici domande, cinque minuti."],
    [16, 6, "sedici domande, sei minuti."],
  ])(
    "shows the backend count %i in the PF5 intro",
    async (count, estimatedMinutes, text) => {
      serve(journey({ count, estimatedMinutes }));
      render(<JourneyPage />);
      expect(
        await screen.findByRole("heading", { name: "Ciao Stefano." }),
      ).toBeInTheDocument();
      expect(screen.getByText("Percorso gratuito")).toBeInTheDocument();
      expect(screen.queryByText("5 giorni rimasti")).not.toBeInTheDocument();
      // I numeri arrivano dal backend e sono scritti in lettere, come nel PF5.
      expect(
        screen.getByText(
          `Prima di programmare qualcosa misuriamo dove sei: ${text}`,
        ),
      ).toBeInTheDocument();
      const later = screen.getByRole("region", { name: "Cosa si attiva dopo" });
      expect(within(later).getAllByText("Bloccato")).toHaveLength(3);
      expect(later).toHaveTextContent("Scenari a 3, 6 e 12 mesi");
      expect(later).not.toHaveTextContent("settimane");
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

  it("shows the stop state at the last answer without any next action", async () => {
    const requests = serve({
      ...base,
      count: 14,
      currentQuestion: 14,
      assessmentComplete: true,
    });
    render(<JourneyPage />);
    expect(
      await screen.findByRole("heading", { name: "Risposte registrate." }),
    ).toBeInTheDocument();
    expect(screen.getByText("14 / 14 · Assessment completato")).toBeVisible();
    expect(screen.queryByText("Domanda configurata")).not.toBeInTheDocument();
    expect(requests.some((url) => url.endsWith("/submit"))).toBe(false);
  });

  it("evaluates the answers on confirmation and shows a provisional spider with confidence", async () => {
    let state: Record<string, unknown> = {
      ...base,
      count: 14,
      currentQuestion: 14,
      assessmentComplete: true,
    };
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requests.push(url);
        if (url.endsWith("/evaluate"))
          state = {
            ...state,
            phase: "EVALUATION",
            evaluation: {
              id: "evaluation-1",
              status: "PROVISIONAL",
              source: "SELF_ASSESSMENT",
              summary: "Prima lettura delle tue risposte.",
              overallConfidence: 30,
              scale: { min: 0, max: 100 },
              createdAt: "2026-10-06T22:00:00.000Z",
              drivers: [
                {
                  id: "a",
                  name: "Tecnica",
                  score: 64,
                  confidence: 35,
                  rationale: "Gestisci bene la rete.",
                  evidenceGaps: ["Un video di una partita."],
                },
                {
                  id: "b",
                  name: "Mental",
                  score: 40,
                  confidence: 75,
                  rationale: "Ti riprendi dopo un errore.",
                  evidenceGaps: [],
                },
              ],
            },
          };
        return new Response(JSON.stringify(state));
      }),
    );
    render(<JourneyPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Analizza le mie risposte →" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Ecco dove sei oggi." }),
    ).toBeInTheDocument();
    expect(requests.filter((url) => url.endsWith("/evaluate"))).toHaveLength(1);
    expect(screen.getByText("Prima valutazione · provvisoria")).toBeVisible();
    expect(screen.getByText("Gestisci bene la rete.")).toBeVisible();
    expect(
      screen.getByText("Per affinare: Un video di una partita."),
    ).toBeVisible();
    expect(screen.getByText("affidabilità bassa")).toBeVisible();
    expect(screen.getByText("affidabilità alta")).toBeVisible();
    // Confidence bassa: tratto tenue e tratteggiato, nessun potenziale mostrato.
    const r = screen.getByTestId("provisional-r");
    expect(Number(r.getAttribute("fill-opacity"))).toBeCloseTo(0.33);
    expect(r).toHaveAttribute("stroke-dasharray", "4 3");
    expect(screen.queryByText(/Potenziale/)).not.toBeInTheDocument();
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

it("shows an error for a missing journey without redirecting back to the home page", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 404 })),
  );
  render(<JourneyPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Il tuo percorso non è disponibile. Contatta l’assistenza.",
  );
  expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
});
