import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import Page from "./page";
vi.mock("../../components/product-shell", () => ({
  ProductShell: ({
    title,
    children,
    stats,
  }: {
    title: string;
    children: ReactNode;
    stats: { label: string; value: ReactNode }[];
  }) => (
    <main>
      <h1>{title}</h1>
      {stats.map((s) => (
        <section key={s.label} aria-label={s.label}>
          {s.value}
        </section>
      ))}
      {children}
    </main>
  ),
}));
vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows real totals, zero days, definitions and requests the chosen period", async () => {
  const fetchMock = vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          generatedAt: "2026-11-05T10:00:00Z",
          totals: { started: 12, pending: 5, completed: 9 },
          daily: [
            { day: "2026-11-05", started: 12, pending: 5, completed: 9 },
            { day: "2026-11-04", started: 0, pending: 0, completed: 0 },
          ],
        }),
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<Page />);
  await waitFor(() =>
    expect(
      within(
        screen.getByRole("region", { name: "Avviate nel periodo" }),
      ).getByText("12"),
    ).toBeInTheDocument(),
  );
  expect(
    within(
      screen.getByRole("region", { name: "Avviate e non completate" }),
    ).getByText("5"),
  ).toBeInTheDocument();
  expect(screen.getByText(/non indicano chi è online/)).toBeInTheDocument();
  expect(screen.getByRole("table")).toHaveTextContent("4 nov 2026");
  await userEvent.selectOptions(screen.getByLabelText("Periodo"), "7");
  await waitFor(() =>
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/analytics/registrations?days=7",
      expect.anything(),
    ),
  );
});
