import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NumberChoiceStep,
  numericOptions,
  optionUnit,
} from "./number-choice";

afterEach(cleanup);

const days = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n} giorni` }));

describe("Risposta numerica del percorso", () => {
  it("recognises only single-choice questions whose options are numbers", () => {
    expect(numericOptions({ options: days })).toHaveLength(5);
    expect(numericOptions({ options: days, multiple: true })).toBeNull();
    expect(
      numericOptions({
        options: [
          { value: "A", label: "Mai" },
          { value: "B", label: "A volte" },
          { value: "C", label: "Spesso" },
        ],
      }),
    ).toBeNull();
    // Id seriali delle opzioni AI: «Mai / A volte / Sempre» resta una scelta.
    const serial = ["Mai", "A volte", "Sempre"].map((label, i) => ({
      value: String(i),
      label,
    }));
    expect(numericOptions({ options: serial })).toBeNull();
    // Le domande dei driver restano scelte anche con etichette numeriche.
    expect(numericOptions({ options: days, kind: "AREA" })).toBeNull();
    expect(numericOptions({ options: days, kind: "OPERATIONAL" })).toHaveLength(5);
    // Due sole opzioni restano un elenco: il quadrante non aggiunge nulla.
    expect(numericOptions({ options: days.slice(0, 2) })).toBeNull();
    expect(optionUnit("5 giorni")).toBe("giorni");
  });

  it("walks the options with plus and minus and answers the chosen one", async () => {
    const onSubmit = vi.fn();
    render(
      <NumberChoiceStep
        options={days}
        selected={undefined}
        busy={false}
        onSubmit={onSubmit}
      />,
    );
    // Senza risposta si parte dal valore centrale.
    expect(screen.getByRole("status")).toHaveTextContent("3 giorni");
    await userEvent.click(screen.getByRole("button", { name: "Aumenta" }));
    expect(screen.getByRole("status")).toHaveTextContent("4 giorni");
    await userEvent.click(screen.getByRole("button", { name: "Continua →" }));
    expect(onSubmit).toHaveBeenCalledWith(4);
  });

  it("stops at the ends of the list", async () => {
    render(
      <NumberChoiceStep
        options={days}
        selected={1}
        busy={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Diminuisci" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Aumenta" }));
    expect(screen.getByRole("status")).toHaveTextContent("2 giorni");
  });
});
