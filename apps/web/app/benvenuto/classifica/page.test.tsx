import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import WelcomeRankingPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/app/lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
}));

const OPTIONS = {
  PADEL: [
    { value: "1", label: "1ª fascia" },
    { value: "2", label: "2ª fascia" },
    { value: "3", label: "3ª fascia" },
    { value: "4", label: "4ª fascia" },
    { value: "NA", label: "Fascia non agonistica" },
    { value: "NONE", label: "Nessuna classifica" },
  ],
  TENNIS: [
    { value: "1", label: "1ª categoria" },
    { value: "2.1", label: "2.1" },
    { value: "2.2", label: "2.2" },
    { value: "3.1", label: "3.1" },
    { value: "4.1", label: "4.1" },
    { value: "4.NC", label: "4.NC" },
    { value: "NONE", label: "Nessuna classifica" },
  ],
};

function serve(ranking: unknown = null) {
  const posts: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "POST")
        return new Response(
          JSON.stringify({ ranking, options: OPTIONS, recalculationPending: false }),
        );
      const body = JSON.parse(String(init.body));
      posts.push(body);
      return new Response(
        JSON.stringify({ ranking: body, options: OPTIONS, recalculationPending: false }),
      );
    }),
  );
  return posts;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
});

describe("benvenuto 02 · classifica FIT", () => {
  it("si può rimandare senza salvare nulla", async () => {
    const posts = serve();
    render(<WelcomeRankingPage />);
    expect(
      screen.getByRole("heading", { name: "Che classifica hai?" }),
    ).toBeTruthy();
    await userEvent.click(
      await screen.findByRole("button", { name: "Lo farò dopo" }),
    );
    expect(push).toHaveBeenCalledWith("/benvenuto/spider");
    expect(posts).toEqual([]);
  });

  it("salva padel e tennis scelti a schede, con la migliore non sotto l'attuale", async () => {
    const posts = serve();
    render(<WelcomeRankingPage />);
    await userEvent.click(await screen.findByRole("button", { name: /3ª\s*fascia/ }));
    // Migliore di sempre: la 4ª fascia è sotto l'attuale e non si può scegliere.
    const best = screen.getByRole("group", { name: "Migliore di sempre" });
    const fourth = Array.from(best.querySelectorAll("button")).find((b) =>
      b.textContent?.startsWith("4ª"),
    )!;
    expect(fourth).toBeDisabled();
    const second = Array.from(best.querySelectorAll("button")).find((b) =>
      b.textContent?.startsWith("2ª"),
    )!;
    await userEvent.click(second);
    // Senza tennis non si salva: si apre la scheda e si spiega cosa manca.
    await userEvent.click(screen.getByRole("button", { name: "Continua" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Completa anche la classifica di tennis",
    );
    expect(screen.getByRole("tab", { name: "Tennis" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: /2ª\s*cat\./ }));
    await userEvent.click(screen.getByRole("button", { name: "2.2" }));
    const tennisBest = screen.getByRole("group", { name: "Migliore di sempre" });
    const sub = Array.from(tennisBest.querySelectorAll("button")).find(
      (b) => b.textContent === "—nessuna",
    )!;
    expect(sub).toBeDisabled();
    await userEvent.click(
      Array.from(tennisBest.querySelectorAll("button")).find((b) =>
        b.textContent?.startsWith("1ª"),
      )!,
    );
    await userEvent.type(screen.getByPlaceholderText("Es. 1234567"), "77");
    await userEvent.click(screen.getByRole("button", { name: "Continua" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/benvenuto/spider"));
    expect(posts).toEqual([
      {
        padelCurrent: "3",
        padelBest: "2",
        tennisCurrent: "2.2",
        tennisBest: "1",
        cardNumber: "77",
      },
    ]);
  });

  it("senza classifica oggi chiede comunque la migliore di sempre", async () => {
    const posts = serve();
    render(<WelcomeRankingPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Nessuna classifica" }),
    );
    const padelBest = screen.getByRole("group", { name: "Migliore di sempre" });
    await userEvent.click(
      Array.from(padelBest.querySelectorAll("button")).find(
        (b) => b.textContent === "Nessuna classifica",
      )!,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Tennis" }));
    await userEvent.click(screen.getByRole("button", { name: /—\s*nessuna/ }));
    const tennisBest = screen.getByRole("group", { name: "Migliore di sempre" });
    await userEvent.click(
      Array.from(tennisBest.querySelectorAll("button")).find(
        (b) => b.textContent === "—nessuna",
      )!,
    );
    await userEvent.click(screen.getByRole("button", { name: "Continua" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
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

  it("con l'attuale al vertice la migliore si compila da sola", async () => {
    serve();
    render(<WelcomeRankingPage />);
    await userEvent.click(await screen.findByRole("button", { name: /1ª\s*fascia/ }));
    const best = screen.getByRole("group", { name: "Migliore di sempre" });
    expect(
      Array.from(best.querySelectorAll("button")).find((b) =>
        b.textContent?.startsWith("1ª"),
      ),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("riparte dalla classifica già salvata", async () => {
    serve({
      padelCurrent: "2",
      padelBest: "1",
      tennisCurrent: "NONE",
      tennisBest: "NONE",
      cardNumber: null,
    });
    render(<WelcomeRankingPage />);
    expect(
      await screen.findByRole("button", { name: /2ª\s*fascia/, pressed: true }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continua" })).toBeTruthy();
  });
});
