import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect, vi } from "vitest";
import Page from "./page";
vi.mock("../../components/product-shell", () => ({
  ProductShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
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
it("edits event branches using labels and persists typed option IDs", async () => {
  const templates = [
    {
      id: "event",
      key: "event",
      scope: "DISCOVERY",
      label: "Hai un evento?",
      orderIndex: 10,
      required: true,
      isActive: true,
      inputType: "SELECT",
      optionsJson: {
        type: "single_choice",
        options: [
          { id: "tournament", label: "Torneo", value: "Torneo" },
          { id: "none", label: "Nessuno", value: "Nessuno" },
        ],
      },
    },
    {
      id: "date",
      key: "date",
      scope: "DISCOVERY",
      label: "Quando sarà?",
      orderIndex: 20,
      required: false,
      isActive: true,
      inputType: "TEXT",
      optionsJson: { type: "date", contextKey: "general_event_date" },
    },
  ];
  let saved: Record<string, unknown> | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        saved = JSON.parse(String(init.body));
        return new Response(JSON.stringify(saved));
      }
      return new Response(JSON.stringify({ onboardingTemplates: templates }));
    }),
  );
  render(<Page />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Modifica Quando sarà?" }),
  );
  await userEvent.selectOptions(screen.getByLabelText("Visibilità"), "all");
  await userEvent.click(screen.getByLabelText("Torneo"));
  await userEvent.click(
    screen.getByRole("button", { name: "Salva domanda e percorso" }),
  );
  await waitFor(() =>
    expect(saved).toMatchObject({
      optionsJson: {
        contextKey: "general_event_date",
        visibleWhen: {
          match: "all",
          rules: [
            { question: "event", operator: "in", values: ["tournament"] },
          ],
        },
      },
    }),
  );
  expect(
    await screen.findByText("Domanda e percorso salvati."),
  ).toBeInTheDocument();
});
