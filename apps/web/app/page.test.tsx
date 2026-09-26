import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Home from "./page";
import { secureFetch } from "./lib/api";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("./lib/api", () => ({ API_BASE: "/api", secureFetch: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each([
  ["COMPLETE", 200, "/user"],
  ["ASSESSMENT", 200, "/journey"],
  ["CONSENTS", 200, "/journey"],
  [undefined, 404, "/journey"],
  [undefined, 503, "/journey"],
])(
  "routes journey %s (HTTP %s) to %s without the legacy fallback",
  async (nextStep, status, destination) => {
    const location = { href: "", replace: vi.fn() };
    vi.stubGlobal("window", new Proxy(window, {
      get: (target, key) => key === "location" ? location : Reflect.get(target, key),
    }));
    vi.mocked(secureFetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ role: "USER", onboardingRequired: true }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ nextStep }), { status }),
      );
    render(<Home />);
    await waitFor(() => expect(location.href).toBe(destination));
  },
);

it("preserves administrator routing", async () => {
  const location = { href: "", replace: vi.fn() };
  vi.stubGlobal("window", new Proxy(window, {
      get: (target, key) => key === "location" ? location : Reflect.get(target, key),
    }));
  vi.mocked(secureFetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ role: "ADMIN" })),
  );
  render(<Home />);
  await waitFor(() => expect(location.href).toBe("/admin/cycles"));
  expect(secureFetch).toHaveBeenCalledTimes(1);
});
