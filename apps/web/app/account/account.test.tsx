import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountPage from "./page";
import AccountAddressPage from "./indirizzo/page";
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
      ["Indirizzo", "/account/indirizzo?da=account"],
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
        await screen.findByRole("link", { name: /Indirizzo/ }),
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

const SUGGESTIONS = {
  suggestions: [
    {
      placeId: "p-complete",
      text: "Via Roma 12, L’Aquila AQ, Italia",
      mainText: "Via Roma 12",
      secondaryText: "L’Aquila AQ, Italia",
    },
    {
      placeId: "p-route",
      text: "Via Roma, L’Aquila AQ, Italia",
      mainText: "Via Roma",
      secondaryText: "L’Aquila AQ, Italia",
    },
  ],
};
const ADDRESS = {
  street: "Via Roma 12",
  postalCode: "67100",
  city: "L’Aquila",
  province: "AQ",
};
const RESOLVED = {
  complete: true,
  address: ADDRESS,
  formattedAddress: "Via Roma, 12, 67100 L’Aquila AQ, Italia",
  selection: "signed.selection",
};

function addressRoutes(over: Record<string, unknown | Handler> = {}) {
  return serve({
    "/auth/journey": FREE,
    "/athlete/profile/photo": { image: null },
    "/athlete/address": {
      address: null,
      located: false,
      verified: false,
      assisted: true,
    },
    "/athlete/address/suggestions": SUGGESTIONS,
    "/athlete/address/resolve": ({ body }: Call) =>
      body.placeId === "p-route"
        ? {
            complete: false,
            missing: ["STREET_NUMBER"],
            formattedAddress: "Via Roma, L’Aquila",
          }
        : RESOLVED,
    "/athlete/address/selection": {
      address: ADDRESS,
      located: true,
      verified: true,
      assisted: true,
    },
    ...over,
  });
}

const searchBox = () => screen.findByRole("combobox");
const saveButton = () =>
  screen.getByRole("button", { name: /Salva indirizzo/ });

