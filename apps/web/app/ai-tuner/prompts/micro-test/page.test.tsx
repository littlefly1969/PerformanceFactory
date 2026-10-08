import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import MicroTestPromptPage from "./page";

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

it("lists only micro-test prompts and tests a draft on the synthetic case", async () => {
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
              id: "micro-test-prompt-default",
              name: "micro-test su misura",
              basePrompt: "Scrivi micro-test sui driver incerti.",
              version: 1,
              isActive: true,
              updatedAt: "2026-10-06T22:00:00.000Z",
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
            tests: [
              {
                areaId: "a",
                name: "Fisico",
                title: "Scatti a muro",
                instructions:
                  "Dieci scambi contro il muro: quanti senza errori?",
                options: [
                  { value: "o1", label: "0-3", score: 30 },
                  { value: "o2", label: "4-7", score: 60 },
                  { value: "o3", label: "8-10", score: 90 },
                ],
              },
            ],
          },
        }),
      );
    }),
  );
  render(<MicroTestPromptPage />);
  await screen.findByDisplayValue("Scrivi micro-test sui driver incerti.");
  expect(
    screen.getByRole("heading", { name: "Micro-test su misura" }),
  ).toBeVisible();
  expect(gets.some((u) => u.includes("kind=MICRO_TEST"))).toBe(true);
  expect(gets.some((u) => u.endsWith("/test-cases"))).toBe(false);
  expect(screen.queryByLabelText("Caso di prova")).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Prova la bozza" }));
  const result = await screen.findByRole("region", {
    name: "Risultato della prova",
  });
  expect(within(result).getByText(/Fisico · Scatti a muro/)).toBeVisible();
  expect(within(result).getByText("4-7 · score 60")).toBeVisible();
  expect(posts[0].body).toMatchObject({ kind: "MICRO_TEST" });
});
