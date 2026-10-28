import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "../profilo/page";
import CoachPage from "../coach/page";
import CalibrationPage from "../calibrazione/page";
import ClubPage from "../circolo/page";
import type { Journey } from "../journey-types";
import { AccountHome } from "./account-home";
import { calibration, journey, lesson, ROUND, serve } from "./account-fixtures";
vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/journey");
});

/** Le navigazioni della pagina, senza lasciare il documento di test. */
function navigation(search = "") {
  const assign = vi.fn();
  const replace = vi.fn();
  vi.stubGlobal("location", { ...window.location, search, assign, replace });
  return { assign, replace };
}

const question = (id: string, text: string) => ({
  id,
  areaId: "d0",
  text,
  multiple: false,
  options: [
    { value: "o1", label: "Spesso" },
    { value: "o2", label: "Raramente" },
  ],
});
const QUESTIONS = {
  ...ROUND,
  action: "ASK_GROUP",
  questions: [question("q1", "Prima domanda?"), question("q2", "Seconda?")],
};

type Reply = Response | Error;
/** Fetch con risposte in coda per percorso: errori HTTP e di rete compresi. */
function queue(routes: Record<string, () => unknown>, replies: Reply[] = []) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      if (url.endsWith("/calibration/answers") && replies.length) {
        const reply = replies.shift()!;
        if (reply instanceof Error) throw reply;
        return reply;
      }
      const key = Object.keys(routes).find((k) => url.includes(k));
      return new Response(JSON.stringify(key ? routes[key]() : {}));
    }),
  );
  return calls;
}

async function answerBoth() {
  await userEvent.click(
    await screen.findByRole("button", { name: /Continua la calibrazione/ }),
  );
  await userEvent.click(await screen.findByRole("button", { name: /Spesso/ }));
  await userEvent.click(
    await screen.findByRole("button", { name: /Raramente/ }),
  );
}

describe("Round di domande completato", () => {
  it("returns to the summary once evaluated, without opening another round", async () => {
    const { assign } = navigation();
    let answered = false;
    const calls = queue({
      "/auth/journey": () =>
        journey({ calibration: calibration(answered ? null : QUESTIONS) }),
      "/calibration/answers": () => {
        answered = true;
        return journey({ calibration: calibration(null) });
      },
    });
    render(<CalibrationPage />);
    await answerBoth();
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        "/journey/profilo?esito=calibrazione",
      ),
    );
    expect(
      calls.find((c) => c.url.endsWith("/calibration/answers"))?.body,
    ).toEqual({ roundId: ROUND.id, answers: { q1: "o1", q2: "o2" } });
    expect(calls.some((c) => c.url.endsWith("/calibration/round"))).toBe(false);
  });

  it.each([
    [
      "an HTTP error",
      new Response(JSON.stringify({ message: "Valutazione non riuscita." }), {
        status: 503,
      }),
    ],
    ["a network error", new TypeError("Failed to fetch")],
  ])(
    "keeps question, position and local answers after %s",
    async (_case, failure) => {
      const { assign } = navigation();
      const calls = queue(
        {
          "/auth/journey": () =>
            journey({ calibration: calibration(QUESTIONS) }),
          "/calibration/answers": () =>
            journey({ calibration: calibration(null) }),
        },
        [failure],
      );
      render(<CalibrationPage />);
      await answerBoth();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        /Risposte non inviate.*Le tue scelte sono ancora qui/,
      );
      // Stessa domanda, stessa scelta: nessuna transizione di successo.
      expect(screen.getByText("Seconda?")).toBeVisible();
      expect(screen.getByRole("button", { name: /Raramente/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(assign).not.toHaveBeenCalled();
      await userEvent.click(
        screen.getByRole("button", { name: /Riprova l’invio/ }),
      );
      await waitFor(() =>
        expect(assign).toHaveBeenCalledWith(
          "/journey/profilo?esito=calibrazione",
        ),
      );
      const sent = calls.filter((c) => c.url.endsWith("/calibration/answers"));
      expect(sent.map((c) => c.body)).toEqual([
        { roundId: ROUND.id, answers: { q1: "o1", q2: "o2" } },
        { roundId: ROUND.id, answers: { q1: "o1", q2: "o2" } },
      ]);
    },
  );
});