describe("Indirizzo assistito", () => {
  it("does not save free text, only a recognised suggestion", async () => {
    const calls = addressRoutes();
    render(<AccountAddressPage />);
    await userEvent.type(await searchBox(), "via roma 12 aquila");
    expect(saveButton()).toBeDisabled();
    const list = await screen.findByRole("listbox");
    expect(screen.getByText("Google Maps")).toBeInTheDocument();
    await userEvent.click(within(list).getByText("Via Roma 12"));
    expect(await screen.findByText("Indirizzo riconosciuto")).toBeVisible();
    expect(
      screen.getByText("Via Roma 12, 67100 L’Aquila (AQ)"),
    ).toBeInTheDocument();
    await userEvent.click(saveButton());
    expect(
      await screen.findByText(/Indirizzo salvato. Ora vedi quanto dista/),
    ).toBeInTheDocument();
    const saved = calls.find((c) => c.url.endsWith("/address/selection"));
    expect(saved?.body).toEqual({ selection: "signed.selection" });
    expect(
      calls.some(
        (c) => c.url.endsWith("/athlete/address") && c.method === "POST",
      ),
    ).toBe(false);
  });

  it("shares one session token between suggestions and choice, then starts a new one", async () => {
    const calls = addressRoutes();
    render(<AccountAddressPage />);
    const box = await searchBox();
    await userEvent.type(box, "via roma 12");
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByText("Via Roma 12"),
    );
    await screen.findByText("Indirizzo riconosciuto");
    await userEvent.type(box, " bis");
    await screen.findByRole("listbox");
    const tokens = calls
      .filter((c) => /suggestions|resolve/.test(c.url))
      .map((c) => c.body.sessionToken);
    const resolveAt = calls
      .filter((c) => /suggestions|resolve/.test(c.url))
      .findIndex((c) => c.url.endsWith("/resolve"));
    expect(new Set(tokens.slice(0, resolveAt + 1)).size).toBe(1);
    expect(tokens.at(-1)).not.toBe(tokens[0]);
  });

  it("drops the choice when the text changes after it", async () => {
    addressRoutes();
    render(<AccountAddressPage />);
    const box = await searchBox();
    await userEvent.type(box, "via roma 12");
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByText("Via Roma 12"),
    );
    await screen.findByText("Indirizzo riconosciuto");
    expect(saveButton()).toBeEnabled();
    await userEvent.type(box, "3");
    expect(screen.queryByText("Indirizzo riconosciuto")).toBeNull();
    expect(saveButton()).toBeDisabled();
  });

  it("ignores a choice that resolves after the text was changed", async () => {
    let answer: ((value: unknown) => void) | undefined;
    addressRoutes({
      "/athlete/address/resolve": () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    });
    render(<AccountAddressPage />);
    const box = await searchBox();
    await userEvent.type(box, "via roma 12");
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByText("Via Roma 12"),
    );
    await waitFor(() => expect(answer).toBeDefined());
    await userEvent.type(box, "3");
    answer!(RESOLVED);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Indirizzo riconosciuto")).toBeNull();
    expect(saveButton()).toBeDisabled();
  });

  it("says what is missing from an incomplete place and keeps saving off", async () => {
    addressRoutes();
    render(<AccountAddressPage />);
    await userEvent.type(await searchBox(), "via roma");
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByText("Via Roma"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "manca il numero civico",
    );
    expect(saveButton()).toBeDisabled();
  });

  it("ignores a late answer to an older search", async () => {
    let release: ((value: unknown) => void) | undefined;
    addressRoutes({
      "/athlete/address/suggestions": ({ body }: Call) =>
        String(body.input) === "via rom"
          ? new Promise((resolve) => {
              release = resolve;
            })
          : SUGGESTIONS,
    });
    render(<AccountAddressPage />);
    const box = await searchBox();
    await userEvent.type(box, "via rom");
    await waitFor(() => expect(release).toBeDefined());
    await userEvent.type(box, "a 12");
    expect(await screen.findByText("Via Roma 12")).toBeInTheDocument();
    release!({
      suggestions: [
        {
          placeId: "old",
          text: "Via Romagna, Pescara",
          mainText: "Via Romagna",
          secondaryText: null,
        },
      ],
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Via Romagna")).toBeNull();
  });

  it("keeps the saved address and the draft when the service is down, then retries", async () => {
    let down = true;
    addressRoutes({
      "/athlete/address": {
        address: ADDRESS,
        located: true,
        verified: false,
        assisted: true,
      },
      "/athlete/address/suggestions": () =>
        down
          ? new Response(
              JSON.stringify({
                message:
                  "Il servizio indirizzi non risponde. Riprova tra poco.",
              }),
              { status: 503 },
            )
          : SUGGESTIONS,
    });
    render(<AccountAddressPage />);
    const box = await searchBox();
    expect(screen.getByText("Indirizzo salvato")).toBeInTheDocument();
    await userEvent.type(box, "via roma 12");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /non risponde.*Il tuo indirizzo salvato resta com’è/,
    );
    expect(box).toHaveValue("via roma 12");
    expect(saveButton()).toBeDisabled();
    down = false;
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("keeps the manual form while assisted search is not configured", async () => {
    addressRoutes({
      "/athlete/address": {
        address: null,
        located: false,
        verified: false,
        assisted: false,
      },
    });
    render(<AccountAddressPage />);
    expect(await screen.findByLabelText("CAP")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("offers the way back to the club choice after saving from there", async () => {
    addressRoutes();
    at("?da=circolo");
    render(<AccountAddressPage />);
    await userEvent.type(await searchBox(), "via roma 12");
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByText("Via Roma 12"),
    );
    await screen.findByText("Indirizzo riconosciuto");
    await userEvent.click(saveButton());
    expect(
      await screen.findByRole("link", {
        name: /Torna alla scelta del circolo/,
      }),
    ).toHaveAttribute("href", "/journey/circolo");
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
