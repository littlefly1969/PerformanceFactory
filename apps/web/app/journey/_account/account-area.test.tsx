import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "../profilo/page";
import CoachPage from "../coach/page";
import ClubPage from "../circolo/page";
import ScenariosPage from "../scenari/page";
import CheckoutPage from "../checkout/page";
import {
  calibration,
  drivers,
  journey,
  lesson,
  ROUND,
  serve,
} from "./account-fixtures";
vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/journey");
});

describe("Profilo dell'atleta", () => {
  it("shows the global R with its range and the unlocked free lesson", async () => {
    serve({
      "/auth/journey": journey(),
      "/athlete-journey/profile": {
        firstName: "Stefano",
        sport: "Padel",
        experience: "1-3 anni",
        global: {
          value: 83,
          low: 70,
          high: 96,
          confidence: 30,
          provisional: true,
        },
      },
      "/athlete-journey/free-lesson": lesson,
      "/fit-ranking": {
        ranking: null,
        options: { PADEL: [], TENNIS: [] },
        recalculationPending: false,
      },
    });
    render(<ProfilePage />);
    expect(await screen.findByText("Tra 70 e 96")).toBeInTheDocument();
    expect(screen.getByText(/83/)).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Scegli il circolo/ }),
    ).toHaveAttribute("href", "/journey/circolo");
    expect(screen.getByRole("link", { name: /Calibrazione/ })).toHaveAttribute(
      "href",
      "/journey/calibrazione",
    );
    expect(
      screen.getByRole("img", { name: /Il tuo Spider provvisorio/ }),
    ).toBeInTheDocument();
  });
});

describe("Micro-test nel Coach", () => {
  it("reveals the coach's explanation after each situation and sends the answers", async () => {
    // Con le risposte il round si chiude: il percorso non lo propone più.
    let answered = false;
    const current = () =>
      answered ? journey({ calibration: calibration(null) }) : journey();
    const calls = serve({
      "/auth/journey": current,
      "/calibration/situation": {
        value: "o1",
        correct: false,
        correctValue: "o2",
        feedback: { o1: "Regali la rete.", o2: "Il vetro è un alleato." },
      },
      "/calibration/answers": () => {
        answered = true;
        return current();
      },
      "/calibration/micro-test/": {
        status: "EVALUATED",
        format: "SITUATIONAL",
        title: "Il terzo colpo",
        area: { id: "d0", name: "Tecnico-tattico" },
        confidence: { before: 22, after: 40 },
        correct: 1,
        total: 2,
        summary: "Ci sei quasi.",
        video: { title: "L'uscita dal vetro spiegata dal coach", url: null },
      },
    });
    render(<CoachPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Inizia il micro-test" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Colpisco forte/ }),
    );
    expect(await screen.findByText("Regali la rete.")).toBeInTheDocument();
    expect(screen.getByText("Il vetro è un alleato.")).toBeInTheDocument();
    expect(
      calls.find((c) => c.url.endsWith("/calibration/situation"))?.body,
    ).toEqual({ roundId: ROUND.id, questionId: "t1", value: "o1" });
    await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
    await userEvent.click(
      await screen.findByRole("button", { name: /Colpisco forte/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Vedi il risultato" }),
    );
    await waitFor(() =>
      expect(
        calls.find((c) => c.url.endsWith("/calibration/answers"))?.body,
      ).toEqual({ roundId: ROUND.id, answers: { t1: "o1", t2: "o1" } }),
    );
    // Senza video nell'archivio, il riquadro mostra il titolo previsto.
    expect(
      (await screen.findAllByText("L'uscita dal vetro spiegata dal coach"))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Video in arrivo")).toBeInTheDocument();
    expect(screen.getByText("22% → 40%")).toBeInTheDocument();
  });
});

describe("Scelta del circolo", () => {
  it("requests the seat with the preferred lesson only after consent", async () => {
    const calls = serve({
      "/auth/journey": journey(),
      "/free-lesson/request": { ...lesson, phase: "REQUESTED" },
      "/athlete-journey/free-lesson": lesson,
    });
    render(<ClubPage />);
    const request = await screen.findByRole("button", {
      name: /Richiedi il posto/,
    });
    expect(request).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: /27/ }));
    await userEvent.click(await screen.findByRole("radio", { name: "18:00" }));
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(request);
    await waitFor(() =>
      expect(
        calls.find((c) => c.url.endsWith("/free-lesson/request"))?.body,
      ).toEqual({ partnerId: "c1", shareWithCoach: true, lessonId: "l1" }),
    );
  });
});