describe("Round rimasto in valutazione", () => {
  const stalled = {
    ...QUESTIONS,
    status: "EVALUATING",
    answers: { q1: "o1", q2: "o2" },
  };

  it("tells saved answers apart and returns to the summary once evaluated", async () => {
    const { assign } = navigation();
    serve({
      "/auth/journey": journey({ calibration: calibration(stalled) }),
      "/calibration/answers": journey({ calibration: calibration(null) }),
    });
    render(<CalibrationPage />);
    expect(
      await screen.findByText(
        /Le tue risposte sono salvate, ma la valutazione/,
      ),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: /Completa la valutazione/ }),
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        "/journey/profilo?esito=calibrazione",
      ),
    );
  });

  it("waits and re-reads while another request evaluates, without resending", async () => {
    const { assign } = navigation();
    let reads = 0;
    const calls = serve({
      "/auth/journey": () =>
        journey({ calibration: calibration(++reads > 2 ? null : stalled) }),
      "/calibration/answers": journey({ calibration: calibration(stalled) }),
    });
    render(<CalibrationPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Completa la valutazione/ }),
    );
    expect(
      await screen.findByText(/la valutazione è ancora in corso/),
    ).toBeVisible();
    expect(assign).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: /Aggiorna lo stato/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /Aggiorna lo stato/ }),
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        "/journey/profilo?esito=calibrazione",
      ),
    );
    expect(
      calls.filter((c) => c.url.endsWith("/calibration/answers")),
    ).toHaveLength(1);
  });
});

const RESULT = {
  status: "EVALUATED",
  format: "SITUATIONAL",
  title: "Il terzo colpo",
  area: { id: "d0", name: "Tecnico-tattico" },
  confidence: { before: 40, after: 35 },
  correct: 1,
  total: 2,
  summary: "Ci sei quasi.",
  video: { title: "L'uscita dal vetro", url: null },
};

describe("Risultato del micro-test", () => {
  it.each([
    [
      "an open calibration",
      calibration(null),
      { ...lesson, phase: "LOCKED" },
      true,
    ],
    ["a lesson to choose first", calibration(null), lesson, false],
    ["a closed calibration", calibration(null, "PAYWALL_READY"), lesson, false],
    [
      "a lesson waiting for validation",
      calibration(null, "FREE_LESSON_VALIDATION"),
      { ...lesson, phase: "REQUESTED" },
      false,
    ],
  ])(
    "leads back to the summary from a direct link, with %s",
    async (_case, current, view, canContinue) => {
      window.history.replaceState(null, "", `/journey/coach?round=${ROUND.id}`);
      const calls = serve({
        "/auth/journey": journey({ calibration: current }),
        "/athlete-journey/free-lesson": view,
        "/calibration/micro-test/": RESULT,
      });
      render(<CoachPage />);
      expect(await screen.findByText("40% → 35%")).toBeInTheDocument();
      expect(screen.getAllByText("L'uscita dal vetro").length).toBeGreaterThan(
        0,
      );
      expect(
        screen.getByRole("link", { name: /Torna al riepilogo/ }),
      ).toHaveAttribute("href", "/journey/profilo?esito=micro-test");
      await waitFor(() =>
        expect(
          screen.queryByRole("link", { name: "Continua la calibrazione" }) !==
            null,
        ).toBe(canContinue),
      );
      expect(calls.every((c) => !c.url.includes("/calibration/answers"))).toBe(
        true,
      );
    },
  );

  it("keeps the result reachable while it is still being evaluated", async () => {
    window.history.replaceState(null, "", `/journey/coach?round=${ROUND.id}`);
    serve({
      "/auth/journey": journey({ calibration: calibration(null) }),
      "/athlete-journey/free-lesson": lesson,
      "/calibration/micro-test/": { ...RESULT, status: "EVALUATING" },
    });
    render(<CoachPage />);
    expect(
      await screen.findByText(/non serve rifare la prova/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Torna al riepilogo/ }),
    ).toHaveAttribute("href", "/journey/profilo");
  });

  it("returns to the summary when the athlete puts the practical test off", async () => {
    const { assign } = navigation();
    const practical = {
      ...ROUND,
      questions: [
        {
          ...question("p1", "Servizio a uscire"),
          microTest: {
            instructions: "Dieci servizi.",
            durationMinutes: 5,
            safetyNotes: "",
          },
        },
      ],
    };
    const calls = serve({
      "/auth/journey": journey({ calibration: calibration(practical) }),
      "/athlete-journey/free-lesson": lesson,
      "/calibration/skip": journey({ calibration: calibration(null) }),
    });
    render(<CoachPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Inizia il micro-test" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Non posso farlo ora" }),
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        "/journey/profilo?esito=micro-test-rimandato",
      ),
    );
    expect(
      calls.find((c) => c.url.endsWith("/calibration/skip"))?.body,
    ).toEqual({ roundId: ROUND.id });
  });
});

