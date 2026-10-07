import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import CalibrationPromptPage from "./page";

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

it("lists only calibration prompts and tests a draft on the synthetic case", async () => {
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
              id: "calibration-prompt-default",
              name: "domande di calibrazione",
              basePrompt: "Scrivi domande sui driver incerti.",
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
            questions: [
              {
                id: "q1",
                areaId: "a",
                name: "Fisico",
                text: "Quanto resisti in un terzo set?",
                options: [
                  { value: "0", label: "Poco", score: 30 },
                  { value: "1", label: "Bene", score: 70 },
                  { value: "2", label: "Benissimo", score: 90 },
                ],
              },
            ],
          },
        }),
      );
    }),
  );
  render(<CalibrationPromptPage />);
  await screen.findByDisplayValue("Scrivi domande sui driver incerti.");
  expect(
    screen.getByRole("heading", { name: "Domande di calibrazione" }),
  ).toBeVisible();
  expect(gets.some((u) => u.includes("kind=CALIBRATION"))).toBe(true);
  expect(gets.some((u) => u.endsWith("/test-cases"))).toBe(false);
  expect(screen.queryByLabelText("Caso di prova")).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Prova la bozza" }));
  const result = await screen.findByRole("region", {
    name: "Risultato della prova",
  });
  expect(
    within(result).getByText(/Quanto resisti in un terzo set/),
  ).toBeVisible();
  expect(within(result).getByText("Bene · score 70")).toBeVisible();
  expect(posts[0].body).toMatchObject({ kind: "CALIBRATION" });
});
