import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { QuestionsPreparing } from "./questions-preparing";

afterEach(cleanup);

it("asks the AI for the questions once, on its own", () => {
  const onPrepare = vi.fn();
  const { rerender } = render(
    <QuestionsPreparing busy failed={false} onPrepare={onPrepare} />,
  );
  rerender(
    <QuestionsPreparing busy={false} failed={false} onPrepare={onPrepare} />,
  );
  expect(onPrepare).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Prepariamo le tue domande…")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Riprova" })).toBeNull();
});

it("offers a retry when the AI did not answer, with no fallback questions", async () => {
  const onPrepare = vi.fn();
  render(<QuestionsPreparing busy={false} failed onPrepare={onPrepare} />);
  expect(screen.getByText("Le tue domande non sono pronte.")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
  expect(onPrepare).toHaveBeenCalledTimes(2);
});
