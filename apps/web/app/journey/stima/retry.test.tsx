import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calibration, journey } from "../_account/account-fixtures";
import RevealPage from "./page";

vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const horizon = (h: string, months: number) => ({
  horizon: h,
  months,
  drivers: [50, 60, 70].map((current, i) => ({
    id: `d${i}`,
    name: `Area ${i}`,
    current,
    potential: current + months,
    confidence: 80,
  })),
  gap: { overall: null, technicalTactical: null },
});

describe("RevealPage (S15) senza percorso caricato", () => {
  it("shows the error with a retry, then the scenarios once loaded", async () => {
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (fail) throw new TypeError("Failed to fetch");
        return new Response(
          JSON.stringify(
            journey({
              calibration: calibration(null, "CALIBRATION_COMPLETED", {
                ruleMet: true,
              }),
              scenarios: {
                status: "READY",
                engine: { key: "k", version: "1", provisional: false },
                scale: { min: 0, max: 100 },
                selectedHorizon: null,
                horizons: [
                  horizon("PROGRAM_3M", 3),
                  horizon("PROGRAM_6M", 6),
                  horizon("PROGRAM_12M", 12),
                ],
              },
            }),
          ),
        );
      }),
    );
    render(<RevealPage />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Non riusciamo a caricare i tuoi scenari",
    );
    expect(screen.queryByText("Carichiamo i tuoi scenari…")).toBeNull();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: /Riprova/ }));
    expect(
      await screen.findByRole("heading", {
        name: "Dove sei adesso e dove puoi arrivare",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the retry when the new attempt fails too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    render(<RevealPage />);
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: /Riprova/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Riprova/ })).toBeTruthy();
  });
});