const PROFILE = {
  firstName: "Stefano",
  sport: "Padel",
  experience: null,
  global: { value: 83, low: 70, high: 96, confidence: 30, provisional: true },
};

describe("Prossimo passo uguale in Home e profilo", () => {
  const closedRound = calibration(null, "PAYWALL_READY");
  it.each([
    ["micro-test open", calibration(ROUND), lesson, "/journey/coach"],
    [
      "stalled evaluation",
      calibration({ ...QUESTIONS, status: "EVALUATING" }),
      lesson,
      "/journey/calibrazione",
    ],
    ["lesson unlocked", calibration(null), lesson, "/journey/circolo"],
    [
      "lesson requested",
      calibration(null, "FREE_LESSON_VALIDATION"),
      { ...lesson, phase: "REQUESTED" },
      "/journey/circolo",
    ],
    [
      "lesson confirmed",
      calibration(null, "FREE_LESSON_VALIDATION"),
      { ...lesson, phase: "ASSIGNED" },
      "/journey/circolo",
    ],
    [
      "lesson locked",
      calibration(null),
      { ...lesson, phase: "LOCKED" },
      "/journey/calibrazione",
    ],
    [
      "lesson declined",
      calibration(null),
      { ...lesson, phase: "DECLINED" },
      "/journey/calibrazione",
    ],
    [
      "lesson unavailable",
      calibration(null),
      { ...lesson, phase: "UNAVAILABLE" },
      "/journey/calibrazione",
    ],
    [
      "lesson off",
      calibration(null),
      { enabled: false },
      "/journey/calibrazione",
    ],
    [
      "calibration closed",
      closedRound,
      { ...lesson, phase: "CLOSED" },
      "/journey/scenari",
    ],
  ])("with %s", async (_case, current, view, href) => {
    const j = journey({ calibration: current });
    serve({
      "/auth/journey": j,
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": view,
    });
    const home = render(<AccountHome journey={j as unknown as Journey} />);
    const homeStep = await screen.findByRole("region", {
      name: "Prossimo passo",
    });
    const homeLink = homeStep.querySelector("a")!;
    expect(homeLink).toHaveAttribute("href", href);
    const cta = homeLink.textContent;
    home.unmount();
    render(<ProfilePage />);
    const profileStep = await screen.findByLabelText("Prossimo passo");
    const profileLink = profileStep.querySelector("a")!;
    expect(profileLink).toHaveAttribute("href", href);
    expect(profileLink.textContent).toBe(cta);
  });
});

describe("Conferma nel riepilogo", () => {
  it("confirms the activity once, without claiming a confidence gain", async () => {
    window.history.replaceState(
      null,
      "",
      "/journey/profilo?esito=calibrazione",
    );
    serve({
      "/auth/journey": journey({ calibration: calibration(null) }),
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": lesson,
    });
    render(<ProfilePage />);
    const status = await screen.findByText(
      /Valutazione aggiornata con le tue risposte/,
    );
    expect(status).toHaveAttribute("role", "status");
    await waitFor(() => expect(status).toHaveFocus());
    expect(status.textContent).not.toMatch(/aumentat|cresciut|\+/);
    // Ricarica e indietro ritrovano il riepilogo senza ripetere la conferma.
    expect(window.location.pathname + window.location.search).toBe(
      "/journey/profilo",
    );
  });

  it("ignores an unknown outcome in the address", async () => {
    window.history.replaceState(null, "", "/journey/profilo?esito=pagato");
    serve({
      "/auth/journey": journey(),
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": lesson,
    });
    render(<ProfilePage />);
    expect(await screen.findByText("Tra 70 e 96")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("Lezione gratuita", () => {
  it("shows the outcome of a decline and leads back to the summary", async () => {
    const calls = serve({
      "/auth/journey": journey(),
      "/free-lesson/decline": { ...lesson, phase: "DECLINED" },
      "/athlete-journey/free-lesson": lesson,
    });
    render(<ClubPage />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Preferisco non fare la lezione",
      }),
    );
    const outcome = await screen.findByRole("status", { name: "Esito" });
    expect(outcome).toHaveTextContent("Hai scelto di non fare la lezione.");
    expect(outcome).toHaveFocus();
    expect(
      screen.getByRole("link", { name: /Torna al riepilogo/ }),
    ).toHaveAttribute("href", "/journey/profilo?esito=lezione");
    expect(calls.some((c) => c.url.endsWith("/free-lesson/decline"))).toBe(
      true,
    );
  });
});
