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

function serve() {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (url.endsWith("/auth/register-athlete"))
        return new Response(JSON.stringify({ message: "stop" }), {
          status: 400,
        });
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
    await userEvent.click(
      await screen.findByRole("button", { name: "Inizia il percorso →" }),
    );
    await waitFor(() =>
      expect(events(calls)).toEqual(["landing_viewed", "discovery_started"]),
    );
    const ids = calls
      .filter((call) => call.url.endsWith("/public/events"))
      .map((call) => call.body?.anonymousId);
    expect(new Set(ids).size).toBe(1);
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
    await userEvent.type(screen.getByLabelText("Nome"), "Mario");
    await userEvent.type(screen.getByLabelText("Cognome"), "Rossi");
    await userEvent.type(screen.getByLabelText("E-mail"), "m@pf.test");
    await userEvent.type(screen.getByLabelText("Password"), "password1");
    await userEvent.type(screen.getByLabelText("Conferma password"), "password1");
    await userEvent.click(adult);
    await userEvent.click(screen.getByRole("button", { name: "Crea account" }));
    const registration = await waitFor(() => {
      const call = calls.find((c) => c.url.endsWith("/auth/register-athlete"));
      expect(call).toBeDefined();
      return call!;
    });
    expect(registration.body).toMatchObject({
      adultConfirmed: true,
      attribution: {
        anonymousId: expect.any(String),
        firstTouch: { ref: "abc23456" },
      },
    });
  });
});
