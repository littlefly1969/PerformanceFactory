import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import StartPage from "./page";
import { DRAFT_KEY } from "./discovery-state";
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
});

describe("PF4 configured journey", () => {
  it("advances by configuration, saves answers, and restores the exact visual step after remount", async () => {
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
    await screen.findByRole(
      "button",
      {
        name: "Continua con il mio assessment",
      },
      { timeout: 3000 },
    );
    expect(
      JSON.parse(window.sessionStorage.getItem(DRAFT_KEY)!).answers,
    ).toEqual({ "backend-first": "option-a", "backend-second": false });
    await userEvent.click(
      screen.getByRole("button", { name: "Continua con il mio assessment" }),
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
