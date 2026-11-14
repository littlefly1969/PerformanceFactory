import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CoachPage from "../coach/page";
import type { Journey } from "../journey-types";
import { AccountHome } from "./account-home";
import {
  calibration,
  homeMicro,
  journey,
  lesson,
  ROUND,
  serve,
} from "./account-fixtures";
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
  const OLD = "22222222-2222-4222-8222-222222222222";
  const PRACTICAL = {
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

  it("shows the result from a direct link and leads back to the Home", async () => {
    window.history.replaceState(null, "", `/journey/coach?round=${ROUND.id}`);
    const calls = serve({
      "/auth/journey": journey({ calibration: calibration(null) }),
      "/athlete-journey/micro-test": homeMicro(ROUND),
      "/calibration/micro-test/": RESULT,
    });
    render(<CoachPage />);
    expect(await screen.findByText("40% → 35%")).toBeInTheDocument();
    expect(screen.getAllByText("L'uscita dal vetro").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Torna alla Home" }),
    ).toHaveAttribute("href", "/journey");
    expect(calls.every((c) => !c.url.includes("/calibration/answers"))).toBe(
      true,
    );
  });

  it("shows a requested result before the micro-test that is ready", async () => {
    window.history.replaceState(null, "", `/journey/coach?round=${OLD}`);
    const calls = serve({
      "/auth/journey": journey({ calibration: calibration(null) }),
      "/athlete-journey/micro-test": homeMicro(ROUND),
      "/calibration/micro-test/": RESULT,
    });
    render(<CoachPage />);
    expect(await screen.findByText("40% → 35%")).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith(`/micro-test/${OLD}`))).toBe(true);
    expect(
      screen.queryByRole("button", { name: /Inizia il micro-test/ }),
    ).toBeNull();
  });

  it("does not let a saved result be sent again when the journey cannot be re-read", async () => {
    let saved = false;
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.endsWith("/auth/journey"))
          return saved
            ? new Response(JSON.stringify({ message: "Non disponibile" }), {
                status: 503,
              })
            : new Response(
                JSON.stringify(journey({ calibration: calibration(null) })),
              );
        if (url.endsWith("/athlete-journey/micro-test"))
          return new Response(
            JSON.stringify(
              saved ? homeMicro(null, "PREPARING") : homeMicro(PRACTICAL),
            ),
          );
        if (url.endsWith("/calibration/answers")) {
          saved = true;
          return new Response(JSON.stringify({}));
        }
        if (url.includes("/calibration/micro-test/"))
          return new Response(JSON.stringify(RESULT));
        return new Response(JSON.stringify({ ...lesson, phase: "LOCKED" }));
      }),
    );
    render(<CoachPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Inizia il micro-test/ }),
    );
    await userEvent.click(screen.getByRole("radio", { name: /Spesso/ }));
    await userEvent.click(
      screen.getByRole("button", { name: /Salva il risultato/ }),
    );
    expect(await screen.findByText("40% → 35%")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Salva il risultato/ }),
    ).toBeNull();
    expect(window.location.search).toBe(`?round=${ROUND.id}`);
    expect(
      calls.filter((u) => u.endsWith("/calibration/answers")),
    ).toHaveLength(1);
  });

  it("offers to finish the evaluation of the requested round, not of another", async () => {
    const stalled = { ...ROUND, status: "EVALUATING", answers: { t1: "o1" } };
    window.history.replaceState(null, "", `/journey/coach?round=${ROUND.id}`);
    serve({
      "/auth/journey": journey({ calibration: calibration(null) }),
      "/athlete-journey/micro-test": homeMicro(stalled, "EVALUATING"),
      "/calibration/micro-test/": { ...RESULT, status: "EVALUATING" },
    });
    const first = render(<CoachPage />);
    expect(
      await screen.findByText("Le tue risposte sono salvate."),
    ).toBeVisible();
    first.unmount();
    window.history.replaceState(null, "", `/journey/coach?round=${OLD}`);
    serve({
      "/auth/journey": journey({ calibration: calibration(null) }),
      "/athlete-journey/micro-test": homeMicro(stalled, "EVALUATING"),
      "/calibration/micro-test/": RESULT,
    });
    render(<CoachPage />);
    expect(await screen.findByText("40% → 35%")).toBeInTheDocument();
    expect(screen.queryByText("Le tue risposte sono salvate.")).toBeNull();
  });

  it("keeps the result reachable while it is still being evaluated", async () => {
    window.history.replaceState(null, "", `/journey/coach?round=${ROUND.id}`);
    serve({
      "/auth/journey": journey({ calibration: calibration(null) }),
      "/athlete-journey/micro-test": homeMicro(null, "PREPARING"),
      "/calibration/micro-test/": { ...RESULT, status: "EVALUATING" },
    });
    render(<CoachPage />);
    expect(
      await screen.findByText(/non serve rifare la prova/),
    ).toBeInTheDocument();
  });

  it("waits for a micro-test another tab is preparing, then offers a retry", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Il tempo finto avanza a scatti finché la condizione è vera: le risposte
    // di fetch arrivano su tempo reale.
    const tick = (check: () => unknown) =>
      waitFor(
        async () => {
          await act(() => vi.advanceTimersByTimeAsync(3000));
          check();
        },
        { timeout: 150000, interval: 20 },
      );
    try {
      // GET iniziale e POST: PREPARING (la prepara un'altra scheda); poi pronto.
      let reads = 0;
      const calls = serve({
        "/auth/journey": journey({ calibration: calibration(null) }),
        "/athlete-journey/micro-test": () =>
          ++reads <= 3 ? homeMicro(null, "PREPARING") : homeMicro(),
      });
      render(<CoachPage />);
      expect(
        await screen.findByText("Preparo il tuo micro-test."),
      ).toBeInTheDocument();
      await tick(() =>
        screen.getByRole("button", { name: /Inizia il micro-test/ }),
      );
      // Una sola richiesta di preparazione: il resto sono riletture.
      const micro = calls.filter((c) => c.url.endsWith("/micro-test"));
      expect(micro.length).toBeGreaterThanOrEqual(4);
      cleanup();

      // Se non arriva mai, dopo l'attesa compare «Riprova».
      serve({
        "/auth/journey": journey({ calibration: calibration(null) }),
        "/athlete-journey/micro-test": homeMicro(null, "PREPARING"),
      });
      render(<CoachPage />);
      await screen.findByText("Preparo il tuo micro-test.");
      await tick(() => screen.getByText(/più del solito/));
      expect(
        screen.getByRole("button", { name: /Riprova/ }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("prepares the next micro-test when the athlete puts the practical test off", async () => {
    let skipped = false;
    const calls = serve({
      "/auth/journey": journey({ calibration: calibration(null) }),
      "/athlete-journey/micro-test": () =>
        skipped ? homeMicro(null, "PREPARING") : homeMicro(PRACTICAL),
      "/calibration/skip": () => {
        skipped = true;
        return {};
      },
    });
    render(<CoachPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Inizia il micro-test/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Non posso farlo ora" }),
    );
    expect(
      await screen.findByText("Preparo il tuo micro-test."),
    ).toBeInTheDocument();
    expect(
      calls.find((c) => c.url.endsWith("/calibration/skip"))?.body,
    ).toEqual({ roundId: ROUND.id });
    await waitFor(() =>
      expect(
        calls.filter((c) => c.url.endsWith("/athlete-journey/micro-test"))
          .length,
      ).toBeGreaterThanOrEqual(3),
    );
  });

  it("explains that micro-tests stop once the free phase is closed", async () => {
    serve({
      "/auth/journey": journey({
        calibration: calibration(null, "PAYWALL_READY"),
      }),
      "/athlete-journey/micro-test": homeMicro(null, "UNAVAILABLE"),
    });
    render(<CoachPage />);
    expect(
      await screen.findByText("La fase gratuita è conclusa."),
    ).toBeInTheDocument();
  });
});

describe("Home come la demo", () => {
  const render_ = (current: unknown, view: unknown, micro: unknown) => {
    const j = journey({ calibration: current });
    serve({
      "/auth/journey": j,
      "/athlete-journey/free-lesson": view,
      "/athlete-journey/micro-test": micro,
    });
    return render(<AccountHome journey={j as unknown as Journey} />);
  };

  it.each([
    [
      "lesson locked",
      calibration(null),
      { ...lesson, phase: "LOCKED" },
      /Continua la calibrazione/,
      "/journey/calibrazione",
    ],
    [
      "lesson unlocked",
      calibration(null),
      lesson,
      /Scegli il circolo/,
      "/journey/circolo",
    ],
    [
      "calibration closed",
      calibration(null, "PAYWALL_READY"),
      { ...lesson, phase: "CLOSED" },
      /I tuoi scenari/,
      "/journey/stima",
    ],
    [
      "R consolidated without a lesson",
      calibration(null, "FREE_LEVEL_ESTIMATED", {
        ruleMet: true,
        canFinish: true,
      }),
      { ...lesson, phase: "DECLINED" },
      /Scegli come proseguire/,
      "/journey/calibrazione",
    ],
  ])("shows the top card with %s", async (_c, current, view, name, href) => {
    render_(current, view, homeMicro());
    expect(await screen.findByRole("link", { name })).toHaveAttribute(
      "href",
      href,
    );
  });

  it("shows the micro-test ready for today, without a calendar", async () => {
    render_(calibration(null), lesson, homeMicro());
    const card = await screen.findByRole("link", {
      name: "Micro-test: Il terzo colpo decide il punto.",
    });
    expect(card).toHaveAttribute("href", "/journey/coach?tab=micro");
    expect(card.textContent).toContain("Micro-test · 2 min");
    expect(screen.getByText("Per te oggi")).toBeInTheDocument();
    expect(screen.queryByText(/serie/i)).toBeNull();
  });

  it("says the next micro-test is being prepared", async () => {
    render_(calibration(null), lesson, homeMicro(null, "PREPARING"));
    expect(
      await screen.findByRole("link", {
        name: "Micro-test: preparo il prossimo",
      }),
    ).toBeInTheDocument();
  });

  it("hides the micro-test once the free phase is closed", async () => {
    render_(
      calibration(null, "PAYWALL_READY"),
      { ...lesson, phase: "CLOSED" },
      homeMicro(null, "UNAVAILABLE"),
    );
    await screen.findByRole("link", { name: /I tuoi scenari/ });
    expect(screen.queryByText("Per te oggi")).toBeNull();
  });
});
