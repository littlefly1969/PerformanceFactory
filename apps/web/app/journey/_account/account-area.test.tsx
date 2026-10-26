import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "../profilo/page";
import CoachPage from "../coach/page";
import ClubPage from "../circolo/page";
import ScenariosPage from "../scenari/page";
vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
}));

const drivers = ["Tecnico-tattico", "Preparazione atletica", "Mental"].map(
  (name, i) => ({
    id: `d${i}`,
    name,
    score: [86, 78, 84][i],
    confidence: 30,
    rationale: "Ci sei quasi.",
    evidenceGaps: [],
  }),
);
const evaluation = {
  id: "e1",
  status: "PROVISIONAL",
  source: "SELF_ASSESSMENT",
  summary: "s",
  overallConfidence: 30,
  scale: { min: 0, max: 100 },
  createdAt: "2026-10-20T10:00:00.000Z",
  drivers,
};
const situation = (index: number) => ({
  id: `t${index + 1}`,
  areaId: "d0",
  text: `Situazione ${index + 1}: cosa fai?`,
  multiple: false,
  options: [
    { value: "o1", label: "Colpisco forte" },
    { value: "o2", label: "Alzo lungo" },
  ],
  microTest: {
    instructions: "Rispondi come faresti in campo.",
    durationMinutes: 2,
    safetyNotes: "",
    title: "Il terzo colpo decide il punto.",
    format: "SITUATIONAL",
    situation: { index, total: 2, label: "Uscita dal fondo", context: "" },
  },
});
const calibration = (round: unknown, status = "FREE_CALIBRATING") => ({
  status,
  day: 9,
  consolidationRule: {
    version: 1,
    minOverallConfidence: 70,
    minAreaConfidence: 60,
    minAreasAtConfidence: 4,
  },
  completionReason: null,
  roundsCompleted: 2,
  nextRoundKind: "ADAPTIVE",
  round,
});
const ROUND = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "ADAPTIVE",
  action: "PROPOSE_MICRO_TEST",
  status: "OPEN",
  answers: {},
  questions: [situation(0), situation(1)],
};
const journey = (extra: Record<string, unknown> = {}) => ({
  phase: "EVALUATION",
  nextStep: "x",
  firstName: "Stefano",
  welcomeCompleted: true,
  currentQuestion: 12,
  count: 12,
  estimatedMinutes: 5,
  driverList: [],
  answers: {},
  questions: [],
  result: null,
  durationOptions: [],
  programDurationWeeks: null,
  evaluation,
  calibration: calibration(ROUND),
  scenarios: null,
  ...extra,
});
const lesson = {
  enabled: true,
  phase: "ELIGIBLE",
  missing: [],
  credits: { balance: 100, toUnlock: 100 },
  clubs: [
    { id: "c1", name: "Padel Club Nord", city: "Milano" },
    { id: "c2", name: "Circolo Navigli", city: "Milano" },
  ],
  slots: [
    {
      id: "l1",
      partnerId: "c1",
      startsAt: "2026-10-27T18:00:00",
      durationMinutes: 60,
      seatsLeft: 2,
    },
  ],
  attributedClubId: "c1",
  seat: null,
};

type Call = { url: string; body: Record<string, unknown> };
function serve(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      const key = Object.keys(routes).find((k) => url.includes(k));
      const value = key ? routes[key] : {};
      return new Response(
        JSON.stringify(typeof value === "function" ? value(url) : value),
      );
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/journey");
});

describe("Profilo dell'atleta", () => {
  it("shows the global R with its range and the unlocked free lesson", async () => {
    serve({
      "/auth/journey": journey(),
      "/athlete-journey/profile": {
        firstName: "Stefano",
        sport: "Padel",
        experience: "1-3 anni",
        global: {
          value: 83,
          low: 70,
          high: 96,
          confidence: 30,
          provisional: true,
        },
      },
      "/athlete-journey/free-lesson": lesson,
      "/fit-ranking": {
        ranking: null,
        options: { PADEL: [], TENNIS: [] },
        recalculationPending: false,
      },
    });
    render(<ProfilePage />);
    expect(await screen.findByText("Tra 70 e 96")).toBeInTheDocument();
    expect(screen.getByText(/83/)).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Scegli il circolo/ }),
    ).toHaveAttribute("href", "/journey/circolo");
    expect(screen.getByRole("link", { name: /Calibrazione/ })).toHaveAttribute(
      "href",
      "/journey/calibrazione",
    );
    expect(
      screen.getByRole("img", { name: /Il tuo Spider provvisorio/ }),
    ).toBeInTheDocument();
  });
});

