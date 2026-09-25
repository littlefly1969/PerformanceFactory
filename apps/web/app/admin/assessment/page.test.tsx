import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Page from "./page";
import type { AssessmentList } from "./assessment-types";

vi.mock("../../components/product-shell", () => ({
  ProductShell: ({
    title,
    stats,
    children,
  }: {
    title: string;
    stats?: { label: string; value: ReactNode }[];
    children: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      {stats?.map((s) => (
        <p key={s.label}>
          {s.label}: {s.value}
        </p>
      ))}
      {children}
    </main>
  ),
}));
vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));

const options = [
  { value: "0", label: "Bene", score: 100 },
  { value: "1", label: "Male", score: 0 },
];
const list = (): AssessmentList => ({
  sportKey: "PADEL",
  expectedPerArea: 2,
  operational: [
    {
      id: "days",
      key: "training_days_available",
      label: "Quanti giorni alla settimana puoi realisticamente allenarti?",
      helpText: null,
      orderIndex: 1,
      isActive: true,
      semanticRole: "TRAINING_AVAILABILITY_DAYS",
      options: [{ value: "2", label: "2 giorni", score: "" }],
    },
  ],
  areas: [
    {
      id: "nutrition",
      name: "Nutrizione",
      templates: [
        {
          id: "n1",
          key: "n1",
          label: "Prima domanda",
          helpText: null,
          orderIndex: 7,
          isActive: true,
          options,
        },
        {
          id: "n2",
          key: "n2",
          label: "Seconda domanda",
          helpText: null,
          orderIndex: 8,
          isActive: true,
          options,
        },
      ],
    },
  ],
  stats: {
    fixedQuestionCount: 2,
    areaQuestionCount: 12,
    count: 14,
    estimatedMinutes: 5,
  },
  problems: [],
});

let requests: { method: string; url: string; body?: unknown }[];
let failure: string | undefined;
beforeEach(() => {
  requests = [];
  failure = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({
        method,
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (failure && method !== "GET")
        return new Response(JSON.stringify({ message: failure }), {
          status: 400,
        });
      return new Response(JSON.stringify(list()));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const sent = (method: string) => requests.filter((r) => r.method === method);
const open = async () => {
  render(<Page />);
  return screen.findByRole("list", { name: "Domande operative" });
};

describe("Admin assessment editor", () => {
  it("shows operational questions as locked system questions and backend counts", async () => {
    const operational = await open();
    const row = within(operational).getByRole("listitem");
    expect(row).toHaveTextContent("Sistema · Bloccata");
    expect(row).toHaveTextContent(
      "Questa domanda alimenta direttamente la programmazione degli allenamenti.",
    );
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Totale assessment: 14")).toBeInTheDocument();
    expect(screen.getByText("2 / 2 domande attive")).toBeInTheDocument();
  });

  it("edits text and scores of a driver question", async () => {
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Modifica Prima domanda" }),
    );
    await userEvent.clear(screen.getByLabelText("Testo"));
    await userEvent.type(screen.getByLabelText("Testo"), "Nuovo testo");
    const [, second] = screen.getAllByLabelText("Punteggio");
    await userEvent.clear(second);
    await userEvent.type(second, "25");
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(sent("PATCH")[0]).toEqual({
      method: "PATCH",
      url: "/api/admin/assessment-templates/n1",
      body: {
        label: "Nuovo testo",
        helpText: null,
        options: [options[0], { ...options[1], score: 25 }],
      },
    });
  });

  it("shows the backend message when a third active question is refused", async () => {
    await open();
    failure = "Il driver può avere esattamente 2 domande attive.";
    await userEvent.click(
      screen.getByRole("button", { name: "Aggiungi domanda Nutrizione" }),
    );
    await userEvent.type(screen.getByLabelText("Testo"), "Terza");
    const labels = screen.getAllByLabelText("Etichetta");
    const scores = screen.getAllByLabelText("Punteggio");
    for (const [i, label] of ["Sì", "No"].entries()) {
      await userEvent.type(labels[i], label);
      await userEvent.type(scores[i], String(100 - i * 100));
    }
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(sent("POST")[0].body).toMatchObject({
      areaId: "nutrition",
      isActive: true,
    });
    expect(await screen.findByText(failure)).toBeInTheDocument();
  });

  it("explains why a driver question cannot be deactivated", async () => {
    await open();
    failure =
      "Ogni driver attivo deve avere esattamente 2 domande. Disattiva il driver oppure configura una domanda sostitutiva.";
    await userEvent.click(
      screen.getByRole("button", { name: "Disattiva Prima domanda" }),
    );
    expect(sent("PATCH")[0].body).toEqual({ isActive: false });
    expect(await screen.findByText(failure)).toBeInTheDocument();
  });

  it("reorders questions inside their driver", async () => {
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Sposta giù Prima domanda" }),
    );
    expect(sent("POST")[0]).toMatchObject({
      url: "/api/admin/assessment-templates/reorder",
      body: { areaId: "nutrition", ids: ["n2", "n1"] },
    });
  });
});
