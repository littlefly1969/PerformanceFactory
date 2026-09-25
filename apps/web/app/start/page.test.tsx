import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import StartPage from "./page";
import { DRAFT_KEY } from "./discovery-state";
import { DISCOVERY_ANALYSIS_MIN_DURATION_MS } from "./analysis-transition";
import type { DiscoveryConfiguration } from "./discovery-types";

const config: DiscoveryConfiguration = {
  version: 9,
  questions: [
    {
      id: "backend-first",
      code: "arbitrary-first",
      title: "Domanda scelta dal backend",
      type: "single_choice",
      required: true,
      order: 1,
      options: [{ id: "option-a", value: "a", label: "Risposta A" }],
    },
    {
      id: "backend-second",
      code: "arbitrary-second",
      title: "Altra domanda configurata",
      type: "boolean",
      required: true,
      order: 2,
      options: [
        { id: "yes", value: true, label: "Sì" },
        { id: "no", value: false, label: "No" },
      ],
    },
  ],
};
function mockConfig(configuration = config) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(configuration),
    }),
  );
}
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("PF4 configured journey", () => {
  it("advances by configuration, saves answers, and restores the exact visual step after remount", async () => {
    // L'analisi dura almeno 4 secondi: il clock finto evita di attenderli davvero.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockConfig();
    const first = render(<StartPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Inizia il percorso →" }),
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemax",
      "2",
    );
    await userEvent.click(screen.getByRole("button", { name: "Risposta A" }));
    await screen.findByRole("heading", { name: "Altra domanda configurata" });
    await waitFor(() =>
      expect(
        JSON.parse(window.sessionStorage.getItem(DRAFT_KEY)!).currentStep,
      ).toBe("backend-second"),
    );
    first.unmount();
    render(<StartPage />);
    await screen.findByRole("heading", { name: "Altra domanda configurata" });
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    await screen.findByRole("heading", {
      name: "Analizziamo le tue risposte…",
    });
    await act(() =>
      vi.advanceTimersByTimeAsync(DISCOVERY_ANALYSIS_MIN_DURATION_MS),
    );
    expect(
      JSON.parse(window.sessionStorage.getItem(DRAFT_KEY)!).answers,
    ).toEqual({ "backend-first": "option-a", "backend-second": false });
    await userEvent.click(
      screen.getByRole("button", { name: "Attiva la prova gratuita" }),
    );
    expect(
      screen.getByRole("heading", { name: "Crea il tuo account." }),
    ).toBeInTheDocument();
  });
  it("derives progress and initial question from changed configuration", async () => {
    mockConfig({ version: 10, questions: [config.questions[1]] });
    render(<StartPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Inizia il percorso →" }),
    );
    expect(
      screen.getByRole("heading", { name: "Altra domanda configurata" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemax",
      "1",
    );
  });
  it("cancels pending auto-advance when the athlete goes back", async () => {
    mockConfig();
    render(<StartPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Inizia il percorso →" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Risposta A" }));
    fireEvent.click(screen.getByRole("button", { name: "Indietro" }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(
      screen.getByRole("heading", { name: "Eleva la tua performance." }),
    ).toBeInTheDocument();
  });
});

it("skips a conditional date, revisits the parent, and restores only the newly selected branch", async () => {
  const event = {
    ...config.questions[0],
    id: "event",
    code: "event",
    title: "Hai un evento?",
    options: [
      { id: "yes", label: "Torneo", value: "Torneo" },
      { id: "no", label: "Nessuno", value: "Nessuno" },
    ],
  };
  const date = {
    ...config.questions[1],
    id: "date",
    code: "date",
    title: "Quando sarà?",
    type: "date" as const,
    visibleWhen: {
      match: "all" as const,
      rules: [{ question: "event", operator: "in" as const, values: ["yes"] }],
    },
  };
  mockConfig({ version: 9, questions: [event, date, config.questions[1]] });
  render(<StartPage />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Inizia il percorso →" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Torneo" }));
  await screen.findByRole("heading", { name: "Quando sarà?" });
  fireEvent.change(screen.getByLabelText("Quando sarà?"), {
    target: { value: "2026-12-01" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Continua" }));
  await userEvent.click(screen.getByRole("button", { name: "Indietro" }));
  await userEvent.click(screen.getByRole("button", { name: "Indietro" }));
  await userEvent.click(screen.getByRole("button", { name: "Nessuno" }));
  await screen.findByRole("heading", { name: "Altra domanda configurata" });
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "2");
  expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).answers).toEqual({
    event: "no",
  });
  await userEvent.click(screen.getByRole("button", { name: "Indietro" }));
  expect(
    screen.getByRole("heading", { name: "Hai un evento?" }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Torneo" }));
  expect(await screen.findByLabelText("Quando sarà?")).toHaveValue("");
});

it("allows skipping an optional choice without opening its conditional branch", async () => {
  const optional = { ...config.questions[0], required: false };
  const child = {
    ...config.questions[1],
    visibleWhen: {
      match: "all" as const,
      rules: [
        {
          question: optional.code,
          operator: "not_in" as const,
          values: ["option-a"],
        },
      ],
    },
  };
  mockConfig({ version: 9, questions: [optional, child] });
  render(<StartPage />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Inizia il percorso →" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Continua" }));
  expect(
    screen.getByRole("heading", { name: "Analizziamo le tue risposte…" }),
  ).toBeInTheDocument();
  expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).answers).toEqual({});
});

