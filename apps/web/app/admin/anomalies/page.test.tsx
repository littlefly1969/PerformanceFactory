import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import Page from "./page";

vi.mock("@/app/components/product-shell", () => ({
  ProductShell: ({
    title,
    children,
  }: {
    title: string;
    children: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("@/app/lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
}));

const anomaly = (status: string) => ({
  id: "a1",
  athlete: { email: "atleta@example.test", name: "Ada Rossi" },
  evaluation: { sequence: 2, source: "CALIBRATION_ROUND" },
  kind: "CONTRADICTIONS",
  priority: "HIGH",
  evidence: "Dichiara 5 partite a settimana, poi di non giocare da mesi.",
  status,
  reviewNote: status === "OPEN" ? null : "Verificato.",
  reviewedBy: status === "OPEN" ? null : "admin@example.test",
  reviewedAt: status === "OPEN" ? null : "2026-10-08T09:00:00.000Z",
  createdAt: "2026-10-08T08:00:00.000Z",
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("AT-11: shows the evidence to the admin and records the review", async () => {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  let current = anomaly("OPEN");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      if (method === "PATCH") current = anomaly("REVIEWED");
      return new Response(JSON.stringify(method === "PATCH" ? {} : [current]));
    }),
  );
  render(<Page />);
  const card = await screen.findByRole("article", {
    name: "atleta@example.test",
  });
  expect(within(card).getByText("Risposte contraddittorie")).toBeVisible();
  expect(within(card).getByText(/non giocare da mesi/)).toBeVisible();
  expect(within(card).getByText(/Aperta · priorità alta/)).toBeVisible();
  await userEvent.type(
    within(card).getByLabelText("Nota di revisione"),
    "Verificato.",
  );
  await userEvent.click(
    within(card).getByRole("button", { name: "Segna come esaminata" }),
  );
  expect(calls.find((c) => c.method === "PATCH")).toEqual({
    method: "PATCH",
    url: "/api/admin/assessment-anomalies/a1",
    body: { status: "REVIEWED", note: "Verificato." },
  });
  expect(
    await screen.findByText(/Esaminata da admin@example.test/),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Riapri" })).toBeVisible();
});
