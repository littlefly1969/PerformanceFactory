import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import StartPage from "./page";
import type { DiscoveryConfiguration } from "./discovery-types";
import { campaignEntry, QUIZ_TOKEN_KEY, withQuizToken } from "./quiz-draft";

const question = (id: string, title: string, order: number) => ({
  id,
  code: id,
  title,
  type: "single_choice" as const,
  required: true,
  order,
  options: [{ id: `${id}-a`, value: "a", label: `${title} A` }],
});

const current: DiscoveryConfiguration = {
  version: 5,
  questions: [question("new-first", "Domanda nuova", 1)],
};
const frozen: DiscoveryConfiguration = {
  version: 4,
  questions: [
    question("old-first", "Prima domanda", 1),
    question("old-second", "Seconda domanda", 2),
  ],
};

type Call = {
  url: string;
  method: string;
  token?: string | null;
  body?: unknown;
};

function serve(saved?: {
  configuration: DiscoveryConfiguration;
  draft: unknown;
}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        method: init?.method ?? "GET",
        token: headers.get("x-quiz-token"),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (url.endsWith("/public/quiz-drafts"))
        return new Response(
          JSON.stringify({
            token: "token-1",
            configuration: current,
            draft: {
              version: current.version,
              currentStep: "intro",
              answers: {},
            },
          }),
        );
      if (url.endsWith("/public/quiz-draft"))
        return saved
          ? new Response(JSON.stringify(saved))
          : new Response("{}", { status: 404 });
      return new Response(JSON.stringify(current));
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("server quiz draft", () => {
  it("resumes another session's draft on its frozen configuration (AT-04)", async () => {
    window.localStorage.setItem(QUIZ_TOKEN_KEY, "token-old");
    const calls = serve({
      configuration: frozen,
      draft: {
        version: 4,
        currentStep: "old-second",
        answers: { "old-first": "old-first-a" },
      },
    });
    render(<StartPage />);
    expect(
      await screen.findByRole("heading", { name: "Seconda domanda" }),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith("/quiz-draft"))).toMatchObject({
      method: "GET",
      token: "token-old",
    });
    expect(calls.some((c) => c.url.endsWith("/athlete-discovery"))).toBe(false);
  });

  it("starts a draft when leaving the intro and saves each answer", async () => {
    const calls = serve();
    render(<StartPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Inizia il percorso →" }),
    );
    await waitFor(() =>
      expect(window.localStorage.getItem(QUIZ_TOKEN_KEY)).toBe("token-1"),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Domanda nuova A" }),
    );
    await waitFor(
      () =>
        expect(calls.find((c) => c.method === "PUT")).toMatchObject({
          token: "token-1",
          body: {
            draft: { version: 5, answers: { "new-first": "new-first-a" } },
          },
        }),
      { timeout: 2000 },
    );
  });

  it("forgets an expired token and falls back to the current quiz", async () => {
    window.localStorage.setItem(QUIZ_TOKEN_KEY, "token-gone");
    serve();
    render(<StartPage />);
    expect(
      await screen.findByRole("button", { name: "Inizia il percorso →" }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(QUIZ_TOKEN_KEY)).toBeNull();
  });

  it("opens the first question straight away from a campaign link (AT-01)", async () => {
    window.history.replaceState(null, "", "/start?utm_source=club-qr");
    serve();
    render(<StartPage />);
    expect(
      await screen.findByRole("heading", { name: "Domanda nuova" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(window.localStorage.getItem(QUIZ_TOKEN_KEY)).toBe("token-1"),
    );
  });
});

describe("quiz draft helpers", () => {
  it("recognises campaign, club and referral entries", () => {
    expect(campaignEntry(new URL("https://pf.test/start?ref=abc"))).toBe(true);
    expect(campaignEntry(new URL("https://pf.test/start?club=7"))).toBe(true);
    expect(campaignEntry(new URL("https://pf.test/start"))).toBe(false);
  });

  it("retries the registration once without an expired token", async () => {
    window.localStorage.setItem(QUIZ_TOKEN_KEY, "token-gone");
    const send = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}"));
    const response = await withQuizToken(send);
    expect(response.ok).toBe(true);
    expect(send.mock.calls).toEqual([["token-gone"], []]);
    expect(window.localStorage.getItem(QUIZ_TOKEN_KEY)).toBeNull();
  });
});
