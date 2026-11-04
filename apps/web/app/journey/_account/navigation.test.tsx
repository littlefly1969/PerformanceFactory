import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "../profilo/page";
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
  it("shows the updated result once evaluated, without opening another round", async () => {
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
    // Come nella demo: il risultato aggiornato, da cui si continua o si esce.
    expect(
      await screen.findByRole("heading", {
        name: "Il tuo profilo prende forma.",
      }),
    ).toBeVisible();
    expect(screen.getByText("Blocco 2 completato")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Salva i progressi ed esci" }),
    ).toHaveAttribute("href", "/journey");
    expect(assign).not.toHaveBeenCalled();
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
    "resends the same answers by itself after %s, with no retry button",
    async (_case, failure) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
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
        expect(
          await screen.findByText(/Problema con i server, stiamo riprovando/),
        ).toBeVisible();
        expect(
          screen.queryByRole("button", { name: /Riprova/ }),
        ).not.toBeInTheDocument();
        await vi.advanceTimersByTimeAsync(2000);
        expect(
          await screen.findByRole("heading", {
            name: "Il tuo profilo prende forma.",
          }),
        ).toBeVisible();
        expect(assign).not.toHaveBeenCalled();
        const sent = calls.filter((c) =>
          c.url.endsWith("/calibration/answers"),
        );
        expect(sent.map((c) => c.body)).toEqual([
          { roundId: ROUND.id, answers: { q1: "o1", q2: "o2" } },
          { roundId: ROUND.id, answers: { q1: "o1", q2: "o2" } },
        ]);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("after three automatic retries asks to try later; Annulla keeps the answers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      navigation();
      const overloaded = () =>
        new Response(JSON.stringify({ message: "Valutazione non riuscita." }), {
          status: 502,
        });
      const calls = queue(
        {
          "/auth/journey": () =>
            journey({ calibration: calibration(QUESTIONS) }),
          "/calibration/answers": () =>
            journey({ calibration: calibration(null) }),
        },
        [overloaded(), overloaded(), overloaded(), overloaded()],
      );
      render(<CalibrationPage />);
      await answerBoth();
      await screen.findByText(/Problema con i server, stiamo riprovando/);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await vi.advanceTimersByTimeAsync(6000);
      expect(
        await screen.findByText(/server sono sovraccarichi/),
      ).toBeVisible();
      const sent = () =>
        calls.filter((c) => c.url.endsWith("/calibration/answers")).length;
      expect(sent()).toBe(4);
      await userEvent.click(screen.getByRole("button", { name: /Annulla/ }));
      // Si torna allo stato della calibrazione, senza l'errore dell'AI.
      expect(
        await screen.findByRole("heading", {
          name: /La calibrazione si chiude quando ti conosciamo abbastanza/,
        }),
      ).toBeVisible();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      // Si riprende dall'ultima domanda con le scelte già fatte.
      await userEvent.click(
        screen.getByRole("button", { name: /Continua la calibrazione/ }),
      );
      expect(await screen.findByText("Seconda?")).toBeVisible();
      expect(screen.getByRole("button", { name: /Raramente/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(sent()).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps question, position and local answers when the answers are refused", async () => {
    const { assign } = navigation();
    const calls = queue(
      {
        "/auth/journey": () => journey({ calibration: calibration(QUESTIONS) }),
        "/calibration/answers": () =>
          journey({ calibration: calibration(null) }),
      },
      [
        new Response(
          JSON.stringify({ message: "Rispondi a tutte le domande del round" }),
          { status: 400 },
        ),
      ],
    );
    render(<CalibrationPage />);
    await answerBoth();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Risposte non inviate.*Le tue scelte sono ancora qui/,
    );
    // Stessa domanda, stessa scelta, nessun nuovo invio automatico.
    expect(screen.getByText("Seconda?")).toBeVisible();
    expect(screen.getByRole("button", { name: /Raramente/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: /Riprova/ }),
    ).not.toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
    expect(
      calls.filter((c) => c.url.endsWith("/calibration/answers")),
    ).toHaveLength(1);
  });
});

describe("Round rimasto in valutazione", () => {
  const stalled = {
    ...QUESTIONS,
    status: "EVALUATING",
    answers: { q1: "o1", q2: "o2" },
  };

  it("tells saved answers apart and shows the result once evaluated", async () => {
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
    expect(
      await screen.findByRole("heading", {
        name: "Il tuo profilo prende forma.",
      }),
    ).toBeVisible();
    expect(assign).not.toHaveBeenCalled();
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
    expect(
      await screen.findByRole("heading", {
        name: "Il tuo profilo prende forma.",
      }),
    ).toBeVisible();
    expect(assign).not.toHaveBeenCalled();
    expect(
      calls.filter((c) => c.url.endsWith("/calibration/answers")),
    ).toHaveLength(1);
  });
});

const PROFILE = {
  firstName: "Stefano",
  sport: "Padel",
  experience: null,
  global: { value: 83, low: 70, high: 96, confidence: 30, provisional: true },
};

describe("Prossimo passo nel profilo", () => {
  const closedRound = calibration(null, "PAYWALL_READY");
  it.each([
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
      "/journey/calibrazione",
    ],
    [
      "lesson confirmed and R consolidated",
      calibration(null, "FREE_LESSON_VALIDATION", { ruleMet: true }),
      { ...lesson, phase: "ASSIGNED" },
      // Calibrazione sufficiente: il passo è la lezione, non altre domande.
      "/journey/circolo",
    ],
    [
      "R consolidated without a lesson",
      calibration(null, "FREE_LEVEL_ESTIMATED", {
        ruleMet: true,
        canFinish: true,
      }),
      { ...lesson, phase: "DECLINED" },
      "/journey/calibrazione",
    ],
    [
      "calibration closed by the deadline",
      calibration(null, "CALIBRATION_COMPLETED", {
        completionReason: "DEADLINE_REACHED",
      }),
      { ...lesson, phase: "CLOSED" },
      "/journey/stima",
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
      "/journey/stima",
    ],
  ])("with %s", async (_case, current, view, href) => {
    const j = journey({ calibration: current });
    serve({
      "/auth/journey": j,
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": view,
    });
    render(<ProfilePage />);
    const profileStep = await screen.findByLabelText("Prossimo passo");
    const profileLink = profileStep.querySelector("a")!;
    expect(profileLink).toHaveAttribute("href", href);
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
    expect(await screen.findByText("≈ 83")).toBeInTheDocument();
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

describe("Home: aree da completare", () => {
  it("counts the areas known well enough, as on the calibration page", async () => {
    const j = journey({
      evaluation: {
        ...journey().evaluation,
        drivers: journey().evaluation.drivers.map((d, i) => ({
          ...d,
          confidence: [72, 40, 60][i],
        })),
      },
      calibration: calibration(null),
    });
    serve({
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": lesson,
    });
    render(<AccountHome journey={j as unknown as Journey} />);
    const areas = screen.getByRole("region", { name: "Completa le aree" });
    expect(areas.textContent).toContain("Completa le 3 aree");
    expect(areas.textContent).toContain("2 di 3 aree definite");
    expect(areas.querySelectorAll("i.is-ok")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: /Continua il profilo/ }),
    ).toHaveAttribute("href", "/journey/calibrazione");
  });

  it("hides the areas once the calibration is closed", async () => {
    const j = journey({
      calibration: calibration(null, "CALIBRATION_COMPLETED", {
        ruleMet: true,
      }),
    });
    serve({
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": lesson,
    });
    render(<AccountHome journey={j as unknown as Journey} />);
    expect(screen.queryByText(/aree definite/)).toBeNull();
  });
});
