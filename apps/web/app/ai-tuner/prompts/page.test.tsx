import { secureFetch } from "@/app/lib/api";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PromptManagementPage from "./page";

vi.mock("@/app/lib/api", () => ({ API_BASE: "/api", secureFetch: vi.fn() }));
vi.mock("@/app/components/product-shell", () => ({
  ProductShell: ({
    title,
    children,
    actions,
  }: {
    title: string;
    children: ReactNode;
    actions: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      {actions}
      {children}
    </main>
  ),
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
}));
const goal = {
  id: "goal",
  name: "Preparazione gara",
  basePrompt: "Istruzioni iniziali",
  version: 1,
  isActive: true,
};
const settings = {
  areas: [],
  sports: [],
  areaGenerationConfigs: [],
  goalPromptConfig: goal,
  goalPromptConfigs: [goal],
};

describe("prompt management flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(secureFetch).mockImplementation(async (_url, init) => {
      if (init?.method === "POST")
        return Response.json({
          ...JSON.parse(init.body as string),
          id: "new-draft",
        });
      return Response.json(settings);
    });
  });

  it("opens the active prompt, edits it and saves an inactive draft", async () => {
    const user = userEvent.setup();
    render(<PromptManagementPage />);
    await user.click(
      await screen.findByRole("button", { name: /Validazione obiettivo/ }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Preparazione gara/ }),
    );
    const editor = screen.getByRole("textbox", {
      name: "Prompt di validazione obiettivo",
    });
    await user.clear(editor);
    await user.type(editor, "Istruzioni aggiornate");
    await user.click(screen.getByRole("button", { name: /Salva bozza/i }));
    await waitFor(() =>
      expect(
        screen.getByText("Bozza salvata con successo."),
      ).toBeInTheDocument(),
    );
    const writes = vi
      .mocked(secureFetch)
      .mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1]!.body as string)).toMatchObject({
      basePrompt: "Istruzioni aggiornate",
      isActive: false,
    });
    expect(JSON.parse(writes[0][1]!.body as string)).not.toHaveProperty("id");
  });

  it("shows a readable message if settings cannot be loaded", async () => {
    vi.mocked(secureFetch).mockResolvedValue(
      Response.json({ message: "Accesso negato" }, { status: 403 }),
    );
    render(<PromptManagementPage />);
    expect(await screen.findByText(/Accesso negato/)).toBeInTheDocument();
  });
});
