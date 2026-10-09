import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Scenarios } from "./journey-types";
import { ScenariosReveal } from "./scenarios-reveal";

vi.mock("../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
}));

const drivers = (p: number) => [
  { id: "a", name: "Tecnica", current: 40, potential: p, confidence: 70 },
  { id: "b", name: "Fisico", current: 85, potential: 85, confidence: 40 },
];

const gap = (p: number) => ({
  overall: { current: 62.5, potential: (p + 85) / 2, gap: (p + 85) / 2 - 62.5 },
  technicalTactical: { current: 40, potential: p, gap: p - 40 },
});

const scenarios = (selectedHorizon: Scenarios["selectedHorizon"] = null) =>
  ({
    engine: { key: "provisional-plateau", version: "1", provisional: true },
    scale: { min: 0, max: 100 },
    selectedHorizon,
    horizons: [
      { horizon: "PROGRAM_3M", months: 3, drivers: drivers(52), gap: gap(52) },
      { horizon: "PROGRAM_6M", months: 6, drivers: drivers(61), gap: gap(61) },
      {
        horizon: "PROGRAM_12M",
        months: 12,
        drivers: drivers(71),
        gap: gap(71),
      },
    ],
  }) satisfies Scenarios;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("P3/P6/P12 reveal", () => {
  it("shows three scenarios marked as provisional and sends the chosen horizon", async () => {
    const onSelect = vi.fn();
    render(
      <ScenariosReveal
        scenarios={scenarios()}
        busy={false}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText(/stima provvisoria/)).toBeVisible();
    const six = screen.getByRole("article", { name: "Scenario a 6 mesi" });
    const items = within(six).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Tecnica: 40 → 61");
    // Il driver già al tetto resta dov'è.
    expect(items[1]).toHaveTextContent("Fisico: 85 → 85");
    await userEvent.click(
      within(six).getByRole("button", { name: "Scegli 6 mesi →" }),
    );
    expect(onSelect).toHaveBeenCalledWith("PROGRAM_6M");
  });

  it("AT-20: shows the overall and technical-tactical gap of each scenario", () => {
    render(
      <ScenariosReveal
        scenarios={scenarios()}
        busy={false}
        onSelect={vi.fn()}
      />,
    );
    const twelve = screen.getByRole("article", { name: "Scenario a 12 mesi" });
    expect(
      within(twelve).getByText("Margine complessivo").nextSibling,
    ).toHaveTextContent("+16 (63 → 78)");
    expect(
      within(twelve).getByText("Margine tecnico-tattico").nextSibling,
    ).toHaveTextContent("+31 (40 → 71)");
  });

  it("shows only the payment cadences of the chosen horizon", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                horizon: "PROGRAM_3M",
                billingOptions: [
                  {
                    billingCycle: "MONTHLY",
                    billingMonths: 1,
                    amountCents: 3900,
                    currency: "EUR",
                  },
                ],
              },
              {
                horizon: "PROGRAM_12M",
                billingOptions: [
                  {
                    billingCycle: "MONTHLY",
                    billingMonths: 1,
                    amountCents: 2900,
                    currency: "EUR",
                  },
                  {
                    billingCycle: "ANNUAL",
                    billingMonths: 12,
                    amountCents: 29000,
                    currency: "EUR",
                  },
                ],
              },
            ]),
          ),
      ),
    );
    render(
      <ScenariosReveal
        scenarios={scenarios("PROGRAM_12M")}
        busy={false}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Percorso scelto" }),
    ).toHaveAttribute("aria-pressed", "true");
    const offer = await screen.findByRole("list", {
      name: "Come pagare il percorso",
    });
    expect(within(offer).getAllByRole("listitem")).toHaveLength(2);
    expect(within(offer).getByText(/all'anno/)).toBeVisible();
  });

  it("AT-28: records the paywall view and opens the checkout of the chosen horizon", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        if (url.endsWith("/payments/offers"))
          return new Response(
            JSON.stringify([
              {
                horizon: "PROGRAM_6M",
                billingOptions: [
                  {
                    billingCycle: "MONTHLY",
                    billingMonths: 1,
                    amountCents: 3900,
                    currency: "EUR",
                  },
                ],
              },
            ]),
          );
        if (url.endsWith("/payments/checkout"))
          return new Response(
            JSON.stringify({ checkoutUrl: "https://pay.example/c" }),
          );
        return new Response(JSON.stringify({ recorded: true }));
      }),
    );
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    render(
      <ScenariosReveal
        scenarios={scenarios("PROGRAM_6M")}
        busy={false}
        onSelect={vi.fn()}
      />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Attiva" }),
    );
    expect(calls.map((c) => c.url)).toEqual([
      "/api/payments/offers",
      "/api/athlete-journey/paywall/viewed",
      "/api/payments/checkout",
    ]);
    expect(calls[2].body).toEqual({
      horizon: "PROGRAM_6M",
      billingCycle: "MONTHLY",
    });
    expect(assign).toHaveBeenCalledWith("https://pay.example/c");
  });
});
