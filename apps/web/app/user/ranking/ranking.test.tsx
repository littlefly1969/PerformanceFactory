import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminRankingPage from "../../admin/ranking/page";
import SubscriberProfilePage from "../profile/page";
import RankingPage from "./page";
import type { RankedView } from "./ranking-data";

vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));
vi.mock("../../components/account-menu", () => ({
  AccountMenu: () => <span>menu</span>,
}));
vi.mock("../../components/product-shell", () => ({
  ProductShell: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
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
      const path = url.replace("/api", "").split("?")[0];
      const body = routes[`${method} ${path}`];
      if (body === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(body ?? {}));
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const visibility = (granted: boolean) => ({
  granted,
  grantedAt: null,
  document: {
    type: "RANKING_VISIBILITY",
    version: "ranking-v1-2026-11-13",
    title: "Nome nel ranking della piattaforma",
    summary:
      "Facoltativo. Gli altri atleti della tua fascia vedono il tuo nome.",
    body: [
      "Con questo consenso il tuo nome compare nella classifica della tua fascia.",
      "Puoi revocarlo in qualsiasi momento dal tuo profilo.",
    ],
    documentHash: "h",
  },
});

const ranked = (over: Partial<RankedView> = {}): RankedView => ({
  status: "RANKED",
  band: "PF4",
  bandText: "Il punto di partenza",
  position: 395,
  size: 2600,
  real: 30,
  potential: 61,
  horizon: "PROGRAM_6M",
  months: 6,
  weights: { real: 60, potential: 40 },
  board: [
    { position: 394, name: "Atleta", real: 32, potential: 61, me: false },
    { position: 395, name: "Mario (tu)", real: 30, potential: 61, me: true },
    { position: 396, name: "Fede C.", real: 28, potential: 62, me: false },
  ],
  bands: (["PF1", "PF2", "PF3", "PF4"] as const).map((code, i) => ({
    code,
    text: `Fascia ${code}`,
    min: [80, 66, 50, 0][i],
    size: [120, 480, 1240, 2600][i],
    me: code === "PF4",
  })),
  example: {
    realFavoured: true,
    athletes: [
      { name: "Luca", real: 65, potential: 68, band: "PF2" },
      { name: "Anna", real: 63, potential: 70, band: "PF3" },
    ],
  },
  announce: false,
  visible: false,
  ...over,
});

const drivers = ["Tecnico-tattico", "Preparazione atletica"].map((n, i) => ({
  id: `a${i}`,
  name: n,
  score: 30,
  confidence: 80,
}));
const subscriberRoutes = (ranking: unknown) => ({
  "GET /auth/journey": {
    phase: "SUBSCRIBED",
    evaluation: {
      drivers,
      overallConfidence: 74,
      scale: { min: 0, max: 100 },
    },
    calibration: {
      status: "PAYWALL_READY",
      ruleMet: true,
      consolidationRule: { minOverallConfidence: 70 },
    },
  },
  "GET /athlete-journey/profile": {
    firstName: "Mario",
    global: { value: 30, low: 27, high: 33, confidence: 74 },
  },
  "GET /athlete/home": {
    firstName: "Mario",
    today: "2026-11-13",
    program: {
      durationWeeks: 26,
      status: "ACTIVE",
      summary: null,
      completed: 1,
      total: 40,
      cycle: {
        version: 1,
        startsOn: "2026-11-04",
        endsOn: "2026-12-01",
        windowDays: 28,
        sessionsPerWeek: 4,
        macroBlock: 1,
        windowInProgram: 1,
        windowsPerProgram: 6,
      },
    },
    streak: { days: 6 },
    coaches: [],
    week: {
      sessions: [
        { id: "s1", status: "COMPLETED" },
        { id: "s2", status: "SCHEDULED" },
      ],
    },
  },
  "GET /payments/subscription/account": {
    state: "ACTIVE",
    entitled: true,
    subscription: {
      horizon: "PROGRAM_6M",
      billingCycle: "MONTHLY",
      cancelAtPeriodEnd: false,
    },
  },
  "GET /athlete/ranking": ranking,
  "GET /athlete/ranking/visibility": visibility(false),
  "POST /athlete/ranking/announcement": 204,
  "GET /athlete/training/availability": {
    daysPerWeek: 3,
    sessionDurationMinutes: 60,
    currentFrequency: "2_3",
    programDurationWeeks: null,
    preferredDays: [1, 3, 5],
  },
  "GET /athlete-journey/fit-ranking": {
    ranking: null,
    options: { PADEL: [], TENNIS: [] },
  },
  "GET /consents/marketing": { granted: false },
  "GET /features/me": {},
});

describe("subscriber profile like the V11 demo", () => {
  it("shows R, the ranking row, the subscription and the plan", async () => {
    serve(subscriberRoutes(ranked()));
    render(<SubscriberProfilePage />);
    const row = await screen.findByRole("link", { name: /395° in PF4/ });
    expect(row).toHaveAttribute("href", "/user/ranking");
    expect(row).toHaveTextContent("Reale 30 · potenziale 61");
    expect(await screen.findByText("Sufficientemente completo")).toBeVisible();
    expect(screen.getByText("Abbonamento attivo")).toBeVisible();
    expect(
      screen.getByText("Programma di 6 mesi · pagamento mensile"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Gestisci/ })).toHaveAttribute(
      "href",
      "/account/abbonamento?da=user-profilo",
    );
    expect(screen.getByText("Piano v1.0 · 6 mesi")).toBeVisible();
    // Ciclo dal 4 novembre: il 13 è nella seconda settimana di quattro.
    expect(screen.getByText("Blocco").parentElement).toHaveTextContent(
      "02 / 04 settimane",
    );
    expect(
      screen.getByText("Sessioni settimana").parentElement,
    ).toHaveTextContent("01 / 04");
    expect(screen.getByText("6 giorni")).toBeVisible();
    // Disponibilità compilata: si modifica tornando al profilo dell'abbonato.
    expect(
      screen.getByRole("link", { name: "Modifica la disponibilità" }),
    ).toHaveAttribute("href", "/journey/profilo/disponibilita?da=abbonato");
    expect(
      screen.getByRole("link", { name: /La tua classifica FITP/ }),
    ).toHaveAttribute("href", "/journey/profilo/classifica?da=abbonato");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("announces the band once with the pop-up", async () => {
    const calls = serve(subscriberRoutes(ranked({ announce: true })));
    render(<SubscriberProfilePage />);
    const dialog = await screen.findByRole("dialog", {
      name: "Sei entrato in PF4.",
    });
    expect(dialog).toHaveTextContent("Sei il 395° della fascia.");
    expect(
      screen.getByRole("link", { name: "Vedi il ranking" }),
    ).toHaveAttribute("href", "/user/ranking");
    await userEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(
        calls.find((c) => c.url.endsWith("/athlete/ranking/announcement")),
      ).toMatchObject({ method: "POST", body: { band: "PF4" } }),
    );
  });

  it("hides ranking row and name preference while the feature is off", async () => {
    serve(subscriberRoutes({ status: "OFF" }));
    render(<SubscriberProfilePage />);
    expect(await screen.findByText("Abbonamento attivo")).toBeVisible();
    expect(screen.queryByText(/in PF4/)).toBeNull();
    expect(
      screen.queryByLabelText(/Compaio nel ranking con nome e iniziale/),
    ).toBeNull();
  });
});

describe("ranking screen", () => {
  it("shows band, position, nearby athletes, the example and the four bands", async () => {
    serve({
      "GET /athlete/ranking": ranked(),
      "GET /athlete/ranking/visibility": visibility(false),
    });
    render(<RankingPage />);
    const hero = await screen.findByRole("region", {
      name: "La tua posizione",
    });
    expect(hero).toHaveTextContent("395° in PF4");
    expect(screen.getByText("su 2600 giocatori")).toBeVisible();
    expect(
      screen.getByText(
        /conta per il 60% il reale e per il 40% il potenziale a 6 mesi/,
      ),
    ).toBeVisible();
    const board = screen.getByRole("list", { name: "Classifica PF4" });
    expect(board).toHaveTextContent("Mario (tu)");
    expect(board).toHaveTextContent("Atleta");
    expect(board.querySelector("[aria-current]")).toHaveTextContent("395°");
    expect(
      screen.getByText(/Luca ha un potenziale più basso.*va in PF2/),
    ).toBeVisible();
    expect(screen.getByText("Sei qui")).toBeVisible();
    expect(screen.getByText("Reale / potenziale, su 100")).toBeVisible();
  });

  it("lets the athlete read the versioned consent, then grant and revoke it", async () => {
    const routes: Record<string, unknown> = {
      "GET /athlete/ranking": ranked(),
      "GET /athlete/ranking/visibility": visibility(false),
      "PUT /athlete/ranking/visibility": visibility(true),
    };
    const calls = serve(routes);
    render(<RankingPage />);
    const box = await screen.findByLabelText(
      /Compaio nel ranking con nome e iniziale/,
    );
    // Prima del consenso: riassunto, poi il testo completo con la versione.
    await waitFor(() => expect(box).toBeEnabled());
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription(
      "Facoltativo. Gli altri atleti della tua fascia vedono il tuo nome.",
    );
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    await userEvent.click(screen.getByText("Leggi il testo completo"));
    const text = screen.getByRole("region", {
      name: "Nome nel ranking della piattaforma",
    });
    expect(text).toBeVisible();
    expect(text).toHaveTextContent(
      "Con questo consenso il tuo nome compare nella classifica della tua fascia.",
    );
    expect(text).toHaveTextContent("Puoi revocarlo in qualsiasi momento");
    expect(text).toHaveTextContent("Versione ranking-v1-2026-11-13");

    await userEvent.click(box);
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "PUT")).toEqual([
        expect.objectContaining({ body: { granted: true } }),
      ]),
    );
    expect(
      await screen.findByText("Gli altri vedono il tuo nome e l’iniziale."),
    ).toBeVisible();
    expect(box).toBeChecked();

    routes["PUT /athlete/ranking/visibility"] = visibility(false);
    await userEvent.click(box);
    expect(
      await screen.findByText("Nel ranking compari come «Atleta»."),
    ).toBeVisible();
    expect(box).not.toBeChecked();
    expect(calls.filter((c) => c.method === "PUT").at(-1)).toMatchObject({
      body: { granted: false },
    });
  });

  it("keeps the consent box off until the document can be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/athlete/ranking/visibility")
          ? new Response("{}", { status: 503 })
          : new Response(JSON.stringify(ranked())),
      ),
    );
    render(<RankingPage />);
    expect(
      await screen.findByText(/Il testo del consenso non è disponibile/),
    ).toBeVisible();
    expect(
      screen.getByLabelText(/Compaio nel ranking con nome e iniziale/),
    ).toBeDisabled();
    expect(screen.queryByText("Leggi il testo completo")).toBeNull();
  });

  it("explains why an athlete without potential is not ranked yet", async () => {
    serve({
      "GET /athlete/ranking": {
        status: "NOT_RANKED",
        subscribed: true,
        visible: false,
      },
    });
    render(<RankingPage />);
    expect(
      await screen.findByText(/arriva appena c’è il potenziale/),
    ).toBeVisible();
  });
});

describe("admin ranking", () => {
  it("keeps the weights complementary and saves weights and thresholds", async () => {
    const config = {
      realWeight: 60,
      potentialWeight: 40,
      pf1Min: 80,
      pf2Min: 66,
      pf3Min: 50,
    };
    const view = {
      config,
      defaults: config,
      ranked: 3,
      bands: ranked().bands,
      changes: [],
    };
    const calls = serve({
      "GET /admin/ranking": view,
      "PUT /admin/ranking/config": view,
    });
    render(<AdminRankingPage />);
    const real = await screen.findByLabelText("Peso del reale (%)");
    await userEvent.clear(real);
    await userEvent.type(real, "70");
    expect(screen.getByLabelText("Peso del potenziale (%)")).toHaveValue(30);
    const pf2 = screen.getByLabelText("PF2 da (punteggio 0-100)");
    await userEvent.clear(pf2);
    await userEvent.type(pf2, "65");
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")).toMatchObject({
        body: {
          realWeight: 70,
          potentialWeight: 30,
          pf1Min: 80,
          pf2Min: 65,
          pf3Min: 50,
        },
      }),
    );
  });
});
