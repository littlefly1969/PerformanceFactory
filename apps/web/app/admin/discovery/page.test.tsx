import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Page from "./page";
import type { Template } from "./discovery-types";

vi.mock("../../components/product-shell", () => ({
  ProductShell: ({
    title,
    stats,
    actions,
    children,
  }: {
    title: string;
    stats?: { label: string; value: ReactNode }[];
    actions?: ReactNode;
    children: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      {stats?.map((s) => (
        <p key={s.label}>
          {s.label}: {s.value}
        </p>
      ))}
      {actions}
      {children}
    </main>
  ),
}));
vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));

const question = (
  key: string,
  orderIndex: number,
  optionsJson: Template["optionsJson"],
): Template => ({
  id: key,
  key,
  label: key.toUpperCase(),
  inputType: optionsJson.type === "number" ? "NUMBER" : "SELECT",
  required: true,
  isActive: true,
  orderIndex,
  optionsJson,
});
const yesNo = [
  { id: "yes", label: "Sì", value: true },
  { id: "no", label: "No", value: false },
];
const fixture = () => [
  question("goal", 10, {
    type: "single_choice",
    target: "goalId",
    options: [{ id: "g1", label: "Resistenza", value: "g1" }],
  }),
  question("injury", 20, { type: "boolean", options: yesNo }),
  question("injury_detail", 30, {
    type: "single_choice",
    options: [{ id: "knee", label: "Ginocchio", value: "knee" }],
    visibleWhen: {
      match: "all",
      rules: [{ question: "injury", operator: "in", values: [true] }],
    },
  }),
  question("weight", 40, { type: "number", options: [], min: 30, max: 250 }),
];

let templates: Template[];
let requests: { method: string; url: string; body?: unknown }[];
let failure: string | undefined;
const list = () => {
  const active = templates.filter((t) => t.isActive);
  const conditional = active.filter((t) => t.optionsJson.visibleWhen).length;
  return {
    sportMode: "fixed",
    templates,
    stats: {
      configured: templates.length,
      active: active.length,
      inactive: templates.length - active.length,
      conditional,
      unconditional: active.length - conditional,
      maxVisible: active.length,
    },
  };
};
const sent = (method: string) => requests.filter((r) => r.method === method);

beforeEach(() => {
  templates = fixture();
  requests = [];
  failure = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ method, url, body });
      if (failure)
        return new Response(JSON.stringify({ message: failure }), {
          status: 400,
        });
      const id = url.split("/").pop();
      if (method === "PATCH")
        templates = templates.map((t) => (t.id === id ? { ...t, ...body } : t));
      if (method === "POST" && url.endsWith("/reorder"))
        templates = body.ids.map((i: string) =>
          templates.find((t) => t.id === i),
        );
      return new Response(JSON.stringify(list()));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function open() {
  render(<Page />);
  return screen.findByRole("list", { name: "Domande discovery" });
}

