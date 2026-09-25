import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DiscoveryPreview } from "./discovery-preview";
import type { DiscoveryConfiguration } from "../../start/discovery-types";

const config: DiscoveryConfiguration = {
  version: 3,
  questions: [
    {
      id: "goal",
      code: "goal",
      title: "Obiettivo",
      type: "single_choice",
      required: true,
      order: 1,
      target: "goalId",
      options: [{ id: "g1", label: "Resistenza", value: "g1" }],
    },
    {
      id: "injury",
      code: "injury",
      title: "Hai avuto infortuni?",
      type: "boolean",
      required: true,
      order: 2,
      options: [
        { id: "yes", label: "Sì", value: true },
        { id: "no", label: "No", value: false },
      ],
    },
    {
      id: "detail",
      code: "detail",
      title: "Dettaglio infortunio",
      type: "single_choice",
      required: true,
      order: 3,
      options: [{ id: "knee", label: "Ginocchio", value: "knee" }],
      visibleWhen: {
        match: "all",
        rules: [{ question: "injury", operator: "in", values: [true] }],
      },
    },
    {
      id: "freq",
      code: "freq",
      title: "Quante volte ti alleni?",
      type: "single_choice",
      required: true,
      order: 4,
      options: [{ id: "two", label: "2 volte", value: "two" }],
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("percorre i rami reali e mostra il numero di domande risultante", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(config))),
  );
  render(<DiscoveryPreview />);
  const status = await screen.findByText(/Percorso corrente/);
  expect(status).toHaveTextContent(
    "Percorso corrente 1 / 3 · Domande visibili in questo ramo: 3",
  );
  await userEvent.click(screen.getByRole("button", { name: "Resistenza" }));
  await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
  await userEvent.click(screen.getByRole("button", { name: "Sì" }));
  expect(status).toHaveTextContent("Percorso corrente 2 / 4");
  expect(status).toHaveTextContent("Domande visibili: 3 → 4");
  await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
  expect(
    screen.getByRole("heading", { name: "Dettaglio infortunio" }),
  ).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Indietro" }));
  await userEvent.click(screen.getByRole("button", { name: "No" }));
  expect(status).toHaveTextContent("Domande visibili: 4 → 3");
  await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
  expect(
    screen.getByRole("heading", { name: "Quante volte ti alleni?" }),
  ).toBeInTheDocument();
});
