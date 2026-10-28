import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "../profilo/page";
import CoachPage from "../coach/page";
import CalibrationPage from "../calibrazione/page";
import { calibration, journey, lesson, ROUND, serve } from "./account-fixtures";
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

const PROFILE = {
  firstName: "Stefano",
  sport: "Padel",
  experience: null,
  global: { value: 83, low: 70, high: 96, confidence: 30, provisional: true },
};
const FIT = {
  ranking: null,
  options: {
    PADEL: [{ value: "3", label: "3ª fascia" }],
    TENNIS: [{ value: "NONE", label: "Nessuna classifica" }],
  },
  recalculationPending: false,
};

describe("Lezione gratuita prima dell'assessment", () => {
  const intro = journey({
    phase: "ASSESSMENT_INTRO",
    evaluation: null,
    calibration: null,
    currentQuestion: 0,
  });

  it("promises nothing when the free lesson is off", async () => {
    serve({
      "/auth/journey": intro,
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": { enabled: false },
    });
    render(<ProfilePage />);
    expect(await screen.findByText("Scopri dove sei oggi.")).toBeVisible();
    expect(screen.queryByText(/Lezione gratuita/)).toBeNull();
  });

  it("presents the assessment as the first step when clubs offer it", async () => {
    serve({
      "/auth/journey": intro,
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": { ...lesson, phase: "UNAVAILABLE" },
    });
    render(<ProfilePage />);
    expect(
      await screen.findByText(
        "Completa l’assessment: è il primo passo per sbloccarla.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(/fino a sbloccare la lezione di prova/),
    ).toBeVisible();
  });
});

describe("Dati personali fuori dal profilo sportivo", () => {
  it("leaves FIT and address to the account menu, keeping the sport profile", async () => {
    serve({
      "/auth/journey": journey(),
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": lesson,
      "/fit-ranking": FIT,
    });
    render(<ProfilePage />);
    expect(
      await screen.findByRole("img", { name: /Il tuo Spider/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Dove abiti")).toBeNull();
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    await userEvent.click(
      screen.getByRole("button", { name: "Il tuo account" }),
    );
    expect(
      screen.getByRole("link", { name: "Tessera e classifiche FIT" }),
    ).toHaveAttribute("href", "/account/fit?da=profilo");
    expect(screen.getByRole("link", { name: "Foto" })).toHaveAttribute(
      "href",
      "/account/foto?da=profilo",
    );
  });

  it("sends the old address anchor to the account", async () => {
    serve({
      "/auth/journey": journey(),
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": lesson,
    });
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, hash: "#indirizzo", replace });
    render(<ProfilePage />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/account/indirizzo?da=profilo"),
    );
  });
});

describe("Round rimasto in valutazione", () => {
  it("resends the fixed answers from the calibration page", async () => {
    const stalled = {
      ...ROUND,
      action: "ASK_SINGLE",
      status: "EVALUATING",
      questions: [{ ...ROUND.questions[0], microTest: undefined }],
      answers: { t1: "o2" },
    };
    const calls = serve({
      "/auth/journey": journey({ calibration: calibration(stalled) }),
      "/calibration/answers": journey({ calibration: calibration(null) }),
    });
    render(<CalibrationPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Completa la valutazione/ }),
    );
    await waitFor(() =>
      expect(
        calls.find((c) => c.url.endsWith("/calibration/answers"))?.body,
      ).toEqual({ roundId: ROUND.id, answers: { t1: "o2" } }),
    );
    expect(calls.some((c) => c.url.endsWith("/calibration/round"))).toBe(false);
  });

  it("lets the athlete finish a stalled micro-test from the Coach", async () => {
    const stalled = {
      ...ROUND,
      status: "EVALUATING",
      answers: { t1: "o1", t2: "o2" },
    };
    const calls = serve({
      "/auth/journey": journey({ calibration: calibration(stalled) }),
      "/calibration/answers": journey({ calibration: calibration(null) }),
    });
    render(<CoachPage />);
    expect(
      await screen.findByText("Le tue risposte sono salvate."),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Completa la valutazione" }),
    );
    await waitFor(() =>
      expect(
        calls.find((c) => c.url.endsWith("/calibration/answers"))?.body,
      ).toEqual({ roundId: ROUND.id, answers: { t1: "o1", t2: "o2" } }),
    );
  });
});