describe("Admin discovery manager", () => {
  it("mostra i conteggi derivati e distingue le condizionali", async () => {
    await open();
    for (const text of [
      "Configurate: 4",
      "Attive: 4",
      "Sempre visibili: 3",
      "Condizionali: 1",
      "Percorso massimo: 4",
    ])
      expect(screen.getByText(text)).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "INJURY_DETAIL" }),
    ).toHaveTextContent("Condizionale");
  });

  it("disattiva una domanda e aggiorna le attive", async () => {
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Disattiva WEIGHT" }),
    );
    expect(sent("PATCH")[0]).toMatchObject({
      url: "/api/admin/onboarding-templates/weight",
      body: { isActive: false },
    });
    expect(await screen.findByText("Attive: 3")).toBeInTheDocument();
  });

  it("riordina trascinando e invia l'ordine completo", async () => {
    await open();
    fireEvent.dragStart(screen.getByRole("listitem", { name: "WEIGHT" }));
    fireEvent.drop(screen.getByRole("listitem", { name: "INJURY" }));
    expect(await screen.findByText("Nuovo ordine salvato.")).toBeVisible();
    expect(sent("POST")[0]).toMatchObject({
      url: "/api/admin/onboarding-templates/reorder",
      body: { ids: ["goal", "weight", "injury", "injury_detail"] },
    });
  });

  it("spiega perché un nuovo ordine romperebbe un ramo, senza inviarlo", async () => {
    await open();
    await userEvent.selectOptions(
      screen.getByLabelText("Posizione di INJURY_DETAIL"),
      "1",
    );
    expect(
      screen.getByText(
        "Impossibile spostare «INJURY_DETAIL» prima di «INJURY»",
      ),
    ).toBeInTheDocument();
    expect(sent("POST")).toHaveLength(0);
  });

  it("salva una domanda numerica con minimo, massimo, incremento e unità", async () => {
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Nuova domanda" }),
    );
    await userEvent.type(screen.getByLabelText("Codice"), "height");
    await userEvent.type(screen.getByLabelText("Titolo"), "Quanto sei alto?");
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "number");
    await userEvent.type(
      screen.getByLabelText("Context key"),
      "general_height_cm",
    );
    for (const [label, value] of [
      ["Minimo", "120"],
      ["Massimo", "230"],
      ["Incremento", "0.5"],
    ]) {
      await userEvent.clear(screen.getByLabelText(label));
      await userEvent.type(screen.getByLabelText(label), value);
    }
    await userEvent.type(screen.getByLabelText("Unità"), "cm");
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(sent("POST")[0].body).toEqual({
      key: "height",
      label: "Quanto sei alto?",
      helpText: null,
      inputType: "NUMBER",
      required: true,
      isActive: true,
      optionsJson: {
        type: "number",
        options: [],
        min: 120,
        max: 230,
        step: 0.5,
        ui: { unit: "cm" },
        contextKey: "general_height_cm",
      },
    });
  });

  it("salva le opzioni di una scelta nell'ordine deciso", async () => {
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Nuova domanda" }),
    );
    await userEvent.type(screen.getByLabelText("Codice"), "level");
    await userEvent.type(screen.getByLabelText("Titolo"), "Esperienza");
    const [id] = screen.getAllByLabelText("ID");
    await userEvent.clear(id);
    await userEvent.type(id, "principiante");
    await userEvent.type(
      screen.getAllByLabelText("Etichetta")[0],
      "Meno di 1 anno",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Aggiungi opzione" }),
    );
    await userEvent.clear(screen.getAllByLabelText("ID")[1]);
    await userEvent.type(screen.getAllByLabelText("ID")[1], "intermedio");
    await userEvent.type(screen.getAllByLabelText("Etichetta")[1], "1-3 anni");
    await userEvent.type(
      screen.getAllByLabelText("Descrizione")[2],
      "Gioca con regolarità",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Sposta su 1-3 anni" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(sent("POST")[0].body).toMatchObject({
      key: "level",
      optionsJson: {
        type: "single_choice",
        options: [
          {
            id: "intermedio",
            label: "1-3 anni",
            value: "1-3 anni",
            description: "Gioca con regolarità",
          },
          {
            id: "principiante",
            label: "Meno di 1 anno",
            value: "Meno di 1 anno",
          },
        ],
      },
    });
  });

  it("salva la visibilità condizionale con il modello del backend", async () => {
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Modifica WEIGHT" }),
    );
    await userEvent.selectOptions(screen.getByLabelText("Visibilità"), "all");
    await userEvent.selectOptions(
      screen.getByLabelText("Risposta alla domanda"),
      "injury",
    );
    await userEvent.click(screen.getByLabelText("Sì"));
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    const patch = sent("PATCH")[0];
    expect(patch.url).toBe("/api/admin/onboarding-templates/weight");
    expect(patch.body).not.toHaveProperty("key");
    expect(patch.body).toMatchObject({
      optionsJson: {
        visibleWhen: {
          match: "all",
          rules: [{ question: "injury", operator: "in", values: [true] }],
        },
      },
    });
  });

  it("mostra l'errore strutturale del backend in modo leggibile", async () => {
    await open();
    failure = "La discovery richiede una domanda attiva per l'obiettivo";
    await userEvent.click(
      screen.getByRole("button", { name: "Disattiva GOAL" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(failure);
  });

  it("duplica come copia disattivata ed elimina solo dopo conferma", async () => {
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Duplica INJURY" }),
    );
    expect(sent("POST")[0].body).toMatchObject({
      key: "injury_copia",
      label: "INJURY (copia)",
      isActive: false,
      orderIndex: 21,
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await userEvent.click(
      screen.getByRole("button", { name: "Elimina INJURY_DETAIL" }),
    );
    expect(sent("DELETE")).toHaveLength(0);
    confirm.mockReturnValueOnce(true);
    await userEvent.click(
      screen.getByRole("button", { name: "Elimina INJURY_DETAIL" }),
    );
    expect(sent("DELETE")[0].url).toBe(
      "/api/admin/onboarding-templates/injury_detail",
    );
  });
});
