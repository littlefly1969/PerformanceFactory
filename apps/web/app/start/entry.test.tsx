import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import StartPage from "./page";
import { DRAFT_KEY } from "./discovery-state";
import type { DiscoveryConfiguration } from "./discovery-types";

const config: DiscoveryConfiguration = {
  version: 3,
  questions: [
    {
      id: "only",
      code: "only",
      title: "Unica domanda",
      type: "single_choice",
      required: true,
      order: 1,
      options: [{ id: "a", value: "a", label: "Risposta A" }],
    },
  ],
};

type Call = { url: string; body?: Record<string, unknown> };

const documents = [
  {
    type: "PRIVACY",
    version: "p1",
    title: "Informativa privacy e trattamento dati Performance Factory",
    summary: "Sintesi privacy",
    body: ["Testo privacy"],
    documentHash: "hash-privacy",
  },
  {
    type: "AI_ASSISTANT",
    version: "a1",
    title: "Consenso esplicito all uso dell assistente AI",
    summary: "Sintesi AI",
    body: ["Testo AI"],
    documentHash: "hash-ai",
  },
];

function serve(
  registration: "fails" | "succeeds" = "fails",
  withDocuments = false,
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (url.endsWith("/consents/documents"))
        return withDocuments
          ? new Response(JSON.stringify(documents))
          : new Response("{}", { status: 503 });
      if (url.endsWith("/auth/register-athlete"))
        return registration === "succeeds"
          ? new Response(JSON.stringify({ journey: { nextStep: "CONSENTS" } }))
          : new Response(JSON.stringify({ message: "stop" }), { status: 400 });
      return new Response(JSON.stringify(config));
    }),
  );
  return calls;
}

