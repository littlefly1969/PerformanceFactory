import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import JourneyPage from "./page";
import { DRAFT_KEY } from "../start/discovery-state";
import { QUIZ_TOKEN_KEY } from "../start/quiz-draft";
vi.mock("../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
}));
const question = (id: string) => ({
  id,
  code: id,
  title: id,
  type: "number",
  required: true,
  order: 1,
  min: 30,
  max: 200,
  options: [],
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, "", "/journey");
});

describe("Google return with a frozen quiz", () => {
  it("checks the draft against the frozen version, not the newer published one", async () => {
    window.history.replaceState(null, "", "/journey?google=complete");
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });
    // Quiz iniziato e completato sulla V1; nel frattempo l'admin pubblica la V2.
    const frozen = { version: 1, questions: [question("weight")] };
    const published = { version: 2, questions: [question("height")] };
    const draft = {
      version: 1,
      currentStep: "registration",
      answers: { weight: 75 },
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    localStorage.setItem(QUIZ_TOKEN_KEY, "quiz-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/quiz-draft"))
          return new Response(JSON.stringify({ configuration: frozen, draft }));
        if (url.endsWith("/athlete-discovery"))
          return new Response(JSON.stringify(published));
        if (url.endsWith("/pending"))
          return new Response(JSON.stringify({ email: "google@example.test" }));
        if (url.endsWith("/documents"))
          return new Response(
            JSON.stringify([
              {
                type: "PRIVACY",
                title: "Privacy",
                summary: "Sintesi",
                body: ["Testo vigente"],
                version: "1",
                documentHash: "hash",
              },
            ]),
          );
        return new Response("{}");
      }),
    );
    render(<JourneyPage />);
    expect(
      await screen.findByRole("button", { name: "Accetta e continua" }),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
