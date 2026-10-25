import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscoveryQuestionRenderer } from "./question-renderer";
import type { DiscoveryQuestion } from "./discovery-types";
const question: DiscoveryQuestion = {
  id: "q",
  code: "custom",
  title: "Una domanda configurata",
  type: "single_choice",
  required: true,
  order: 1,
  options: [
    { id: "a", label: "Prima opzione", value: "a" },
    { id: "b", label: "Seconda opzione", value: "b" },
  ],
};

describe("PF4 configured controls", () => {
  it("renders backend labels and accessible selected state", async () => {
    const onChange = vi.fn();
    render(
      <DiscoveryQuestionRenderer
        question={question}
        options={question.options}
        value="a"
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Prima opzione" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(
      screen.getByRole("button", { name: "Seconda opzione" }),
    );
    expect(onChange).toHaveBeenCalledWith("b");
  });
  it("toggles a multi-choice selection without losing other selections", async () => {
    const onChange = vi.fn();
    render(
      <DiscoveryQuestionRenderer
        question={{ ...question, type: "multi_choice" }}
        options={question.options}
        value={["a"]}
        onChange={onChange}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Seconda opzione" }),
    );
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
    await userEvent.click(
      screen.getByRole("button", { name: "Prima opzione" }),
    );
    expect(onChange).toHaveBeenCalledWith([]);
  });
  it("keeps an exclusive option alone in a multi-choice selection", async () => {
    const options = [
      { id: "none", label: "Nessuna", value: "none", exclusive: true },
      ...question.options,
    ];
    const multi = { ...question, type: "multi_choice" as const, options };
    const onChange = vi.fn();
    const { rerender } = render(
      <DiscoveryQuestionRenderer
        question={multi}
        options={options}
        value={["a", "b"]}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Nessuna" }));
    expect(onChange).toHaveBeenLastCalledWith(["none"]);
    rerender(
      <DiscoveryQuestionRenderer
        question={multi}
        options={options}
        value={["none"]}
        onChange={onChange}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Prima opzione" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(["a"]);
  });
  it("uses the configured boolean labels and boolean values", async () => {
    const onChange = vi.fn();
    render(
      <DiscoveryQuestionRenderer
        question={{ ...question, type: "boolean" }}
        options={[{ id: "no", label: "Non ancora", value: false }]}
        value={undefined}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Non ancora" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });
  it.each(["number", "scale"] as const)(
    "renders numeric %s bounds without defaulting an unanswered field",
    (type) => {
      render(
        <DiscoveryQuestionRenderer
          question={{ ...question, type, min: 0, max: 10, step: 0.5 }}
          options={[]}
          value={undefined}
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByRole("spinbutton")).toHaveAttribute("min", "0");
      expect(screen.getByRole("spinbutton")).toHaveValue(null);
    },
  );
  it("steps a number within its bounds, starting from the minimum", async () => {
    const onChange = vi.fn();
    const numeric = {
      ...question,
      type: "number" as const,
      min: 0,
      max: 1,
      step: 0.5,
    };
    const { rerender } = render(
      <DiscoveryQuestionRenderer
        question={numeric}
        options={[]}
        value={undefined}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Aumenta" }));
    expect(onChange).toHaveBeenLastCalledWith(0);
    rerender(
      <DiscoveryQuestionRenderer
        question={numeric}
        options={[]}
        value={0.5}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Aumenta" }));
    expect(onChange).toHaveBeenLastCalledWith(1);
    await userEvent.click(screen.getByRole("button", { name: "Diminuisci" }));
    expect(onChange).toHaveBeenLastCalledWith(0);
    rerender(
      <DiscoveryQuestionRenderer
        question={numeric}
        options={[]}
        value={1}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Aumenta" })).toBeDisabled();
  });
});

afterEach(cleanup);