const events = (calls: Call[]) =>
  calls
    .filter((call) => call.url.endsWith("/public/events"))
    .map((call) => (call.body?.events as { name: string }[])[0].name);

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("Ingresso: attribuzione, eventi e 18+", () => {
  it("tracks the pre-login funnel with one anonymous id", async () => {
    window.history.replaceState(null, "", "/start?club=padel-nord");
    const calls = serve();
    render(<StartPage />);
    // Dal QR del circolo il quiz parte dalla prima domanda (AT-01).
    await screen.findByRole("heading", { name: "Unica domanda" });
    await waitFor(() =>
      expect(events(calls)).toEqual(["landing_viewed", "discovery_started"]),
    );
    const ids = calls
      .filter((call) => call.url.endsWith("/public/events"))
      .map((call) => call.body?.anonymousId);
    expect(new Set(ids).size).toBe(1);
    // Ogni evento ha il suo id: il server scarta i reinvii.
    const eventIds = calls
      .filter((call) => call.url.endsWith("/public/events"))
      .map((call) => (call.body?.events as { eventId: string }[])[0].eventId);
    expect(new Set(eventIds).size).toBe(2);
    expect(JSON.parse(localStorage.getItem("pf.firstTouch")!)).toMatchObject({
      club: "padel-nord",
      landingPath: "/start",
    });
  });

  it("does not recount events when a saved draft is resumed", async () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 3,
        currentStep: "registration",
        answers: { only: "a" },
      }),
    );
    const calls = serve();
    render(<StartPage />);
    await screen.findByRole("heading", { name: "Crea il tuo account." });
    await waitFor(() => expect(events(calls)).toEqual(["landing_viewed"]));
  });

  it("requires the 18+ declaration and sends it with the attribution", async () => {
    window.history.replaceState(null, "", "/start?ref=abc23456");
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 3,
        currentStep: "registration",
        answers: { only: "a" },
      }),
    );
    const calls = serve();
    render(<StartPage />);
    const adult = await screen.findByRole("checkbox", {
      name: /almeno 18 anni/,
    });
    expect(adult).toBeRequired();
    await userEvent.type(
      screen.getByLabelText("Nome e cognome"),
      "Mario Rossi",
    );
    await userEvent.type(screen.getByLabelText("E-mail"), "m@pf.test");
    await userEvent.type(screen.getByLabelText("Password"), "password1");
    await userEvent.type(
      screen.getByLabelText("Conferma password"),
      "password1",
    );
    await userEvent.click(adult);
    await userEvent.click(screen.getByRole("button", { name: "Crea account" }));
    const registration = await waitFor(() => {
      const call = calls.find((c) => c.url.endsWith("/auth/register-athlete"));
      expect(call).toBeDefined();
      return call!;
    });
    expect(registration.body).toMatchObject({
      firstName: "Mario",
      lastName: "Rossi",
      adultConfirmed: true,
      attribution: {
        anonymousId: expect.any(String),
        firstTouch: { ref: "abc23456" },
      },
    });
    // Una registrazione rifiutata conserva l'attribuzione per il nuovo tentativo.
    expect(localStorage.getItem("pf.firstTouch")).not.toBeNull();
  });

  it("clears the attribution once the account exists", async () => {
    window.history.replaceState(null, "", "/start?club=padel-nord");
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 3,
        currentStep: "registration",
        answers: { only: "a" },
      }),
    );
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    serve("succeeds");
    render(<StartPage />);
    await userEvent.type(
      await screen.findByLabelText("Nome e cognome"),
      "Mario Rossi",
    );
    await userEvent.type(screen.getByLabelText("E-mail"), "m@pf.test");
    await userEvent.type(screen.getByLabelText("Password"), "password1");
    await userEvent.type(
      screen.getByLabelText("Conferma password"),
      "password1",
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /almeno 18 anni/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Crea account" }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    // Una seconda persona sullo stesso browser non eredita id, circolo o referral.
    expect(localStorage.getItem("pf.firstTouch")).toBeNull();
    expect(localStorage.getItem("pf.lastTouch")).toBeNull();
    expect(localStorage.getItem("pf.anonymousId")).toBeNull();
  });

  it("collects privacy and AI consents in the sign-up form when the documents load", async () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 3,
        currentStep: "registration",
        answers: { only: "a" },
      }),
    );
    const calls = serve("fails", true);
    render(<StartPage />);
    const privacy = await screen.findByRole("checkbox", {
      name: /Informativa privacy/,
    });
    await userEvent.type(
      screen.getByLabelText("Nome e cognome"),
      "Anna Maria De Rossi",
    );
    await userEvent.type(screen.getByLabelText("E-mail"), "a@pf.test");
    await userEvent.type(screen.getByLabelText("Password"), "password1");
    await userEvent.type(
      screen.getByLabelText("Conferma password"),
      "password1",
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /almeno 18 anni/ }),
    );
    const submit = screen.getByRole("button", { name: "Crea account" });
    // Privacy e AI sono obbligatori: senza, il pulsante resta spento.
    expect(submit).toBeDisabled();
    await userEvent.click(privacy);
    await userEvent.click(
      screen.getByRole("checkbox", { name: /assistente AI/ }),
    );
    // Il testo completo si apre sotto la voce.
    await userEvent.click(
      screen.getAllByRole("button", { name: "Leggi ↓" })[0],
    );
    expect(screen.getByText("Testo privacy")).toBeInTheDocument();
    await userEvent.click(submit);
    const registration = await waitFor(() => {
      const call = calls.find((c) => c.url.endsWith("/auth/register-athlete"));
      expect(call).toBeDefined();
      return call!;
    });
    expect(registration.body).toMatchObject({
      firstName: "Anna",
      lastName: "Maria De Rossi",
      privacyAccepted: true,
      aiAssistantAccepted: true,
      marketingAccepted: false,
      acceptedDocuments: [
        { type: "PRIVACY", version: "p1", documentHash: "hash-privacy" },
        { type: "AI_ASSISTANT", version: "a1", documentHash: "hash-ai" },
      ],
    });
  });

  it("asks for a surname before sending the registration", async () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 3,
        currentStep: "registration",
        answers: { only: "a" },
      }),
    );
    const calls = serve();
    render(<StartPage />);
    await userEvent.type(
      await screen.findByLabelText("Nome e cognome"),
      "Mario",
    );
    await userEvent.type(screen.getByLabelText("E-mail"), "m@pf.test");
    await userEvent.type(screen.getByLabelText("Password"), "password1");
    await userEvent.type(
      screen.getByLabelText("Conferma password"),
      "password1",
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /almeno 18 anni/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Crea account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Scrivi nome e cognome",
    );
    expect(calls.some((c) => c.url.endsWith("/auth/register-athlete"))).toBe(
      false,
    );
  });
});
