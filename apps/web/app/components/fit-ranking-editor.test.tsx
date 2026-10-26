import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FitRankingEditor, type FitRankingView } from "./fit-ranking-editor";

const view: FitRankingView = {
  ranking: {
    padelCurrent: "3",
    padelBest: "2",
    tennisCurrent: "NONE",
    tennisBest: "NONE",
    cardNumber: null,
  },
  options: {
    PADEL: [
      { value: "1", label: "1ª fascia" },
      { value: "2", label: "2ª fascia" },
      { value: "3", label: "3ª fascia" },
      { value: "NONE", label: "Nessuna classifica" },
    ],
    TENNIS: [
      { value: "4.NC", label: "4.NC" },
      { value: "NONE", label: "Nessuna classifica" },
    ],
  },
  recalculationPending: false,
};

function serve(saved: FitRankingView) {
  const posts: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify(saved));
      }
      return new Response(JSON.stringify(view));
    }),
  );
  return posts;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FIT ranking editor", () => {
  it("shows the declared ranking in one line and opens the form on request", async () => {
    serve(view);
    render(<FitRankingEditor />);
    expect(await screen.findByText("3ª fascia")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Modifica" }));
    const padel = within(screen.getAllByText("Padel").at(-1)!.closest(".pf-fit-row")!);
    const best = padel.getByLabelText("Migliore");
    expect(
      within(best)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["—", "1ª fascia", "2ª fascia", "3ª fascia"]);
    // L'attuale sale sopra la migliore: la migliore la segue.
    await userEvent.selectOptions(padel.getByLabelText("Attuale"), "1");
    expect(best).toHaveValue("1");
  });

  it("saves a correction and says when R could not be recalculated", async () => {
    const posts = serve({ ...view, recalculationPending: true });
    const onSaved = vi.fn();
    render(<FitRankingEditor onSaved={onSaved} />);
    await userEvent.click(await screen.findByRole("button", { name: "Modifica" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Aggiungi il numero di tessera" }),
    );
    await userEvent.type(
      screen.getByLabelText("Numero di tessera FIT (facoltativo)"),
      "AB12",
    );
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(
      await screen.findByText(/non siamo riusciti a ricalcolare la tua R/),
    ).toBeInTheDocument();
    expect(posts).toEqual([
      {
        padelCurrent: "3",
        padelBest: "2",
        tennisCurrent: "NONE",
        tennisBest: "NONE",
        cardNumber: "AB12",
      },
    ]);
    expect(onSaved).toHaveBeenCalled();
  });

  it("declares no ranking at all in one tap", async () => {
    const posts = serve(view);
    render(<FitRankingEditor />);
    await userEvent.click(await screen.findByRole("button", { name: "Modifica" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Non ho classifiche" }),
    );
    expect(posts).toEqual([
      {
        padelCurrent: "NONE",
        padelBest: "NONE",
        tennisCurrent: "NONE",
        tennisBest: "NONE",
        cardNumber: "",
      },
    ]);
  });
});
