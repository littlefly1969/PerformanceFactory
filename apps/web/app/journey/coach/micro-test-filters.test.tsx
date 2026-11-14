import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CoachPage from "./page";
import {
  ROUND,
  calibration,
  homeMicro,
  journey,
  serve,
} from "../_account/account-fixtures";
import { Timer } from "./micro-test-practical";

vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/journey");
});

const PLANK = {
  ...ROUND,
  id: "33333333-3333-4333-8333-333333333333",
  questions: [
    {
      id: "t1",
      areaId: "d1",
      text: "Plank: 45 secondi",
      multiple: false,
      options: [
        { value: "o1", label: "Non ci sono riuscito" },
        { value: "o2", label: "Mi sono fermato prima" },
        { value: "o3", label: "Fatto, ma alla fine tremavo" },
        { value: "o4", label: "Facile, avevo ancora energia" },
      ],
      microTest: {
        title: "Plank: 45 secondi",
        instructions: "Una tenuta in plank.",
        durationMinutes: 2,
        safetyNotes: "",
        format: "PRACTICAL",
        setting: "OFF_COURT",
        steps: [
          "Avambracci a terra, gomiti sotto le spalle.",
          "Corpo dritto dalla testa ai talloni.",
          "Tieni senza far scendere il bacino.",
        ],
        timerSeconds: 45,
        question: "Com’è andata?",
      },
    },
  ],
};

const ready = (filter: string, round: { id: string }, title: string) => ({
  filter,
  status: "READY",
  usedToday: 1,
  limit: 2,
  test: {
    roundId: round.id,
    filter,
    title,
    area: { id: "d0", name: "Preparazione atletica" },
    durationMinutes: 2,
    format: filter === "THEORY" ? "SITUATIONAL" : "PRACTICAL",
    points: 10,
    round,
  },
});
const empty = (filter: string, status: string, usedToday = 0) => ({
  filter,
  status,
  usedToday,
  limit: 2,
  test: null,
});

const withFilters = (filters: unknown[]) =>
  homeMicro(ROUND, "READY", { filters });

