import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardNumberStep } from "./card-number-step";

afterEach(cleanup);

describe("FIT card number step", () => {
  it("can be skipped, and sends the trimmed number when given", async () => {
    const onSubmit = vi.fn();
    render(<CardNumberStep initial="" busy={false} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Salta →" }));
    expect(onSubmit).toHaveBeenLastCalledWith("");
    await userEvent.type(screen.getByRole("textbox"), " 123/AB ");
    await userEvent.click(screen.getByRole("button", { name: "Continua →" }));
    expect(onSubmit).toHaveBeenLastCalledWith("123/AB");
  });
});
