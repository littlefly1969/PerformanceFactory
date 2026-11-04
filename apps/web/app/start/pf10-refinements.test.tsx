import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import StartPage from "./page";
import { DRAFT_KEY } from "./discovery-state";
import { DiscoveryQuestionRenderer } from "./question-renderer";
import { PreliminaryResult } from "./preliminary-result";
import type {
  DiscoveryConfiguration,
  DiscoveryQuestion,
} from "./discovery-types";

const choice = (
  id: string,
  title: string,
  labels: string[],
  extra: Partial<DiscoveryQuestion> = {},
): DiscoveryQuestion => ({
  id,
  code: id,
  title,
  type: "single_choice",
  required: true,
  order: 1,
  options: labels.map((label, i) => ({ id: String(i), label, value: label })),
  ...extra,
});
const stepper = { ui: { presentation: "stepper" as const } };

// Domande come nella migrazione del funnel PF10.
const experience = choice(
  "pf4_experience",
  "Da quanto tempo pratichi?",
  ["Meno di un anno", "1-3 anni", "3-5 anni", "Più di 5 anni"],
  { ...stepper, ui: { ...stepper.ui, summaryLabel: "Esperienza" } },
);
const frequency = choice(
  "pf4_frequency",
  "Quante volte ti alleni a settimana?",
  ["1-2 volte", "3-4 volte", "5 o più volte"],
  { ...stepper, ui: { ...stepper.ui, summaryLabel: "Frequenza" } },
);

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

function Counter({
  question,
  value,
  onChange,
}: {
  question: DiscoveryQuestion;
  value?: string;
  onChange: (value: unknown) => void;
}) {
  return (
    <DiscoveryQuestionRenderer
      question={question}
      options={question.options}
      value={value}
      onChange={onChange}
    />
  );
}

