import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WelcomeSpiderPage from "./page";

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

describe("benvenuto 02 · primo Spider", () => {
  it("disegna lo Spider stimato tratteggiato e porta al regalo", async () => {
    serve({ estimated: true, scale: { min: 0, max: 100 }, drivers });
    const { container } = render(<WelcomeSpiderPage />);
    expect(await screen.findByText("Profilo stimato")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "Spider stimato: Tecnica 50",
    );
    expect(container.querySelector(".pf-spider-shape.is-estimated")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Continua" }).getAttribute("href"),
    ).toBe("/benvenuto/regalo");
  });

  it("con una valutazione già fatta lo Spider è pieno", async () => {
    serve({ estimated: false, scale: { min: 0, max: 100 }, drivers });
    const { container } = render(<WelcomeSpiderPage />);
    expect(await screen.findByRole("img")).toBeTruthy();
    expect(screen.queryByText("Profilo stimato")).toBeNull();
    expect(container.querySelector(".pf-spider-shape.is-estimated")).toBeNull();
  });

  it("mostra l'errore dell'API", async () => {
    serve({ message: "Seleziona prima uno sport" }, 400);
    render(<WelcomeSpiderPage />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Seleziona prima uno sport",
    );
  });
});
