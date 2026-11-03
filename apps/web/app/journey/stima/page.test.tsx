import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import RevealPage from "./page";

const journey = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../_account/calibration-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_account/calibration-state")>()),
  useAccountJourney: () => ({
    journey: journey.current,
    error: null,
    busy: false,
    action: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const horizon = (h: string, months: number, potential: number[]) => ({
  horizon: h,
  months,
  drivers: [50, 60, 70].map((current, i) => ({
    id: `d${i}`,
    name: `Area ${i}`,
    current,
    potential: potential[i],
    confidence: 80,
  })),
  gap: { overall: null, technicalTactical: null },
});
const scenarios = (p12: number[]) => ({
  status: "READY",
  engine: { key: "k", version: "1", provisional: false },
  scale: { min: 0, max: 100 },
  selectedHorizon: null,
  horizons: [
    horizon("PROGRAM_3M", 3, [55, 63, 72]),
    horizon("PROGRAM_6M", 6, [60, 66, 75]),
    horizon("PROGRAM_12M", 12, p12),
  ],
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RevealPage (S15)", () => {
  it("shows R and the server's P3/P6/P12, starting from 6 months", async () => {
    journey.current = {
      calibration: { status: "CALIBRATION_COMPLETED" },
      scenarios: scenarios([66, 72, 81]),
    };
    render(<RevealPage />);
    expect(
      screen.getByRole("heading", {
        name: "Dove sei adesso e dove puoi arrivare",
      }),
    ).toBeTruthy();
    const cells = screen.getAllByRole("definition").map((d) => d.textContent);
    expect(cells).toEqual(["60", "63", "67", "73"]);
    expect(screen.getByRole("radio", { name: "6 mesi" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await userEvent.click(screen.getByRole("radio", { name: "12 mesi" }));
    expect(screen.getByText("P12 · stima a 12 mesi")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Scegli il tuo scenario/ }),
    ).toHaveAttribute("href", "/journey/scenari");
    expect(screen.queryByText(/P6 e P12 coincidono/)).toBeNull();
  });

  it("says so when P6 and P12 are the same", () => {
    journey.current = {
      calibration: { status: "CALIBRATION_COMPLETED" },
      scenarios: scenarios([60, 66, 75]),
    };
    render(<RevealPage />);
    expect(screen.getByText(/P6 e P12 coincidono/)).toBeTruthy();
  });

  it("sends to the scenarios page when they are not ready", () => {
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });
    journey.current = {
      calibration: { status: "CALIBRATION_COMPLETED" },
      scenarios: { status: "PENDING" },
    };
    render(<RevealPage />);
    expect(replace).toHaveBeenCalledWith("/journey/scenari");
    expect(screen.getByRole("status")).toHaveTextContent("Carichiamo");
  });
});