describe("contatore della demo PF10", () => {
  it("parte da 3 anni, scende a «<1» e sale fino a «10+»", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Counter question={experience} onChange={onChange} />,
    );
    const shown = () => container.querySelector(".pf4-choice-counter span");
    const band = () => screen.getByRole("status");
    const minus = screen.getByRole("button", { name: "Diminuisci" });
    const plus = screen.getByRole("button", { name: "Aumenta" });
    // Non è il «03 / 08» dell'intestazione: quello stile lo allinea a destra.
    expect(container.querySelector(".pf4-counter")).toBeNull();
    // Il 3 iniziale è già una risposta: la fascia «1-3 anni».
    expect(shown()).toHaveTextContent(/^3$/);
    expect(band()).toHaveTextContent("1-3 anni");
    expect(onChange).toHaveBeenLastCalledWith("1");
    await userEvent.click(minus);
    await userEvent.click(minus);
    expect(shown()).toHaveTextContent(/^1$/);
    expect(band()).toHaveTextContent("1-3 anni");
    expect(minus).toBeEnabled();
    await userEvent.click(minus);
    expect(shown()).toHaveTextContent("<1");
    expect(band()).toHaveTextContent("Meno di un anno");
    expect(onChange).toHaveBeenLastCalledWith("0");
    expect(minus).toBeDisabled();
    for (let i = 0; i < 4; i++) await userEvent.click(plus);
    expect(shown()).toHaveTextContent(/^4$/);
    expect(band()).toHaveTextContent("4-5 anni");
    // Il valore salvato resta la fascia configurata «3-5 anni».
    expect(onChange).toHaveBeenLastCalledWith("2");
    await userEvent.click(plus);
    await userEvent.click(plus);
    expect(shown()).toHaveTextContent(/^6$/);
    expect(band()).toHaveTextContent("Più di 5 anni");
    expect(onChange).toHaveBeenLastCalledWith("3");
    for (let i = 0; i < 4; i++) await userEvent.click(plus);
    expect(shown()).toHaveTextContent(/^10$/);
    expect(plus).toBeEnabled();
    await userEvent.click(plus);
    expect(shown()).toHaveTextContent("10+");
    expect(band()).toHaveTextContent("Più di 5 anni");
    expect(plus).toBeDisabled();
    // Solo il numero nel pulsante, niente «4/4».
    expect(container).not.toHaveTextContent("/");
  });

  it("conta gli allenamenti da 1 a 7 partendo da 3", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Counter question={frequency} onChange={onChange} />,
    );
    const shown = () => container.querySelector(".pf4-choice-counter span");
    const band = () => screen.getByRole("status");
    const minus = screen.getByRole("button", { name: "Diminuisci" });
    const plus = screen.getByRole("button", { name: "Aumenta" });
    expect(shown()).toHaveTextContent(/^3$/);
    expect(band()).toHaveTextContent("3-4 volte");
    expect(onChange).toHaveBeenLastCalledWith("1");
    await userEvent.click(minus);
    expect(band()).toHaveTextContent("1-2 volte");
    await userEvent.click(minus);
    expect(shown()).toHaveTextContent(/^1$/);
    expect(minus).toBeDisabled();
    for (let i = 0; i < 4; i++) await userEvent.click(plus);
    expect(shown()).toHaveTextContent(/^5$/);
    expect(band()).toHaveTextContent("5 o più volte");
    await userEvent.click(plus);
    await userEvent.click(plus);
    expect(shown()).toHaveTextContent(/^7$/);
    expect(plus).toBeDisabled();
    expect(onChange).toHaveBeenLastCalledWith("2");
  });

  it("tornando indietro ritrova il numero scelto nella stessa fascia", async () => {
    const onChange = vi.fn();
    const { container, unmount } = render(
      <Counter question={experience} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Diminuisci" }));
    unmount();
    render(<Counter question={experience} value="1" onChange={onChange} />);
    expect(document.querySelector(".pf4-choice-counter span")).toHaveTextContent(
      /^2$/,
    );
    expect(container).toBeTruthy();
  });

  it("con le fasce riordinate da back office torna al selettore delle risposte", () => {
    const onChange = vi.fn();
    const [low, mid, high] = frequency.options;
    render(
      <Counter
        question={{ ...frequency, options: [high, low, mid] }}
        onChange={onChange}
      />,
    );
    // Nessun numero da interpretare: si sceglie l'opzione che si vede.
    expect(screen.getByText("Usa − e + per scegliere")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("con opzioni diverse dalle fasce torna al selettore delle risposte", () => {
    render(
      <Counter
        question={{
          ...frequency,
          options: frequency.options.slice(0, 2),
        }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Usa − e + per scegliere")).toBeInTheDocument();
  });
});

describe("riepilogo della demo PF10", () => {
  const configuration: DiscoveryConfiguration = {
    version: 4,
    sportContext: {
      mode: "fixed",
      sport: { id: "s", key: "PADEL", label: "Padel" },
      specialization: { id: "sp", key: "STD", label: "Standard" },
    },
    questions: [
      choice("pf4_age", "Quanti anni hai?", ["18-29", "30-39"], {
        ui: { summaryLabel: "Età" },
      }),
      experience,
      frequency,
      {
        ...choice("pf4_limitations", "Hai dolori?", ["Gomito", "Spalla"]),
        type: "multi_choice",
        ui: { summaryLabel: "Limitazioni" },
      },
      choice("pf4_goal", "Obiettivo?", ["Migliorare la tecnica"], {
        target: "goalId",
      }),
      choice("pf4_event", "Evento?", ["Un torneo", "Nessuno"], {
        ui: { summaryLabel: "Evento" },
      }),
      {
        ...choice("pf4_event_date", "Quando?", []),
        type: "date",
        ui: { summaryLabel: "Data evento" },
      },
      {
        ...choice("pf4_weight", "Peso", []),
        type: "number",
        contextKey: "general_weight_kg",
      },
      {
        ...choice("pf4_height", "Altezza", []),
        type: "number",
        contextKey: "general_height_cm",
      },
    ],
  };

  it("mostra obiettivo, le due coppie e l'indice di massa corporea", () => {
    const { container } = render(
      <PreliminaryResult
        config={configuration}
        draft={{
          version: 4,
          currentStep: "result",
          goalId: "0",
          answers: {
            pf4_age: "1",
            pf4_experience: "2",
            pf4_frequency: "1",
            pf4_limitations: ["0", "1"],
            pf4_event: "0",
            pf4_event_date: "2026-12-12",
            pf4_weight: 72,
            pf4_height: 175,
          },
        }}
        onContinue={vi.fn()}
      />,
    );
    const titles = [...container.querySelectorAll(".pf4-tile dt")].map(
      (dt) => dt.firstChild?.textContent,
    );
    expect(titles).toEqual([
      "Obiettivo",
      "Esperienza",
      "Frequenza",
      "Limitazioni",
      "Evento",
      "Indice di massa corporea",
    ]);
    const row = (term: string) =>
      screen.getByText(term, { selector: "dt" }).nextElementSibling;
    // Stessa etichetta del contatore, non quella della fascia salvata.
    expect(row("Esperienza")).toHaveTextContent("4-5 anni");
    expect(row("Limitazioni")).toHaveTextContent("Gomito, Spalla");
    expect(row("Evento")).toHaveTextContent("Un torneo · 12 dic 2026");
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass(
      "pf4-one-line",
    );
    expect(
      screen.getByRole("complementary", { name: "Come si parte" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".pf4-note")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Crea il tuo account" }),
    ).toBeInTheDocument();
  });
});

describe("obiettivi a risposta multipla", () => {
  it("nel riepilogo mostra «Obiettivi» con tutte le scelte", () => {
    const goal = {
      ...choice("pf4_goal", "Quali sono i tuoi obiettivi?", [
        "Migliorare la tecnica",
        "Aumentare la resistenza",
      ]),
      type: "multi_choice" as const,
      target: "goalId" as const,
    };
    render(
      <PreliminaryResult
        config={{ version: 1, questions: [goal] }}
        draft={{
          version: 1,
          currentStep: "result",
          goalId: ["0", "1"],
          answers: {},
        }}
        onContinue={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Obiettivi", { selector: "dt" }).nextElementSibling,
    ).toHaveTextContent("Migliorare la tecnica, Aumentare la resistenza");
  });
});

describe("prima domanda del funnel", () => {
  it("ricorda i termini e porta all'accesso", async () => {
    const age = choice("pf4_age", "Quanti anni hai?", ["18-29", "30-39"]);
    const next = choice("pf4_motivation", "Perché giochi?", ["Per vincere"]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: 2, questions: [age, next] }),
      }),
    );
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ version: 2, currentStep: "pf4_age", answers: {} }),
    );
    render(<StartPage />);
    await screen.findByRole("heading", { name: "Quanti anni hai?" });
    expect(
      screen.getByText(
        "Continuando accetti i Termini di servizio e la Politica sulla privacy.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Accedi" })).toHaveAttribute(
      "href",
      "/login",
    );
    await userEvent.click(screen.getByRole("button", { name: /18/ }));
    expect(
      await screen.findByRole("heading", { name: "Perché giochi?" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Continuando accetti/)).not.toBeInTheDocument();
  });
});