describe("Distanza dei circoli", () => {
  it("shows how far each club is when the address is known", async () => {
    serve({
      "/auth/journey": journey(),
      "/athlete-journey/free-lesson": lesson,
    });
    render(<ClubPage />);
    expect(await screen.findByText("Milano · a 3.2 km")).toBeInTheDocument();
    expect(screen.queryByText(/Non possiamo calcolare/)).toBeNull();
  });

  it("says the distance cannot be computed without an address", async () => {
    serve({
      "/auth/journey": journey(),
      "/athlete-journey/free-lesson": {
        ...lesson,
        clubs: lesson.clubs.map((club) => ({ ...club, distanceKm: null })),
        distance: { available: false, reason: "NO_ADDRESS" },
      },
    });
    render(<ClubPage />);
    expect(
      await screen.findByText(/aggiungi il tuo indirizzo nel tuo account/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/km/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "Completa l’indirizzo nel tuo account" }),
    ).toHaveAttribute("href", "/account/indirizzo?da=circolo");
  });
});

describe("Checkout", () => {
  it("summarises the cost of the cadence the athlete picks", async () => {
    const option = (billingCycle: string, months: number, cents: number) => ({
      billingCycle,
      billingMonths: months,
      amountCents: cents,
      monthlyEquivalentCents: Math.round(cents / months),
      currency: "eur",
    });
    serve({
      "/auth/journey": journey({
        calibration: calibration(null, "PAYWALL_READY"),
        scenarios: {
          status: "READY",
          engine: { key: "p", version: "1", provisional: true },
          scale: { min: 0, max: 100 },
          selectedHorizon: "PROGRAM_12M",
          horizons: [{ horizon: "PROGRAM_12M", months: 12, drivers: [] }],
        },
      }),
      "/payments/offers": [
        {
          horizon: "PROGRAM_3M",
          horizonMonths: 3,
          monthlyCents: 1000,
          horizonTotalCents: 3000,
          currency: "eur",
          savingPercent: 0,
          billingOptions: [option("MONTHLY", 1, 1000)],
        },
        {
          horizon: "PROGRAM_12M",
          horizonMonths: 12,
          monthlyCents: 890,
          horizonTotalCents: 10680,
          currency: "eur",
          savingPercent: 11,
          billingOptions: [
            option("MONTHLY", 1, 890),
            option("QUARTERLY", 3, 2670),
            option("ANNUAL", 12, 10000),
          ],
        },
      ],
    });
    render(<CheckoutPage />);
    expect(await screen.findByText(/^Pagamento mensile: /)).toHaveTextContent(
      "Pagamento mensile: 8,90 € al mese, 106,80 € per tutti i 12 mesi, 11% al mese in meno del programma più breve.",
    );
    expect(screen.getByText(/Addebito ogni 3 mesi/)).toHaveTextContent(
      "· 8,90 € al mese",
    );
    await userEvent.click(
      screen.getByRole("radio", { name: /Pagamento annuale/ }),
    );
    expect(screen.getByText(/^Pagamento annuale: /)).toHaveTextContent(
      "Pagamento annuale: 8,33 € al mese, 100,00 € per tutti i 12 mesi, 17% al mese in meno del programma più breve.",
    );
  });
});

describe("Scenari", () => {
  it("keeps P3, P6 and P12 hidden until the calibration is closed", async () => {
    serve({ "/auth/journey": journey() });
    render(<ScenariosPage />);
    expect(
      await screen.findByText(/si mostrano quando la calibrazione è chiusa/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/P3 ·/)).toBeNull();
  });

  it("shows the horizons once the calibration is closed", async () => {
    const horizons = [3, 6, 12].map((months, k) => ({
      horizon: `PROGRAM_${months}M`,
      months,
      drivers: drivers.map((d) => ({
        ...d,
        current: d.score,
        potential: d.score + 3 + k,
      })),
      gap: {
        overall: { current: 83, potential: 86 + k * 2, gap: 3 },
        technicalTactical: null,
      },
    }));
    serve({
      "/auth/journey": journey({
        calibration: calibration(null, "PAYWALL_READY"),
        scenarios: {
          status: "READY",
          engine: { key: "p", version: "1", provisional: true },
          scale: { min: 0, max: 100 },
          selectedHorizon: null,
          horizons,
        },
      }),
    });
    render(<ScenariosPage />);
    expect(await screen.findByText("P3 · 86")).toBeInTheDocument();
    expect(screen.getByText("P12 · 90")).toBeInTheDocument();
  });
});
