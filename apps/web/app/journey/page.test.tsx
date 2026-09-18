import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import JourneyPage from "./page";
import { DRAFT_KEY } from "../start/discovery-state";
vi.mock("../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
}));
const document = {
  type: "PRIVACY",
  title: "Privacy",
  summary: "Sintesi",
  body: ["Testo vigente"],
  version: "1",
  documentHash: "hash",
};
const base = {
  phase: "ASSESSMENT",
  nextStep: "ASSESSMENT",
  currentQuestion: 0,
  count: 1,
  estimatedMinutes: 1,
  driverList: [],
  answers: {},
  questions: [
    {
      id: "configured-question",
      title: "Domanda configurata",
      areaName: "Tecnica",
      options: [{ value: "yes", label: "Risposta configurata" }],
    },
  ],
  durationOptions: [
    { weeks: 12, label: "12 settimane", description: "Un ciclo completo" },
  ],
  programDurationWeeks: null,
  result: {
    snapshotId: "real-snapshot",
    current: 37,
    potential: 52,
    gap: 15,
    drivers: [
      { id: "a", name: "Tecnica", current: 37, potential: 52, gap: 15 },
    ],
    priority: { id: "a", name: "Tecnica", current: 37, potential: 52, gap: 15 },
  },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/journey");
});
describe("PF4 authenticated journey functions", () => {
  it("renders server questions, submits, displays server result and saves duration", async () => {
    let state = { ...base };
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        requests.push({ url, body });
        if (url.endsWith("/answer")) state = { ...state, currentQuestion: 1 };
        if (url.endsWith("/submit")) state = { ...state, phase: "RESULT" };
        if (url.endsWith("/duration"))
          state = { ...state, phase: body.weeks ? "COMPLETE" : "DURATION" };
        return new Response(JSON.stringify(state));
      }),
    );
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ currentStep: "forged", answers: { bad: true } }),
    );
    render(<JourneyPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Risposta configurata" }),
    );
    expect(requests.find((r) => r.url.endsWith("/answer"))?.body).toEqual({
      questionId: "configured-question",
      value: "yes",
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Scopri la tua performance" }),
    );
    expect((await screen.findAllByText("37")).length).toBeGreaterThan(0);
    await userEvent.click(
      screen.getByRole("button", { name: /Quanto tempo ti dai/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Conferma la durata" }),
    );
    expect(
      requests.filter((r) => r.url.endsWith("/duration")).at(-1)?.body,
    ).toEqual({ weeks: 12 });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Durata salvata",
    );
  });
  it("resumes the backend duration stage directly, without an anonymous draft", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ...base, phase: "DURATION" })),
      ),
    );
    render(<JourneyPage />);
    expect(
      await screen.findByRole("heading", { name: "Quanto tempo ti dai?" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Domanda configurata")).not.toBeInTheDocument();
  });
  it("keeps Google discovery through redirect until explicit current consents and successful registration", async () => {
    window.history.replaceState(null, "", "/journey?google=complete");
    const draft = {
      version: 9,
      currentStep: "registration",
      answers: { weight: 75 },
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    let completed: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/pending"))
          return new Response(JSON.stringify({ email: "google@example.test" }));
        if (url.endsWith("/documents"))
          return new Response(JSON.stringify([document]));
        if (url.endsWith("/complete")) {
          completed = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ status: "ACTIVE" }));
        }
        return new Response(JSON.stringify(base));
      }),
    );
    render(<JourneyPage />);
    expect(
      await screen.findByRole("button", { name: "Accetta e continua" }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(
      screen.getByRole("button", { name: "Accetta e continua" }),
    );
    await waitFor(() => expect(completed?.discovery).toEqual(draft));
    expect(completed?.acceptedDocuments).toEqual([
      { type: "PRIVACY", version: "1", documentHash: "hash" },
    ]);
    expect(await screen.findByText("Domanda configurata")).toBeInTheDocument();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
