import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DiagnosticControl } from "./diagnostic-control";
import { DiagnosticDetail } from "./diagnostic-detail";
import type { DiagnosticOperation } from "./log-model";
vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("lets an administrator enable complete logging and clearly displays its scope and audit", async () => {
  let enabled = false;
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PATCH")
      enabled = (JSON.parse(String(init.body)) as { enabled: boolean }).enabled;
    return new Response(
      JSON.stringify({
        enabled,
        changes: [
          {
            id: "change",
            enabled: true,
            actorId: "admin-1",
            createdAt: "2026-11-06T00:00:00Z",
          },
        ],
        writer: { pendingWrites: 0, pendingCaptures: 0, lastFailureAt: null },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<DiagnosticControl />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Abilita log completi" }),
    ).toBeEnabled(),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Abilita log completi" }),
  );
  await screen.findByText("ATTIVA");
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/admin/ai-logs/configuration",
    expect.objectContaining({ method: "PATCH", body: '{"enabled":true}' }),
  );
  expect(
    screen.getByText(/rimossi soltanto chiavi API e credenziali/),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByText("Stato scritture e ultime modifiche"));
  expect(screen.getByText("admin-1")).toBeInTheDocument();
});
const operation: DiagnosticOperation = {
  id: "call-id",
  operation: "training_proposal",
  provider: "openai",
  model: "gpt-test",
  status: "ERROR",
  errorCode: "INVALID_AI_OUTPUT",
  startedAt: "2026-11-06T00:00:00Z",
  finishedAt: "2026-11-06T00:00:02Z",
  durationMs: 2000,
  validationFailures: 1,
  validationCodes: [],
  _count: { attempts: 1 },
  diagnosticsEnabled: true,
  contextId: "process-id",
  invocationInput: '{"name":"Mario"}',
  invocationOutput: null,
  attempts: [
    {
      id: "attempt-1",
      sequence: 1,
      provider: "openai",
      model: "gpt-test",
      status: "SUCCESS",
      httpStatus: 200,
      durationMs: 100,
      startedAt: "2026-11-06T00:00:00Z",
      captureState: "CAPTURED",
      request: {
        url: "https://ai.test",
        method: "POST",
        headers: {},
        body: '{"prompt":"Mario, fastidio ginocchio"}',
        timeoutMs: 90000,
        maxAttempts: 3,
        httpAttempt: 1,
      },
      response: { body: '{"broken": [}', status: 200 },
    },
  ],
  events: [
    {
      id: "event-1",
      sequence: 1,
      attemptSequence: 1,
      phase: "VALIDATION",
      detail: {
        message: "durata oltre la disponibilità",
        path: "$.planItems[0].durationMinutes",
        received: 120,
        expected: 60,
      },
      createdAt: "2026-11-06T00:00:02Z",
    },
  ],
};
it("shows full original malformed responses beside requests and precise validation errors", async () => {
  render(<DiagnosticDetail data={operation} />);
  expect(screen.getByText("process-id")).toBeInTheDocument();
  const request = screen.getByRole("region", {
    name: "Corpo richiesta originale",
  });
  expect(request).toHaveTextContent("Mario, fastidio ginocchio");
  const response = screen.getByRole("region", {
    name: "Corpo risposta originale",
  });
  expect(
    within(response).getByLabelText("Contenuto Corpo risposta originale")
      .textContent,
  ).toBe('{"broken": [}');
  await userEvent.click(
    screen.getByRole("button", { name: "Errori e controlli (1)" }),
  );
  expect(
    screen.getByText(/\$\.planItems\[0\]\.durationMinutes/),
  ).toBeInTheDocument();
  expect(screen.getByText(/durata oltre la disponibilità/)).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Input applicativo" }),
  );
  expect(
    screen.getByRole("region", { name: "Input applicativo completo" }),
  ).toHaveTextContent("Mario");
});
it("never implies that full payloads exist for calls captured with diagnostics disabled", () => {
  render(
    <DiagnosticDetail data={{ ...operation, diagnosticsEnabled: false }} />,
  );
  expect(
    screen.getByText(/precedenti non sono ricostruibili/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Scarica invocazione completa" }),
  ).not.toBeInTheDocument();
});
