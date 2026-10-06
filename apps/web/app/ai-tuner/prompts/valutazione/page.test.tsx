import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AssessmentPromptPage from "./page";

vi.mock("@/app/lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
}));
vi.mock("@/app/components/product-shell", () => ({
  ProductShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

const active = {
  id: "assessment-prompt-default",
  name: "valutazione assessment",
  basePrompt: "Stima la R provvisoria.",
  version: 1,
  isActive: true,
  updatedAt: "2026-10-06T22:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("assessment evaluation prompt", () => {
  it("saves edits of the prompt in use as a new inactive draft and tests it without saving", async () => {
    let prompts = [active];
    const posts: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method !== "POST") return new Response(JSON.stringify(prompts));
        const body = JSON.parse(String(init.body));
        posts.push({ url, body });
        if (url.endsWith("/test"))
          return new Response(
            JSON.stringify({
              provider: "stub",
              model: "deterministic-stub",
              latencyMs: 3,
              output: {
                summary: "Sintesi della prova.",
                overallConfidence: 30,
                drivers: [
                  {
                    areaId: "a",
                    name: "Tecnico-tattico",
                    score: 64,
                    confidence: 30,
                    rationale: "Motivazione di prova.",
                    evidenceGaps: [],
                  },
                ],
              },
            }),
          );
        const saved = { ...body, id: "draft-1", version: 1 };
        prompts = [active, saved];
        return new Response(JSON.stringify(saved));
      }),
    );
    render(<AssessmentPromptPage />);
    const textarea = await screen.findByDisplayValue("Stima la R provvisoria.");
    expect(screen.getByText("In uso")).toBeVisible();
    await userEvent.type(textarea, " Considera la frequenza.");
    await userEvent.click(screen.getByRole("button", { name: "Salva bozza" }));
    const save = posts.find((p) => p.url.endsWith("/assessment-prompt"))!;
    expect(save.body).toMatchObject({
      basePrompt: "Stima la R provvisoria. Considera la frequenza.",
      isActive: false,
    });
    expect(save.body).not.toHaveProperty("id");
    expect(await screen.findByText("Bozza salvata.")).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Prova sull'ultima valutazione" }),
    );
    const result = await screen.findByRole("region", { name: "Risultato della prova" });
    expect(within(result).getByText("Tecnico-tattico")).toBeVisible();
    expect(within(result).getByText("Motivazione di prova.")).toBeVisible();
    expect(posts.filter((p) => p.url.endsWith("/assessment-prompt"))).toHaveLength(1);
  });
});
