import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VideosPage from "./page";

vi.mock("../../components/product-shell", () => ({
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
  StatusBadge: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));

type Call = { url: string; method: string; body?: unknown };
function serve(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      const path = url.replace("/api", "");
      return new Response(JSON.stringify(routes[`${method} ${path}`] ?? {}));
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AREAS = [{ id: "a1", name: "Tecnico-tattico" }];
const VIDEO = {
  id: "v1",
  title: "L'uscita dal vetro",
  description: "Quando lasciar passare la palla.",
  url: null,
  isActive: true,
  area: AREAS[0],
};

describe("Archivio video", () => {
  it("adds a video for an area, without a file yet", async () => {
    const calls = serve({
      "GET /admin/coaching-videos": [],
      "GET /ai-tuning/areas": AREAS,
    });
    render(<VideosPage />);
    expect(await screen.findByText(/Nessun video/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Titolo"), "La vibora");
    await userEvent.selectOptions(screen.getByLabelText("Area"), "a1");
    await userEvent.click(
      screen.getByRole("button", { name: "Aggiungi all'archivio" }),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        title: "La vibora",
        description: "",
        url: null,
        areaId: "a1",
      }),
    );
  });

  it("switches a video off and edits it", async () => {
    const calls = serve({
      "GET /admin/coaching-videos": [VIDEO],
      "GET /ai-tuning/areas": AREAS,
    });
    render(<VideosPage />);
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "L'AI può proporlo" }),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
        isActive: false,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Modifica" }));
    expect(screen.getByLabelText("Titolo")).toHaveValue("L'uscita dal vetro");
    await userEvent.type(
      screen.getByLabelText("Link https (facoltativo)"),
      "https://video.example/vetro.mp4",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salva le modifiche" }),
    );
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "PATCH").at(-1)).toMatchObject({
        url: "/api/admin/coaching-videos/v1",
        body: { url: "https://video.example/vetro.mp4", areaId: "a1" },
      }),
    );
  });
});
