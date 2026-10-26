import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScenariosPage from "./page";

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

afterEach(() => cleanup());

describe("ScenariosPage", () => {
  it("says the choice is not available yet when closed calibration has no scenarios", () => {
    journey.current = {
      calibration: { status: "CALIBRATION_COMPLETED" },
      scenarios: null,
    };
    render(<ScenariosPage />);
    expect(screen.getByRole("status").textContent).toContain(
      "La scelta del percorso non è ancora disponibile",
    );
    expect(screen.getByRole("button", { name: /Aggiorna/ })).toBeTruthy();
  });

  it("keeps pointing to calibration while it is still open", () => {
    journey.current = {
      calibration: { status: "FREE_CALIBRATING" },
      scenarios: null,
    };
    render(<ScenariosPage />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/Stato della calibrazione/)).toBeTruthy();
  });
});
