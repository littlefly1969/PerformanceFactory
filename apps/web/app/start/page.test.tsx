import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
    vi
      .fn()
      .mockResolvedValue({
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
    await screen.findByRole("button", {
      name: "Continua con il mio assessment",
    });
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
    await userEvent.click(screen.getByRole("button", { name: "Risposta A" }));
    await userEvent.click(screen.getByRole("button", { name: "Indietro" }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(
      screen.getByRole("heading", { name: "Eleva la tua performance." }),
    ).toBeInTheDocument();
  });
});
