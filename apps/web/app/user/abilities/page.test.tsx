import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import AbilitiesPage from "./page";
vi.mock("next/navigation", () => ({ usePathname: () => "/user/abilities" }));
vi.mock("../../lib/api", () => ({ API_BASE: "/api", secureFetch: (path: string, init?: RequestInit) => fetch(path, init) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const ready = { id: "technique", name: "Tecnica", status: "READY", plan: { id: "plan", version: 1, items: [{ id: "item", title: "Controllo della volée", body: "Tre serie di dieci palle.", status: "ACTIVE" }], checkInId: "check" } };
it("exposes every ability, published exercises and the matching check-in", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ abilities: [ready, { id: "mental", name: "Mentale", status: "PREPARING", plan: null }] })));
  render(<AbilitiesPage />);
  await screen.findByText("Controllo della volée");
  expect(screen.getByRole("link", { name: "Abilità" })).toHaveAttribute("aria-current", "page");
  await userEvent.click(screen.getByText("Controllo della volée"));
  expect(screen.getByText("Tre serie di dieci palle.")).toBeVisible();
  expect(screen.getByRole("link", { name: /Vai al check-in/ })).toHaveAttribute("href", "/user/questions?areaId=technique");
  expect(within(screen.getByRole("region", { name: "Mentale" })).getByText(/Stiamo preparando/)).toBeVisible();
});
it("requests only missing plans and explains failures without exposing internal codes", async () => {
  let posted = false;
  const fetcher = vi.fn(async (_path: string, init?: RequestInit) => {
    if (init?.method === "POST") posted = true;
    return Response.json({ abilities: [ready, { id: "mental", name: "Mentale", status: posted ? "PREPARING" : "ERROR", errorCode: "PROFESSIONAL_UNAVAILABLE", retryScheduled: true, plan: null }] });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<AbilitiesPage />);
  await screen.findByText(/Serve un professionista/);
  expect(screen.queryByText("PROFESSIONAL_UNAVAILABLE")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Prepara i piani mancanti" }));
  await screen.findByText(/Stiamo preparando/);
  await waitFor(() => expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1));
  expect(screen.getByText("Controllo della volée")).toBeVisible();
});
