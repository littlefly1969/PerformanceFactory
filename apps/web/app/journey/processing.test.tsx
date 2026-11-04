import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import JourneyPage from "./page";

vi.mock("../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("valutazione in corso", () => {
  it("mostra il calcolo della demo e si aggiorna da sola", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            phase: "PROCESSING",
            welcomeCompleted: true,
            questions: [],
            answers: {},
            currentQuestion: 14,
            count: 14,
          }),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    render(<JourneyPage />);
    // Come nella demo: l'esagono completo mentre l'AI calcola.
    expect(
      await screen.findByRole("heading", { name: "Esagono completo." }),
    ).toBeTruthy();
    expect(screen.getByText("Sto calcolando la tua performance.")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 2300));
    expect(fetch.mock.calls.length).toBeGreaterThan(1);
  });
});
