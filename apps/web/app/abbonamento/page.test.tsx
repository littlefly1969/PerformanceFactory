import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SubscriptionReturnPage from "./page";
vi.mock("../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
}));
const location = window.location;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Object.defineProperty(window, "location", { value: location });
});
function at(search: string) {
  const replace = vi.fn();
  Object.defineProperty(window, "location", {
    value: { ...location, search, replace },
    configurable: true,
  });
  return replace;
}
describe("return from the hosted checkout", () => {
  const SUB = {
    status: "ACTIVE",
    horizon: "PROGRAM_6M",
    billingCycle: "QUARTERLY",
    amountCents: 2850,
    currency: "eur",
    nextChargeAt: "2027-02-02T10:00:00.000Z",
    cancelAtPeriodEnd: false,
  };
  it("shows S19 only after the backend confirms, with the real subscription", async () => {
    at("?checkout=success");
    const answers = [
      { entitled: false, subscription: { ...SUB, status: "CHECKOUT_PENDING" } },
      { entitled: true, subscription: SUB },
    ];
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("/athlete-journey/program")
        ? new Response(JSON.stringify({ phase: "COMPLETE" }))
        : new Response(JSON.stringify(answers.shift())),
    );
    vi.stubGlobal("fetch", fetch);
    render(<SubscriptionReturnPage />);
    expect(
      screen.getByRole("heading", { name: "Confermiamo il tuo pagamento…" }),
    ).toBeTruthy();
    expect(
      await screen.findByRole(
        "heading",
        { name: "Il tuo piano è pronto." },
        { timeout: 4000 },
      ),
    ).toBeTruthy();
    const rows = screen
      .getAllByRole("definition")
      .map((d) => d.textContent?.replace(/\s/g, " "));
    expect(rows).toEqual([
      "6 mesi · P6",
      "Trimestrale",
      "28,50 €",
      "02/02/2027",
    ]);
    expect(
      screen.getByRole("link", { name: /Vai al tuo piano/ }),
    ).toHaveProperty("href", expect.stringContaining("/user"));
    // Il programma si crea con l'azione esistente, una volta sola.
    expect(
      fetch.mock.calls.filter(([url]) =>
        url.endsWith("/athlete-journey/program"),
      ),
    ).toHaveLength(1);
  });
  it("keeps the subscription confirmed and lets the athlete retry the plan", async () => {
    at("?checkout=success");
    let programCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (!url.endsWith("/athlete-journey/program"))
          return new Response(
            JSON.stringify({ entitled: true, subscription: SUB }),
          );
        programCalls += 1;
        return programCalls === 1
          ? new Response(JSON.stringify({ message: "Scenari non pronti" }), {
              status: 409,
            })
          : new Response("{}");
      }),
    );
    render(<SubscriptionReturnPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Scenari non pronti",
    );
    expect(screen.getByText("Abbonamento attivo")).toBeTruthy();
    expect(screen.queryByText("Il tuo piano è pronto.")).toBeNull();
    screen.getByRole("button", { name: /Prepara il tuo piano/ }).click();
    expect(
      await screen.findByRole("heading", { name: "Il tuo piano è pronto." }),
    ).toBeTruthy();
  });
  it("asks for availability in the profile when the program needs it", async () => {
    at("?checkout=success");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/athlete-journey/program")
          ? new Response(
              JSON.stringify({
                code: "AVAILABILITY_REQUIRED",
                message: "Prima del programma indica la disponibilità.",
              }),
              { status: 409 },
            )
          : new Response(JSON.stringify({ entitled: true, subscription: SUB })),
      ),
    );
    render(<SubscriptionReturnPage />);
    expect(
      await screen.findByRole("heading", {
        name: "Ultimo passo: la tua disponibilità.",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Indica la tua disponibilità" }),
    ).toHaveAttribute("href", "/journey/profilo/disponibilita?poi=abbonamento");
  });
  it("shows when access ends for a subscription cancelled at period end", async () => {
    at("?checkout=success");
    const cancelled = {
      ...SUB,
      cancelAtPeriodEnd: true,
      nextChargeAt: null,
      entitlementEndAt: "2027-03-15T10:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/athlete-journey/program")
          ? new Response("{}")
          : new Response(
              JSON.stringify({ entitled: true, subscription: cancelled }),
            ),
      ),
    );
    render(<SubscriptionReturnPage />);
    expect(await screen.findByText("Attivo fino al")).toBeTruthy();
    expect(screen.queryByText("Prossimo addebito")).toBeNull();
    expect(screen.getByText("15/03/2027")).toBeTruthy();
  });
  it("keeps waiting through a network error", async () => {
    at("?checkout=success");
    const answers: Array<() => Promise<Response>> = [
      async () => {
        throw new TypeError("offline");
      },
      async () =>
        new Response(JSON.stringify({ entitled: true, subscription: SUB })),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/athlete-journey/program")
          ? new Response("{}")
          : answers.shift()!(),
      ),
    );
    render(<SubscriptionReturnPage />);
    expect(
      await screen.findByRole(
        "heading",
        { name: "Il tuo piano è pronto." },
        { timeout: 4000 },
      ),
    ).toBeTruthy();
  });
  it("shows a cancelled checkout without asking the server", async () => {
    at("?checkout=cancel");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<SubscriptionReturnPage />);
    expect(
      await screen.findByRole("heading", { name: "Nessun addebito." }),
    ).toBeTruthy();
    expect(screen.getByText("Pagamento annullato")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Torna al checkout/ }),
    ).toHaveProperty("href", expect.stringContaining("/journey/checkout"));
    expect(
      screen.getByRole("link", { name: "Torna al tuo percorso" }),
    ).toHaveProperty("href", expect.stringContaining("/journey"));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends a signed-out athlete to the login", async () => {
    const replace = at("?checkout=success");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    render(<SubscriptionReturnPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
  it("offers a safe way back during a long wait, without a new checkout", async () => {
    vi.useFakeTimers();
    const replace = at("?checkout=success");
    const fetch = vi.fn<(url: string) => Promise<Response>>(
      async () => new Response(JSON.stringify({ entitled: false })),
    );
    vi.stubGlobal("fetch", fetch);
    render(<SubscriptionReturnPage />);
    for (let i = 0; i < 30; i++) await vi.advanceTimersByTimeAsync(2000);
    expect(
      screen.getByRole("heading", {
        name: "Il pagamento è ancora in verifica.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Torna al tuo percorso" }),
    ).toHaveProperty("href", expect.stringContaining("/journey"));
    // Nessun nuovo pagamento e nessuna attivazione dichiarata.
    expect(
      fetch.mock.calls.every(([url]) => url === "/api/payments/subscription"),
    ).toBe(true);
    expect(replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Verifica di nuovo" }),
    ).toBeTruthy();
  });
});
