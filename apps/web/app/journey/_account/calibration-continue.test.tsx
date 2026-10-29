import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CalibrationPage from "../calibrazione/page";
import type { Journey } from "../journey-types";
import { AccountHome } from "./account-home";
import { calibration, journey, lesson, serve } from "./account-fixtures";
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

/** Le navigazioni della pagina, senza lasciare il documento di test. */
function navigation() {
  const assign = vi.fn();
  const replace = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign, replace });
  return { assign, replace };
}

describe("Calibrazione con la lezione in attesa o R consolidata", () => {
  it("keeps calibrating while the lesson is pending, with the lesson one tap away", async () => {
    navigation();
    const calls = serve({
      "/auth/journey": journey({
        calibration: calibration(null, "FREE_LESSON_VALIDATION", {
          ruleMet: true,
        }),
      }),
      "/athlete-journey/free-lesson": { ...lesson, phase: "ASSIGNED" },
    });
    render(<CalibrationPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Continua la calibrazione/ }),
    );
    expect(calls.some((c) => c.url.endsWith("/calibration/round"))).toBe(true);
    expect(
      screen.getByRole("link", { name: "La tua lezione gratuita" }),
    ).toHaveAttribute("href", "/journey/circolo");
    expect(
      screen.queryByRole("button", { name: /Vai ai tuoi scenari/ }),
    ).toBeNull();
  });

  it("lets the athlete with R consolidated choose the scenarios", async () => {
    const { assign } = navigation();
    const calls = serve({
      "/auth/journey": journey({
        calibration: calibration(null, "FREE_LEVEL_ESTIMATED", {
          ruleMet: true,
          canFinish: true,
        }),
      }),
      "/athlete-journey/free-lesson": { ...lesson, phase: "DECLINED" },
    });
    render(<CalibrationPage />);
    expect(
      await screen.findByRole("button", { name: /Continua la calibrazione/ }),
    ).toBeEnabled();
    await userEvent.click(
      screen.getByRole("button", { name: /Vai ai tuoi scenari/ }),
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("/journey/scenari"),
    );
    expect(calls.some((c) => c.url.endsWith("/calibration/finish"))).toBe(true);
  });

  it("warns clearly when the deadline closed an R not consolidated", async () => {
    navigation();
    serve({
      "/auth/journey": journey({
        calibration: calibration(null, "CALIBRATION_COMPLETED", {
          completionReason: "DEADLINE_REACHED",
        }),
      }),
      "/athlete-journey/free-lesson": { ...lesson, phase: "CLOSED" },
    });
    render(<CalibrationPage />);
    expect(
      await screen.findByText(/la tua R è una stima poco affidabile/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Vedi dove puoi arrivare/ }),
    ).toHaveAttribute("href", "/journey/scenari");
  });

  it("shows the lesson as a secondary link on Home while calibrating", async () => {
    const j = journey({
      calibration: calibration(null, "FREE_LESSON_VALIDATION"),
    });
    serve({
      "/auth/journey": j,
      "/athlete-journey/free-lesson": { ...lesson, phase: "REQUESTED" },
    });
    render(<AccountHome journey={j as unknown as Journey} />);
    expect(
      await screen.findByRole("link", { name: /Continua la calibrazione/ }),
    ).toHaveAttribute("href", "/journey/calibrazione");
    expect(
      screen.getByRole("link", { name: "Gestisci la lezione" }),
    ).toHaveAttribute("href", "/journey/circolo");
  });
});
