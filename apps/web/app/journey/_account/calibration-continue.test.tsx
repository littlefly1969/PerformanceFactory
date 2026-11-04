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
        calibration: calibration(null, "FREE_LESSON_VALIDATION"),
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

  it("with R consolidated and the lesson pending, the lesson is the yellow step", async () => {
    navigation();
    serve({
      "/auth/journey": journey({
        calibration: calibration(null, "FREE_LESSON_VALIDATION", {
          ruleMet: true,
        }),
      }),
      "/athlete-journey/free-lesson": { ...lesson, phase: "ASSIGNED" },
    });
    render(<CalibrationPage />);
    const lessonLink = await screen.findByRole("link", {
      name: /La tua lezione gratuita/,
    });
    expect(lessonLink).toHaveAttribute("href", "/journey/circolo");
    expect(lessonLink).toHaveClass("pf-acc-pill", "is-lime");
    expect(
      screen.queryByRole("button", { name: /Continua la calibrazione/ }),
    ).toBeNull();
  });

  it("lets the athlete with R consolidated choose the scenarios, without more calibration", async () => {
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
    const scenarios = await screen.findByRole("button", {
      name: /Vai ai tuoi scenari/,
    });
    expect(scenarios).toHaveClass("is-lime");
    expect(
      screen.queryByRole("button", { name: /Continua la calibrazione/ }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Salva e vai alla home" }),
    ).toHaveAttribute("href", "/journey");
    await userEvent.click(scenarios);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/journey/stima"));
    expect(calls.some((c) => c.url.endsWith("/calibration/finish"))).toBe(true);
  });

  it("with R consolidated and the lesson unlocked, Scegli il circolo is the yellow step", async () => {
    navigation();
    serve({
      "/auth/journey": journey({
        calibration: calibration(null, "FREE_LEVEL_ESTIMATED", {
          ruleMet: true,
        }),
      }),
      "/athlete-journey/free-lesson": { ...lesson, phase: "ELIGIBLE" },
    });
    render(<CalibrationPage />);
    const club = await screen.findByRole("link", {
      name: /Scegli il circolo per la lezione gratuita/,
    });
    expect(club).toHaveAttribute("href", "/journey/circolo");
    expect(club).toHaveClass("pf-acc-pill", "is-lime");
    expect(
      screen.queryByRole("button", { name: /Continua la calibrazione/ }),
    ).toBeNull();
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
    ).toHaveAttribute("href", "/journey/stima");
  });

  it("shows the requested lesson on Home while calibrating", async () => {
    const j = journey({
      calibration: calibration(null, "FREE_LESSON_VALIDATION"),
    });
    serve({
      "/auth/journey": j,
      "/athlete-journey/free-lesson": {
        ...lesson,
        phase: "REQUESTED",
        seat: {
          status: "REQUESTED",
          club: { name: "Padel Club Nord", city: "Milano" },
          preferredLessonId: null,
          lesson: null,
        },
      },
    });
    render(<AccountHome journey={j as unknown as Journey} />);
    expect(
      await screen.findByRole("link", { name: /Lezione richiesta/ }),
    ).toHaveAttribute("href", "/journey/circolo");
    expect(
      screen.getByRole("link", { name: /Continua il profilo/ }),
    ).toHaveAttribute("href", "/journey/calibrazione");
  });
});