describe("Micro-test per filtro", () => {
  it("switches between theory and practice, on and off the court", async () => {
    const calls = serve({
      "/auth/journey": journey({ calibration: calibration(null) }),
      "/athlete-journey/micro-test": withFilters([
        ready("THEORY", ROUND, "Il terzo colpo decide il punto."),
        empty("ON_COURT", "DONE_TODAY", 2),
        ready("OFF_COURT", PLANK, "Plank: 45 secondi"),
      ]),
    });
    render(<CoachPage />);
    expect(
      await screen.findByRole("radio", { name: "Teorici" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("heading", { name: "Il terzo colpo decide il punto." }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Sul campo/ })).toBeNull();

    await userEvent.click(screen.getByRole("radio", { name: "Pratici" }));
    // Sul campo i micro-test di oggi sono finiti: niente AI, si torna domani.
    expect(await screen.findByText("Per oggi hai finito.")).toBeInTheDocument();
    expect(screen.getByText(/i 2 micro-test pratici sul campo/)).toBeVisible();

    await userEvent.click(
      screen.getByRole("radio", { name: /Fuori dal campo/ }),
    );
    expect(
      screen.getByRole("heading", { name: "Plank: 45 secondi" }),
    ).toBeInTheDocument();
    expect(calls.filter((c) => c.body && "filter" in c.body)).toHaveLength(0);
  });

  it("asks the AI for the chosen filter only when that filter has no test yet", async () => {
    let prepared = false;
    const calls = serve({
      "/auth/journey": journey({ calibration: calibration(null) }),
      "/athlete-journey/micro-test": () =>
        withFilters([
          ready("THEORY", ROUND, "Il terzo colpo decide il punto."),
          prepared
            ? ready("ON_COURT", PLANK, "Volée al muro")
            : empty("ON_COURT", "PREPARING"),
          empty("OFF_COURT", "PREPARING"),
        ]),
    });
    render(<CoachPage />);
    await screen.findByRole("radio", { name: "Teorici" });
    expect(calls.some((c) => "filter" in (c.body ?? {}))).toBe(false);
    prepared = true;
    await userEvent.click(screen.getByRole("radio", { name: "Pratici" }));
    await waitFor(() =>
      expect(
        calls
          .filter((c) => c.url.endsWith("/athlete-journey/micro-test"))
          .map((c) => c.body)
          .filter((b) => "filter" in b),
      ).toEqual([{ filter: "ON_COURT" }]),
    );
    expect(
      await screen.findByRole("heading", { name: "Volée al muro" }),
    ).toBeInTheDocument();
  });

  it("guides the practical test with steps, timer and outcome tiles", async () => {
    const calls = serve({
      "/auth/journey": journey({ calibration: calibration(null) }),
      "/athlete-journey/micro-test": withFilters([
        empty("THEORY", "DONE_TODAY", 2),
        empty("ON_COURT", "DONE_TODAY", 2),
        ready("OFF_COURT", PLANK, "Plank: 45 secondi"),
      ]),
      "/calibration/answers": {},
      "/calibration/micro-test/": {
        status: "EVALUATED",
        format: "PRACTICAL",
        title: "Plank: 45 secondi",
        area: { id: "d1", name: "Preparazione atletica" },
        confidence: { before: 54, after: 62 },
        answer: "Fatto, ma alla fine tremavo",
        verdict: "Bene così.",
        takeaway: "Il core tiene stabile il colpo.",
        points: 10,
      },
    });
    render(<CoachPage />);
    await userEvent.click(
      await screen.findByRole("radio", { name: "Pratici" }),
    );
    await userEvent.click(
      screen.getByRole("radio", { name: /Fuori dal campo/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Inizia il micro-test/ }),
    );
    expect(
      screen.getByText("Pratico · Fuori dal campo · 2 min"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Avvia il timer")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: /Salva il risultato/ });
    expect(save).toBeDisabled();
    await userEvent.click(
      screen.getByRole("radio", { name: "Fatto, ma alla fine tremavo" }),
    );
    await userEvent.click(save);
    expect(
      calls.find((c) => c.url.endsWith("/calibration/answers"))?.body,
    ).toEqual({ roundId: PLANK.id, answers: { t1: "o3" } });
    expect(
      await screen.findByText("Micro-test pratico completato"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Hai risposto «fatto, ma alla fine tremavo»/),
    ).toBeInTheDocument();
    expect(screen.getByText("54% → 62%")).toBeInTheDocument();
  });

  it("goes back to the filters with Esci", async () => {
    serve({
      "/auth/journey": journey({ calibration: calibration(null) }),
      "/athlete-journey/micro-test": withFilters([
        ready("THEORY", ROUND, "Il terzo colpo decide il punto."),
        empty("ON_COURT", "DONE_TODAY", 2),
        ready("OFF_COURT", PLANK, "Plank: 45 secondi"),
      ]),
    });
    render(<CoachPage />);
    await userEvent.click(
      await screen.findByRole("radio", { name: "Pratici" }),
    );
    await userEvent.click(
      screen.getByRole("radio", { name: /Fuori dal campo/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Inizia il micro-test/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Esci" }));
    expect(
      screen.getByRole("radio", { name: /Fuori dal campo/ }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

describe("Timer della prova pratica", () => {
  it("counts down, pauses, says time is up and starts over", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    render(<Timer seconds={45} />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("0:45");
    act(() => button.click());
    expect(button).toHaveTextContent("In corso…");
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(button).toHaveTextContent("0:35");
    act(() => button.click());
    expect(button).toHaveTextContent("In pausa");
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(button).toHaveTextContent("0:35");
    act(() => button.click());
    await act(async () => vi.advanceTimersByTime(36_000));
    expect(button).toHaveTextContent("Tempo!");
    expect(button).toHaveTextContent("0:00");
    act(() => button.click());
    expect(button).toHaveTextContent("Avvia il timer");
    expect(button).toHaveTextContent("0:45");
  });
});