describe("Micro-test nel Coach", () => {
  it("reveals the coach's explanation after each situation and sends the answers", async () => {
    // Con le risposte il round si chiude: il percorso non lo propone più.
    let answered = false;
    const current = () =>
      answered ? journey({ calibration: calibration(null) }) : journey();
    const calls = serve({
      "/auth/journey": current,
      "/calibration/situation": {
        value: "o1",
        correct: false,
        correctValue: "o2",
        feedback: { o1: "Regali la rete.", o2: "Il vetro è un alleato." },
      },
      "/calibration/answers": () => {
        answered = true;
        return current();
      },
      "/calibration/micro-test/": {
        status: "EVALUATED",
        format: "SITUATIONAL",
        title: "Il terzo colpo",
        area: { id: "d0", name: "Tecnico-tattico" },
        confidence: { before: 22, after: 40 },
        correct: 1,
        total: 2,
        summary: "Ci sei quasi.",
        video: { title: "L'uscita dal vetro spiegata dal coach", url: null },
      },
    });
    render(<CoachPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Inizia il micro-test" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Colpisco forte/ }),
    );
    expect(await screen.findByText("Regali la rete.")).toBeInTheDocument();
    expect(screen.getByText("Il vetro è un alleato.")).toBeInTheDocument();
    expect(
      calls.find((c) => c.url.endsWith("/calibration/situation"))?.body,
    ).toEqual({ roundId: ROUND.id, questionId: "t1", value: "o1" });
    await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
    await userEvent.click(
      await screen.findByRole("button", { name: /Colpisco forte/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Vedi il risultato" }),
    );
    await waitFor(() =>
      expect(
        calls.find((c) => c.url.endsWith("/calibration/answers"))?.body,
      ).toEqual({ roundId: ROUND.id, answers: { t1: "o1", t2: "o1" } }),
    );
    // Senza video nell'archivio, il riquadro mostra il titolo previsto.
    expect(
      (await screen.findAllByText("L'uscita dal vetro spiegata dal coach"))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Video in arrivo")).toBeInTheDocument();
    expect(screen.getByText("22% → 40%")).toBeInTheDocument();
  });
});

describe("Scelta del circolo", () => {
  it("requests the seat with the preferred lesson only after consent", async () => {
    const calls = serve({
      "/auth/journey": journey(),
      "/free-lesson/request": { ...lesson, phase: "REQUESTED" },
      "/athlete-journey/free-lesson": lesson,
    });
    render(<ClubPage />);
    const request = await screen.findByRole("button", {
      name: /Richiedi il posto/,
    });
    expect(request).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: /27/ }));
    await userEvent.click(await screen.findByRole("radio", { name: "18:00" }));
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(request);
    await waitFor(() =>
      expect(
        calls.find((c) => c.url.endsWith("/free-lesson/request"))?.body,
      ).toEqual({ partnerId: "c1", shareWithCoach: true, lessonId: "l1" }),
    );
  });
});

describe("Scenari", () => {
  it("keeps P3, P6 and P12 hidden until the calibration is closed", async () => {
    serve({ "/auth/journey": journey() });
    render(<ScenariosPage />);
    expect(
      await screen.findByText(/si mostrano quando la calibrazione è chiusa/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/P3 ·/)).toBeNull();
  });

  it("shows the horizons once the calibration is closed", async () => {
    const horizons = [3, 6, 12].map((months, k) => ({
      horizon: `PROGRAM_${months}M`,
      months,
      drivers: drivers.map((d) => ({
        ...d,
        current: d.score,
        potential: d.score + 3 + k,
      })),
      gap: {
        overall: { current: 83, potential: 86 + k * 2, gap: 3 },
        technicalTactical: null,
      },
    }));
    serve({
      "/auth/journey": journey({
        calibration: calibration(null, "PAYWALL_READY"),
        scenarios: {
          status: "READY",
          engine: { key: "p", version: "1", provisional: true },
          scale: { min: 0, max: 100 },
          selectedHorizon: null,
          horizons,
        },
      }),
    });
    render(<ScenariosPage />);
    expect(await screen.findByText("P3 · 86")).toBeInTheDocument();
    expect(screen.getByText("P12 · 90")).toBeInTheDocument();
  });
});
