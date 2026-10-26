import { vi } from "vitest";

/** Dati e fetch finti condivisi dai test dell'area atleta. */
export const drivers = [
  "Tecnico-tattico",
  "Preparazione atletica",
  "Mental",
].map((name, i) => ({
  id: `d${i}`,
  name,
  score: [86, 78, 84][i],
  confidence: 30,
  rationale: "Ci sei quasi.",
  evidenceGaps: [],
}));
export const evaluation = {
  id: "e1",
  status: "PROVISIONAL",
  source: "SELF_ASSESSMENT",
  summary: "s",
  overallConfidence: 30,
  scale: { min: 0, max: 100 },
  createdAt: "2026-10-20T10:00:00.000Z",
  drivers,
};
export const situation = (index: number) => ({
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
export const calibration = (round: unknown, status = "FREE_CALIBRATING") => ({
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
export const ROUND = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "ADAPTIVE",
  action: "PROPOSE_MICRO_TEST",
  status: "OPEN",
  answers: {},
  questions: [situation(0), situation(1)],
};
export const journey = (extra: Record<string, unknown> = {}) => ({
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
export const lesson = {
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
export function serve(routes: Record<string, unknown>) {
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
