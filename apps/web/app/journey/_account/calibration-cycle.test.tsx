import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CalibrationPage from "../calibrazione/page";
import { calibration, journey, ROUND } from "./account-fixtures";
vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/journey");
});

const question = (id: string, text: string) => ({
  id,
  areaId: "d0",
  text,
  multiple: false,
  options: [
    { value: "o1", label: "Spesso" },
    { value: "o2", label: "Raramente" },
  ],
});
/** Un blocco della calibrazione: la coppia di domande scritta dall'AI. */
const QUESTIONS = {
  ...ROUND,
  action: "ASK_GROUP",
  questions: [question("q1", "Prima domanda?"), question("q2", "Seconda?")],
};

/** Fetch per percorso, con le chiamate registrate. */
function queue(routes: Record<string, () => unknown>) {
  const calls: { url: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push({ url });
      const key = Object.keys(routes).find((k) => url.includes(k));
      return new Response(JSON.stringify(key ? routes[key]() : {}));
    }),
  );
  return calls;
}

describe("Ciclo di calibrazione della demo", () => {
  it("enters the first block from the provisional profile, with the hexagon while the AI writes the pair", async () => {
    window.history.replaceState(null, "", "/journey/calibrazione?ciclo=1");
    let release: () => void = () => undefined;
    let opened = false;
    const calls = queue({
      "/auth/journey": () =>
        journey({ calibration: calibration(opened ? QUESTIONS : null) }),
      "/calibration/round": () => {
        opened = true;
        return journey({ calibration: calibration(QUESTIONS) });
      },
    });
    const fetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        // L'AI scrive la coppia finché il test non la sblocca.
        if (url.endsWith("/calibration/round"))
          await new Promise<void>((resolve) => (release = resolve));
        return fetch(url, init);
      }),
    );
    render(<CalibrationPage />);
    expect(
      await screen.findByRole("heading", { name: "Preparo le tue domande." }),
    ).toBeVisible();
    expect(window.location.search).toBe("");
    release();
    expect(await screen.findByText("Prima domanda?")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Spesso/ }));
    expect(screen.getByText("Seconda?")).toBeVisible();
    expect(
      calls.filter((c) => c.url.endsWith("/calibration/round")),
    ).toHaveLength(1);
  });
});
