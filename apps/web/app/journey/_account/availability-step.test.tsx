import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CheckoutPage from "../checkout/page";
import SubscriptionReturnPage from "../../abbonamento/page";
import { calibration, journey } from "./account-fixtures";
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

const form = (days: number | null, minutes: number | null) => ({
  ready: days !== null && minutes !== null,
  questions: [
    {
      key: "training_days_available",
      label: "Quanti giorni puoi allenarti?",
      options: [1, 2, 3].map((n) => ({
        value: n,
        label: `${n} ${n === 1 ? "giorno" : "giorni"}`,
      })),
      value: days,
    },
    {
      key: "training_session_duration",
      label: "Quanto dura una sessione?",
      options: [
        { value: 45, label: "45 minuti" },
        { value: 120, label: "120+ minuti" },
      ],
      value: minutes,
    },
  ],
});

type Route = (init?: RequestInit) => { status?: number; body: unknown };

/** Risposte per percorso; il primo che combina vince. */
function api(routes: Record<string, Route>) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: JSON.parse(String(init?.body ?? "{}")),
      });
      const key = Object.keys(routes).find((k) => url.includes(k));
      const { status = 200, body } = key ? routes[key](init) : { body: {} };
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

const MISSING = {
  status: 409,
  body: { code: "AVAILABILITY_REQUIRED", message: "Prima del programma…" },
};

async function pick() {
  await userEvent.click(await screen.findByRole("radio", { name: "2 giorni" }));
  await userEvent.click(screen.getByRole("radio", { name: "120+ minuti" }));
}

describe("Disponibilità prima del programma", () => {
  it("asks days and duration before the checkout, then shows the offer", async () => {
    let saved = false;
    const calls = api({
      "/athlete-journey/availability": (init) => {
        if (init?.method === "POST") saved = true;
        return { body: saved ? form(2, 120) : form(null, null) };
      },
      "/auth/journey": () => ({
        body: journey({
          calibration: calibration(null, "PAYWALL_READY"),
          scenarios: {
            status: "READY",
            engine: { key: "p", version: "1", provisional: true },
            scale: { min: 0, max: 100 },
            selectedHorizon: "PROGRAM_3M",
            horizons: [{ horizon: "PROGRAM_3M", months: 3, drivers: [] }],
          },
        }),
      }),
      "/payments/offers": () => ({ body: [] }),
    });
    render(<CheckoutPage />);
    expect(
      await screen.findByRole("heading", {
        name: "Quanto tempo hai per allenarti?",
      }),
    ).toBeInTheDocument();
    // Le opzioni sono quelle del back office, con il testo breve.
    expect(
      await screen.findByRole("radio", { name: "120+ minuti" }),
    ).toHaveTextContent("120+");
    const save = screen.getByRole("button", { name: /Salva e continua/ });
    expect(save).toBeDisabled();
    await pick();
    await userEvent.click(save);
    expect(
      await screen.findByRole("heading", { name: /Programma di 3 mesi/ }),
    ).toBeInTheDocument();
    expect(
      calls.find(
        (c) =>
          c.method === "POST" &&
          c.url.endsWith("/athlete-journey/availability"),
      )?.body,
    ).toEqual({
      answers: { training_days_available: 2, training_session_duration: 120 },
    });
  });

  it("recovers a paid athlete without availability and creates the plan without a new checkout", async () => {
    window.history.replaceState(null, "", "/abbonamento?checkout=success");
    let saved = false;
    const calls = api({
      "/payments/subscription": () => ({
        body: {
          entitled: true,
          subscription: {
            status: "ACTIVE",
            horizon: "PROGRAM_3M",
            billingCycle: "MONTHLY",
            amountCents: 1000,
            currency: "eur",
            nextChargeAt: null,
          },
        },
      }),
      "/athlete-journey/program": () =>
        saved ? { body: { phase: "COMPLETE" } } : MISSING,
      "/athlete-journey/availability": (init) => {
        if (init?.method === "POST") saved = true;
        return { body: saved ? form(2, 120) : form(null, null) };
      },
    });
    render(<SubscriptionReturnPage />);
    expect(
      await screen.findByRole(
        "heading",
        { name: "Quanto tempo hai per allenarti?" },
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    await pick();
    await userEvent.click(
      screen.getByRole("button", { name: /Prepara il tuo piano/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "Il tuo piano è pronto." }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        calls.filter((c) => c.url.endsWith("/athlete-journey/program")),
      ).toHaveLength(2),
    );
    expect(calls.some((c) => c.url.includes("/payments/checkout"))).toBe(false);
  });
});
