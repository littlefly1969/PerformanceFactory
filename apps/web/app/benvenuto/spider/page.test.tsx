import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WelcomeSpiderPage from "./page";
import { shortArea } from "./performance-preview";

vi.mock("@/app/lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
}));

const drivers = ["Tecnica", "Tattica", "Fisico", "Mentale", "Recupero", "Stile"].map(
  (name, i) => ({ id: `a${i}`, name, score: 50 }),
);

const serve = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("benvenuto 03 · la tua performance", () => {
  it("mostra la stima del funnel come reale, le sei aree scritte e porta al regalo", async () => {
    serve({ estimated: true, scale: { min: 0, max: 100 }, drivers });
    const { container } = render(<WelcomeSpiderPage />);
    expect(
      await screen.findByRole("heading", {
        name: "Qui troverai la tua performance.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("03 · La tua performance")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "Tecnica 50",
    );
    expect(container.querySelector(".pf-wk-perf-real")).toBeTruthy();
    // Le sei aree scritte intorno all'esagono.
    expect(container.querySelectorAll(".pf-wk-perf-label")).toHaveLength(6);
    // Il potenziale non esiste prima dell'assessment: solo in legenda.
    expect(screen.getByText("Potenziale · dopo l’assessment")).toBeTruthy();
    expect(screen.getByText("Reale")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Continua" }).getAttribute("href"),
    ).toBe("/benvenuto/regalo");
  });

  it("accorcia i nomi lunghi delle aree", () => {
    expect(shortArea("Preparazione atletica")).toBe("Preparazione");
    expect(shortArea("Tecnico-tattico")).toBe("Tecnico-tattico");
  });

  it("mostra l'errore dell'API", async () => {
    serve({ message: "Seleziona prima uno sport" }, 400);
    render(<WelcomeSpiderPage />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Seleziona prima uno sport",
    );
  });
});
