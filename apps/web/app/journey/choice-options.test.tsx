import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MultiChoiceStep, toggleChoice } from "./choice-options";

const options = [
  { value: "0", label: "Nessuno", exclusive: true },
  { value: "1", label: "Gomito" },
  { value: "2", label: "Schiena" },
];

describe("AI multiple-choice questions", () => {
  afterEach(cleanup);

  it("keeps an exclusive option alone", () => {
    expect(toggleChoice(options, ["1"], "2")).toEqual(["1", "2"]);
    expect(toggleChoice(options, ["1", "2"], "0")).toEqual(["0"]);
    expect(toggleChoice(options, ["0"], "1")).toEqual(["1"]);
    expect(toggleChoice(options, ["1", "2"], "1")).toEqual(["2"]);
  });

  it("sends every chosen option once the athlete confirms", async () => {
    const onSubmit = vi.fn();
    render(
      <MultiChoiceStep
        options={options}
        initial={undefined}
        busy={false}
        onSubmit={onSubmit}
      />,
    );
    const confirm = screen.getByRole("button", { name: "Continua →" });
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Gomito" }));
    await userEvent.click(screen.getByRole("button", { name: "Schiena" }));
    expect(screen.getByRole("button", { name: "Schiena" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledWith(["1", "2"]);
  });
});