describe("PF5 pre-account experience", () => {
  const pf5: DiscoveryConfiguration = {
    version: 11,
    sportContext: {
      mode: "fixed",
      sport: { id: "padel", key: "padel", label: "Padel" },
      specialization: { id: "standard", key: "standard", label: "Standard" },
    },
    questions: [
      {
        id: "goal",
        code: "goal",
        title: "Qual è il tuo obiettivo principale?",
        type: "single_choice",
        required: true,
        order: 1,
        target: "goalId",
        options: [
          { id: "endurance", label: "Aumentare la resistenza", value: "e" },
        ],
      },
      {
        id: "experience",
        code: "experience",
        title: "Esperienza",
        type: "single_choice",
        required: true,
        order: 2,
        options: [{ id: "mid", label: "1-3 anni", value: "mid" }],
      },
      {
        id: "height",
        code: "height",
        title: "Quanto sei alto?",
        type: "number",
        required: true,
        order: 3,
        contextKey: "general_height_cm",
        min: 120,
        max: 230,
        step: 1,
        options: [],
      },
      {
        id: "weight",
        code: "weight",
        title: "Quanto pesi?",
        type: "number",
        required: true,
        order: 4,
        contextKey: "general_weight_kg",
        min: 30,
        max: 250,
        step: 0.5,
        options: [],
      },
    ],
  };
  function start(currentStep: string) {
    mockConfig(pf5);
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: pf5.version,
        currentStep,
        goalId: "endurance",
        answers: { experience: "mid", height: 180, weight: 90 },
      }),
    );
    render(<StartPage />);
  }

  it("keeps the analysis on screen for at least 4 seconds, through three phases", async () => {
    vi.useFakeTimers();
    start("processing");
    await act(() => vi.advanceTimersByTimeAsync(0));
    const phase = () => screen.getByRole("heading", { level: 1 });
    expect(phase()).toHaveTextContent("Analizziamo le tue risposte…");
    await act(() => vi.advanceTimersByTimeAsync(1300));
    expect(phase()).toHaveTextContent("Organizziamo il tuo profilo…");
    await act(() => vi.advanceTimersByTimeAsync(1300));
    expect(phase()).toHaveTextContent("Prepariamo il tuo punto di partenza…");
    await act(() =>
      vi.advanceTimersByTimeAsync(DISCOVERY_ANALYSIS_MIN_DURATION_MS - 2601),
    );
    expect(
      screen.queryByRole("button", { name: "Attiva la prova gratuita" }),
    ).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(
      screen.getByRole("button", { name: "Attiva la prova gratuita" }),
    ).toBeInTheDocument();
  });

  it("separates the free trial offer from the athlete constraints", async () => {
    start("result");
    const offer = await screen.findByRole("complementary", { name: "Offerta" });
    expect(within(offer).getByText("Premio sbloccato")).toBeInTheDocument();
    expect(within(offer).getByText("7 giorni gratis")).toBeInTheDocument();
    expect(offer).toHaveTextContent(
      "Assessment, programma e analisi dei sei driver.",
    );
    expect(offer).toHaveTextContent("Tutto sbloccato da subito.");
    expect(within(offer).getByText("Nessuna carta")).toBeInTheDocument();
    expect(within(offer).getByText("Disdici quando vuoi")).toBeInTheDocument();
    // L'offerta e marketing: non riporta le risposte dell'atleta.
    expect(offer).not.toHaveTextContent("Aumentare la resistenza");
    expect(offer).not.toHaveTextContent("Padel");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Questi sono i tuoi vincoli.",
    );
    expect(
      screen.getByText(/Ora serve la misura: crea l’account/),
    ).toBeInTheDocument();
    // 90 kg / 1,80 m²: BMI derivato dalle misure dichiarate.
    expect(screen.getByText("27.8")).toBeInTheDocument();
    expect(screen.getByText("Sovrappeso")).toBeInTheDocument();
    const row = (term: string) =>
      screen.getByText(term, { selector: "dt" }).nextElementSibling;
    expect(row("Obiettivo")).toHaveTextContent("Aumentare la resistenza");
    expect(row("Sport")).toHaveTextContent("Padel · Standard");
    expect(row("Esperienza")).toHaveTextContent("1-3 anni");
    // Altezza e peso sono gia rappresentati dal BMI.
    expect(screen.queryByText("Quanto pesi?")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Attiva la prova gratuita" }),
    );
    expect(
      screen.getByRole("heading", { name: "Crea il tuo account." }),
    ).toBeInTheDocument();
  });

  it("omits the BMI when height or weight are not part of the path", async () => {
    mockConfig({ ...pf5, questions: pf5.questions.slice(0, 2) });
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: pf5.version,
        currentStep: "result",
        goalId: "endurance",
        answers: { experience: "mid" },
      }),
    );
    render(<StartPage />);
    await screen.findByRole("button", { name: "Attiva la prova gratuita" });
    expect(
      screen.queryByText("Indice di massa corporea"),
    ).not.toBeInTheDocument();
  });
});
