import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketingPreference, ReferralCard } from "./marketing-and-referral";

type Call = { url: string; method: string; body?: unknown };

function serve(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      // Chiave "METODO /percorso" oppure "/percorso" per qualsiasi metodo.
      const key = Object.keys(routes).find((route) => {
        const [verb, path] = route.includes(" ")
          ? route.split(" ")
          : [method, route];
        return verb === method && url.endsWith(path);
      });
      return key
        ? new Response(JSON.stringify(routes[key]))
        : new Response("{}", { status: 404 });
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("profilo: marketing e invito", () => {
  it("hides the referral link while the flag is off", async () => {
    const calls = serve({ "/features/me": { referral_share: false } });
    render(<ReferralCard />);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByText("Invita un amico")).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith("/athlete/referral"))).toBe(false);
  });

  it("shows the personal link when the flag is on", async () => {
    serve({
      "/features/me": { referral_share: true },
      "/athlete/referral": {
        code: "abc23456",
        link: "https://pf.test/start?ref=abc23456",
        invited: 2,
      },
    });
    render(<ReferralCard />);
    expect(await screen.findByText("abc23456")).toBeInTheDocument();
    expect(screen.getByText(/si sono registrate 2 persone/)).toBeInTheDocument();
  });

  it("lets the athlete withdraw the optional marketing consent", async () => {
    const calls = serve({
      "GET /consents/marketing": { granted: true },
      "PUT /consents/marketing": { granted: false },
      "/auth/token": { accessToken: "token" },
    });
    render(<MarketingPreference />);
    const box = await screen.findByRole("checkbox", { name: /novità/ });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(await screen.findByText("Consenso revocato.")).toBeInTheDocument();
    expect(box).not.toBeChecked();
    expect(
      calls.find((c) => c.method === "PUT")?.body,
    ).toEqual({ granted: false });
  });
});
