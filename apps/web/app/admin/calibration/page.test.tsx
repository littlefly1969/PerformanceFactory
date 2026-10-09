import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import Page from "./page";

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
vi.mock("@/app/lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
}));

const settings = {
  levelConfidenceThreshold: 50,
  maxDays: 30,
  programBeforePaywall: false,
  questionsPerMicroTest: 0,
};

const version = (version: number, rule: Record<string, number | null>) => ({
  id: `v${version}`,
  version,
  note: null,
  createdAt: "2026-10-08T08:00:00.000Z",
  createdBy: "admin@example.test",
  minOverallConfidence: null,
  minAreaConfidence: null,
  minAreasAtConfidence: null,
  ...rule,
});
const policies = () => [
  {
    kind: "R_CONSOLIDATION",
    active: version(1, { minOverallConfidence: 70, minAreaConfidence: 70 }),
    versions: [version(1, { minOverallConfidence: 70, minAreaConfidence: 70 })],
  },
  {
    kind: "LESSON_ELIGIBILITY",
    active: version(1, { minOverallConfidence: 50 }),
    versions: [version(1, { minOverallConfidence: 50 })],
  },
];

/** Risposte del server: parametri e regole; i POST pubblicano una versione. */
const server = (
  onPut: (body: Record<string, unknown>) => Response,
  posts: { url: string; body: Record<string, unknown> }[] = [],
) =>
  vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/admin/confidence-policies"))
      return new Response(JSON.stringify(policies()));
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      posts.push({ url, body });
      if (body.minOverallConfidence === null && body.minAreaConfidence === null)
        return new Response(
          JSON.stringify({ message: "Indica almeno una soglia di confidence" }),
          { status: 400 },
        );
      return new Response(JSON.stringify({ ...body, version: 2 }));
    }
    if (init?.method === "PUT") return onPut(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(settings));
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("saves the calibration parameters, without time-based fields, and shows the server's refusal", async () => {
  const puts: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    server((body) => {
      puts.push(body);
      if (Number(body.levelConfidenceThreshold) > 100)
        return new Response(
          JSON.stringify({ message: ["La soglia del livello va da 1 a 100"] }),
          { status: 400 },
        );
      return new Response(JSON.stringify(body));
    }),
  );
  render(<Page />);
  const level = await screen.findByLabelText(/Soglia per il livello stimato/);
  // AT-10: nessuna attesa fra i round né giorno di chiusura da impostare.
  expect(screen.queryByLabelText(/Ore minime/)).toBeNull();
  expect(screen.queryByLabelText(/assessment di chiusura/)).toBeNull();
  await userEvent.clear(level);
  await userEvent.type(level, "60");
  // Indicazione all'AI sul rapporto prove/domande, non una regola.
  const ratio = screen.getByLabelText(/Domande per ogni micro-prova/);
  await userEvent.clear(ratio);
  await userEvent.type(ratio, "3");
  await userEvent.click(
    screen.getByRole("button", { name: "Salva parametri" }),
  );
  expect(puts[0]).toMatchObject({
    levelConfidenceThreshold: 60,
    maxDays: 30,
    programBeforePaywall: false,
    questionsPerMicroTest: 3,
  });
  expect(puts[0]).not.toHaveProperty("confidenceThreshold");
  expect(await screen.findByText(/Parametri salvati/)).toBeVisible();

  await userEvent.clear(level);
  await userEvent.type(level, "140");
  await userEvent.click(
    screen.getByRole("button", { name: "Salva parametri" }),
  );
  expect(
    await screen.findByText("La soglia del livello va da 1 a 100"),
  ).toBeVisible();
});

it("publishes a new version of a confidence rule, separately for lesson and consolidation", async () => {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    server(() => new Response("{}"), posts),
  );
  render(<Page />);
  const consolidation = await screen.findByRole("region", {
    name: "Consolidamento di R",
  });
  expect(consolidation).toHaveTextContent(
    "versione 1, complessiva ≥ 70 e tutte le aree ≥ 70",
  );
  expect(
    screen.getByRole("region", { name: "Eleggibilità alla lezione gratuita" }),
  ).toHaveTextContent("complessiva ≥ 50");
  const [overall] = within(consolidation).getAllByRole("spinbutton");
  await userEvent.clear(overall);
  await userEvent.type(overall, "75");
  await userEvent.click(
    within(consolidation).getByRole("button", {
      name: "Pubblica nuova versione",
    }),
  );
  expect(posts[0]).toEqual({
    url: "/api/admin/confidence-policies/R_CONSOLIDATION",
    body: {
      minOverallConfidence: 75,
      minAreaConfidence: 70,
      minAreasAtConfidence: null,
    },
  });

  // Una regola senza soglie viene rifiutata dal server, il messaggio resta visibile.
  const lesson = screen.getByRole("region", {
    name: "Eleggibilità alla lezione gratuita",
  });
  const [lessonOverall] = within(lesson).getAllByRole("spinbutton");
  await userEvent.clear(lessonOverall);
  await userEvent.click(
    within(lesson).getByRole("button", { name: "Pubblica nuova versione" }),
  );
  expect(
    await within(lesson).findByText("Indica almeno una soglia di confidence"),
  ).toBeVisible();
});

it("turns on training during calibration only when the admin ticks it", async () => {
  const puts: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    server((body) => {
      puts.push(body);
      return new Response(JSON.stringify(body));
    }),
  );
  render(<Page />);
  const toggle = await screen.findByLabelText(/Programma prima del paywall/);
  expect(toggle).not.toBeChecked();
  await userEvent.click(toggle);
  await userEvent.click(
    screen.getByRole("button", { name: "Salva parametri" }),
  );
  expect(puts[0]).toMatchObject({ programBeforePaywall: true });
});
