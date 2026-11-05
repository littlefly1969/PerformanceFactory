import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Page from "./page";
import { secureFetch } from "@/app/lib/api";

vi.mock("@/app/lib/api", () => ({ API_BASE: "/api", secureFetch: vi.fn() }));
vi.mock("@/app/components/product-shell", () => ({
  ProductShell: ({
    children,
    stats,
  }: {
    children: React.ReactNode;
    stats: Array<{ label: string; value: React.ReactNode }>;
  }) => (
    <main>
      {stats.map((s) => (
        <output key={s.label} aria-label={s.label}>
          {s.value}
        </output>
      ))}
      {children}
    </main>
  ),
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
}));
const response = (value: unknown) => new Response(JSON.stringify(value));
const snapshot = (userId: string, rankingGlobal: number) => ({
  id: userId,
  userId,
  rankingGlobal,
  createdAt: "2026-11-05T09:00:00Z",
  areas: [],
});
beforeEach(() => {
  vi.mocked(secureFetch).mockReset();
});
afterEach(cleanup);

it("ignores a late profile response after the coach has selected another athlete", async () => {
  let resolveSecond: ((value: Response) => void) | undefined;
  vi.mocked(secureFetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/relationships/my-users"))
      return response([
        { id: "u1", email: "uno@esempio.test" },
        { id: "u2", email: "due@esempio.test" },
      ]);
    if (url.endsWith("/professional/approvals"))
      return response({ planItems: [], questionApprovals: [] });
    if (url.includes("userId=u2"))
      return new Promise((resolve) => {
        resolveSecond = resolve;
      });
    return response(snapshot("u1", 11));
  });
  render(<Page />);
  await waitFor(() =>
    expect(screen.getByLabelText("Ranking corrente")).toHaveTextContent("11"),
  );
  await userEvent.click(screen.getByRole("button", { name: "Seleziona" }));
  await waitFor(() => expect(resolveSecond).toBeDefined());
  await userEvent.click(screen.getByRole("button", { name: "Seleziona" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Ranking corrente")).toHaveTextContent("11"),
  );
  await act(async () => {
    resolveSecond!(response(snapshot("u2", 99)));
  });
  expect(screen.getByLabelText("Ranking corrente")).toHaveTextContent("11");
});

it("shows a recoverable error instead of leaving a failed network load pending", async () => {
  vi.mocked(secureFetch).mockRejectedValue(new Error("offline"));
  render(<Page />);
  expect(
    await screen.findByText("Impossibile aggiornare il riepilogo. Riprova."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("status", { name: "Atleti collegati" }),
  ).toHaveTextContent("0");
});
