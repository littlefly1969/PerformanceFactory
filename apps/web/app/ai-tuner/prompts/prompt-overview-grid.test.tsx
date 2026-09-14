import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PromptOverviewGrid } from "./prompt-overview-grid";

describe("PromptOverviewGrid", () => {
  it("shows every prompt category and opens the selected one", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(
      <PromptOverviewGrid
        getOverview={(mode) => ({
          title: `Titolo ${mode}`,
          description: `Descrizione ${mode}`,
          where: `Flusso ${mode}`,
          version: "v2",
          updatedAt: "15/09/2026",
        })}
        onOpen={onOpen}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(4);
    await user.click(
      screen.getByRole("button", { name: /Titolo training/i }),
    );

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith("training");
  });
});
