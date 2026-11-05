import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import Page from "./page";
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
}));
vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const id = "11111111-1111-4111-8111-111111111111";
const row = {
  id,
  operation: "initial_questions",
  provider: "gemini",
  model: "test-model",
  status: "ERROR",
  errorCode: "INVALID_OUTPUT",
  validationFailures: 2,
  startedAt: "2026-11-05T09:00:00Z",
  finishedAt: "2026-11-05T09:00:02Z",
  durationMs: 2000,
  _count: { attempts: 2 },
};
it("uses server filters and pagination and opens the full failed operation despite HTTP 200", async () => {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url.endsWith(`/${id}`))
        return new Response(
          JSON.stringify({
            ...row,
            attempts: [
              {
                id: "attempt",
                sequence: 1,
                provider: "gemini",
                model: "test-model",
                status: "SUCCESS",
                httpStatus: 200,
                durationMs: 40,
                startedAt: row.startedAt,
              },
            ],
          }),
        );
      const params = new URL(url, "http://localhost").searchParams;
      return new Response(
        JSON.stringify({
          rows: [row],
          page: Number(params.get("page")),
          pageSize: 25,
          pages: 2,
          total: 26,
          counts: { ERROR: 26 },
          generatedAt: row.startedAt,
        }),
      );
    }),
  );
  render(<Page />);
  await screen.findByText("Domande iniziali", { selector: "strong" });
  await userEvent.click(screen.getByRole("button", { name: "Successiva" }));
  await screen.findByText("26 operazioni · pagina 2 di 2");
  await userEvent.selectOptions(screen.getByLabelText("Esito"), "ERROR");
  await waitFor(() => expect(urls.at(-1)).toContain("status=ERROR"));
  expect(urls.at(-1)).toContain("page=1");
  await userEvent.selectOptions(screen.getByLabelText("Provider"), "gemini");
  await waitFor(() => expect(urls.at(-1)).toContain("provider=gemini"));
  await userEvent.click(
    screen.getByRole("button", { name: `Apri operazione ${id}` }),
  );
  await screen.findByRole("heading", { name: "Tentativi HTTP (1)" });
  expect(screen.getByText("200")).toBeInTheDocument();
  expect(screen.getByText(/Risposta AI non conforme/)).toBeInTheDocument();
  expect(
    screen.getByText(/HTTP 200 indica il trasporto riuscito/),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Chiudi dettaglio" }),
  );
  expect(
    screen.queryByRole("heading", { name: "Dettaglio operazione" }),
  ).not.toBeInTheDocument();
});
it("makes an unavailable API explicit and allows retry", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response("{}", { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<Page />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Dati non disponibili",
  );
  await userEvent.click(screen.getByRole("button", { name: "Aggiorna" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});
