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
  it("waits for the provider confirmation, then goes back to the journey", async () => {
    const replace = at("?checkout=success");
    const answers = [{ entitled: false }, { entitled: true }];
    const fetch = vi.fn(
      async () => new Response(JSON.stringify(answers.shift())),
    );
    vi.stubGlobal("fetch", fetch);
    render(<SubscriptionReturnPage />);
    expect(
      screen.getByRole("heading", { name: "Confermiamo il tuo pagamento…" }),
    ).toBeTruthy();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/journey"), {
      timeout: 4000,
    });
    expect(fetch).toHaveBeenCalledWith("/api/payments/subscription", undefined);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("shows a cancelled checkout without asking the server", async () => {
    at("?checkout=cancel");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<SubscriptionReturnPage />);
    expect(
      await screen.findByRole("heading", { name: "Pagamento annullato." }),
    ).toBeTruthy();
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
});
