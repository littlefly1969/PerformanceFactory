import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountPage from "./page";
import AccountPhotoPage from "./foto/page";
import AccountSubscriptionPage from "./abbonamento/page";

vi.mock("../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
}));

type Call = { url: string; method: string; body: Record<string, unknown> };
type Handler = (call: Call) => unknown | Promise<unknown>;

/** Risposte per percorso; una funzione riceve la chiamata, un Response passa così. */
function serve(routes: Record<string, unknown | Handler>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = {
        url,
        method: init?.method ?? "GET",
        body: JSON.parse(String(init?.body ?? "{}")),
      };
      calls.push(call);
      const key = Object.keys(routes)
        .filter((k) => url.endsWith(k) || url.includes(`${k}?`))
        .sort((a, b) => b.length - a.length)[0];
      const route = key ? routes[key] : {};
      const value =
        typeof route === "function" ? await (route as Handler)(call) : route;
      return value instanceof Response
        ? value
        : new Response(JSON.stringify(value));
    }),
  );
  return calls;
}

const at = (search: string) =>
  window.history.replaceState(null, "", `/account/x${search}`);

const FREE = { phase: "EVALUATION", welcomeCompleted: true };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("Accesso all'account", () => {
  it("sends back to the journey whoever still owes consents or the welcome", async () => {
    serve({ "/auth/journey": { phase: "CONSENTS" } });
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });
    render(<AccountPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/journey"));
  });

  it("lists the account destinations and goes back to the subscriber home", async () => {
    serve({ "/auth/journey": { phase: "COMPLETE" } });
    render(<AccountPage />);
    for (const [name, href] of [
      ["Foto", "/account/foto?da=account"],
      ["Tessera e classifiche FIT", "/account/fit?da=account"],
      ["Face ID e impronta", "/account/accesso?da=account"],
      ["Abbonamento", "/account/abbonamento?da=account"],
    ])
      expect(
        await screen.findByRole("link", { name: new RegExp(name) }),
      ).toHaveAttribute("href", href);
    expect(screen.getByRole("link", { name: "Indietro" })).toHaveAttribute(
      "href",
      "/user",
    );
    // L'indirizzo per ora non ha interfaccia: resta solo nel database.
    expect(screen.queryByRole("link", { name: /Indirizzo/ })).toBeNull();
  });

  it.each([
    ["ASSESSMENT", "/journey"],
    ["ASSESSMENT_INTRO", "/journey"],
    ["SUBSCRIBED", "/user"],
  ])(
    "opens during %s without waiting for payment or a program",
    async (phase, home) => {
      const replace = vi.fn();
      vi.stubGlobal("location", { ...window.location, replace });
      serve({ "/auth/journey": { phase, welcomeCompleted: true } });
      render(<AccountPage />);
      expect(
        await screen.findByRole("link", { name: /Foto/ }),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Indietro" })).toHaveAttribute(
        "href",
        home,
      );
      expect(replace).not.toHaveBeenCalled();
    },
  );

  it("goes back only to known pages, never to an address from the URL", async () => {
    serve({ "/auth/journey": FREE, "/athlete/profile/photo": { image: null } });
    at("?da=circolo");
    const { unmount } = render(<AccountPhotoPage />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Fatto" })).toHaveAttribute(
        "href",
        "/journey/circolo",
      ),
    );
    unmount();
    at("?da=https://example.com");
    render(<AccountPhotoPage />);
    expect(screen.getByRole("link", { name: "Indietro" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(screen.queryByRole("link", { name: /Salta/ })).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

const ACTIVE = {
  state: "ACTIVE",
  entitled: true,
  cancelDeadline: "2026-11-26T10:00:00.000Z",
  canCancel: true,
  canResume: false,
  subscription: {
    status: "ACTIVE",
    horizon: "PROGRAM_6M",
    billingCycle: "MONTHLY",
    amountCents: 2900,
    currency: "eur",
    currentPeriodStart: "2026-10-27T10:00:00.000Z",
    entitlementEndAt: "2026-11-27T10:00:00.000Z",
    nextChargeAt: "2026-11-27T10:00:00.000Z",
    cancelAtPeriodEnd: false,
    graceEndsAt: null,
    programStartedAt: "2026-10-27T10:00:00.000Z",
    programEndsAt: null,
  },
};

describe("Abbonamento nell'account", () => {
  it("shows the real contract and cancels only after confirmation", async () => {
    let cancelled = false;
    const calls = serve({
      "/auth/journey": { phase: "COMPLETE" },
      "/athlete/profile/photo": { image: null },
      "/payments/subscription/account": () =>
        cancelled
          ? {
              ...ACTIVE,
              canCancel: false,
              canResume: true,
              subscription: { ...ACTIVE.subscription, cancelAtPeriodEnd: true },
            }
          : ACTIVE,
      "/payments/subscription/cancel": () => {
        cancelled = true;
        return {};
      },
    });
    render(<AccountSubscriptionPage />);
    expect(
      await screen.findByRole("heading", { name: "Abbonamento attivo" }),
    ).toBeInTheDocument();
    expect(screen.getByText("6 mesi")).toBeInTheDocument();
    expect(screen.getByText(/29,00\s€ al mese/)).toBeInTheDocument();
    expect(screen.getByText("Prossimo addebito")).toBeInTheDocument();
    expect(screen.queryByText("Programma fino al")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /Disdici a fine periodo/ }),
    );
    expect(calls.some((c) => c.url.endsWith("/subscription/cancel"))).toBe(
      false,
    );
    await userEvent.click(screen.getByRole("button", { name: /Sì, disdici/ }));
    expect(
      await screen.findByRole("button", { name: /Revoca la disdetta/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Prossimo addebito")).toBeNull();
  });

  it("does not present a pause as a chance to buy again", async () => {
    serve({
      "/auth/journey": { phase: "COMPLETE" },
      "/payments/subscription/account": {
        ...ACTIVE,
        state: "PAUSED",
        entitled: false,
        canCancel: false,
      },
    });
    render(<AccountSubscriptionPage />);
    expect(
      await screen.findByRole("heading", { name: "Abbonamento sospeso" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/non serve acquistarne uno nuovo/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Disdici/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /percorso/ })).toBeNull();
  });

  it("explains a missing subscription and a payment still being confirmed", async () => {
    serve({
      "/auth/journey": FREE,
      "/payments/subscription/account": {
        state: "NONE",
        entitled: false,
        subscription: null,
        cancelDeadline: null,
        canCancel: false,
        canResume: false,
      },
    });
    const { unmount } = render(<AccountSubscriptionPage />);
    expect(
      await screen.findByRole("heading", { name: "Nessun abbonamento" }),
    ).toBeInTheDocument();
    unmount();
    serve({
      "/auth/journey": FREE,
      "/payments/subscription/account": {
        ...ACTIVE,
        state: "PENDING",
        entitled: false,
        canCancel: false,
        subscription: {
          ...ACTIVE.subscription,
          status: "CHECKOUT_PENDING",
          currentPeriodStart: null,
          entitlementEndAt: null,
          programStartedAt: null,
        },
      },
    });
    render(<AccountSubscriptionPage />);
    expect(
      await screen.findByRole("heading", { name: "Pagamento in verifica" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Periodo fino al")).toBeNull();
  });
});
