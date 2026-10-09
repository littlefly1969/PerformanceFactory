import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import PotentialPromptPage from "./page";

vi.mock("@/app/lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
}));
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("lists only potential prompts and shows the scenarios tested on the synthetic case", async () => {
  const gets: string[] = [];
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method !== "POST") {
        gets.push(url);
        return new Response(
          JSON.stringify([
            {
              id: "potential-prompt-default",
              name: "scenari P3/P6/P12",
              basePrompt: "Stima il potenziale entro i limiti.",
              version: 1,
              isActive: true,
              updatedAt: "2026-10-08T22:00:00.000Z",
            },
          ]),
        );
      }
      posts.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(
        JSON.stringify({
          provider: "stub",
          model: "deterministic-stub",
          latencyMs: 2,
          output: {
            criteria: "potential-criteria@1",
            scenarios: [
              {
                areaId: "a",
                name: "Tecnico-tattico",
                current: 40,
                horizon: "PROGRAM_6M",
                value: 64,
                confidence: 60,
                rationale: "Margine ampio e impegno alto.",
              },
            ],
          },
        }),
      );
    }),
  );
  render(<PotentialPromptPage />);
  await screen.findByDisplayValue("Stima il potenziale entro i limiti.");
  expect(
    screen.getByRole("heading", { name: "Scenari P3/P6/P12" }),
  ).toBeVisible();
  expect(gets.some((u) => u.includes("kind=POTENTIAL"))).toBe(true);
  expect(screen.queryByLabelText("Caso di prova")).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Prova la bozza" }));
  const result = await screen.findByRole("region", {
    name: "Risultato della prova",
  });
  expect(within(result).getByText(/potential-criteria@1/)).toBeVisible();
  const row = within(result).getByRole("row", { name: /Tecnico-tattico/ });
  expect(row).toHaveTextContent("P6");
  expect(row).toHaveTextContent("40 → 64");
  expect(posts[0].body).toMatchObject({ kind: "POTENTIAL" });
});
