import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "./page";
import AvailabilityPage from "./disponibilita/page";
import RankingPage from "./classifica/page";
import InvitePage from "./invita/page";
import CommunityPage from "./community/page";
import {
  calibration,
  evaluation,
  journey,
  lesson,
  serve,
} from "../_account/account-fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
  window.history.replaceState(null, "", "/journey");
});

const PROFILE = {
  firstName: "Stefano",
  sport: "Padel",
  experience: null,
  global: { value: 83, low: 70, high: 96, confidence: 30, provisional: true },
};
const OPTIONS = {
  PADEL: [
    { value: "1", label: "1ª fascia" },
    { value: "2", label: "2ª fascia" },
    { value: "3", label: "3ª fascia" },
    { value: "4", label: "4ª fascia" },
    { value: "NA", label: "Fascia non agonistica" },
    { value: "NONE", label: "Nessuna classifica" },
  ],
  TENNIS: [
    { value: "1", label: "1ª categoria" },
    { value: "2.1", label: "2.1" },
    { value: "4.NC", label: "4.NC" },
    { value: "NONE", label: "Nessuna classifica" },
  ],
};
const NO_AVAILABILITY = {
  currentFrequency: "2_3",
  daysPerWeek: null,
  sessionDurationMinutes: null,
  programDurationWeeks: null,
  preferredDays: [],
};

describe("Profilo come la demo PF10", () => {
  it("asks for availability and FIT ranking while they are empty", async () => {
    serve({
      "/auth/journey": journey(),
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": lesson,
      "/athlete/training/availability": NO_AVAILABILITY,
      "/athlete-journey/fit-ranking": {
        ranking: null,
        options: OPTIONS,
        recalculationPending: false,
      },
    });
    render(<ProfilePage />);
    expect(
      await screen.findByRole("link", { name: /Quale è la tua disponibilità/ }),
    ).toHaveAttribute("href", "/journey/profilo/disponibilita");
    expect(
      await screen.findByRole("link", { name: /La tua classifica FITP/ }),
    ).toHaveAttribute("href", "/journey/profilo/classifica");
    expect(screen.getAllByText("Da compilare")).toHaveLength(2);
    // Invito e community, sempre in fondo; niente calendario in calibrazione.
    expect(
      screen.getByRole("link", { name: /Invita un amico/ }),
    ).toHaveAttribute("href", "/journey/profilo/invita");
    expect(
      screen.getByRole("link", { name: /Unisciti alla community/ }),
    ).toHaveAttribute("href", "/journey/profilo/community");
    expect(
      screen.getByRole("link", { name: /Analisi delle sei aree/ }),
    ).toHaveAttribute("href", "/journey/calibrazione");
    expect(screen.queryByText(/La tua serie/)).toBeNull();
  });

  it("summarises saved availability and ranking, with Playtomic", async () => {
    serve({
      "/auth/journey": journey(),
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": lesson,
      "/athlete/training/availability": {
        ...NO_AVAILABILITY,
        daysPerWeek: 3,
        sessionDurationMinutes: 60,
        preferredDays: [1, 3, 5],
      },
      "/athlete-journey/fit-ranking": {
        ranking: {
          padelCurrent: "3",
          padelBest: "2",
          tennisCurrent: "NONE",
          tennisBest: "NONE",
          cardNumber: null,
          playtomicLevel: 2.75,
        },
        options: OPTIONS,
        recalculationPending: false,
      },
    });
    render(<ProfilePage />);
    const avail = await screen.findByRole("region", {
      name: "La tua disponibilità",
    });
    expect(within(avail).getByText("3")).toBeInTheDocument();
    expect(within(avail).getByText("60")).toBeInTheDocument();
    expect(within(avail).getByText("2–3/sett.")).toBeInTheDocument();
    const days = within(avail).getAllByRole("listitem");
    expect(days.map((d) => d.className === "is-on")).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
      false,
    ]);
    expect(
      within(avail).getByRole("link", { name: "Modifica la disponibilità" }),
    ).toHaveAttribute("href", "/journey/profilo/disponibilita");
    const fit = await screen.findByRole("region", {
      name: "La tua classifica FIT",
    });
    expect(within(fit).getByText("3ª fascia")).toBeInTheDocument();
    expect(within(fit).getByText("2,75")).toBeInTheDocument();
    expect(
      within(fit).getByText("Tessera FIT non indicata"),
    ).toBeInTheDocument();
  });

  it("draws defined areas solid and the others dashed", async () => {
    const drivers = evaluation.drivers.map((d, i) => ({
      ...d,
      confidence: [72, 64, 40][i],
    }));
    serve({
      "/auth/journey": journey({
        evaluation: { ...evaluation, drivers },
        calibration: calibration(null),
      }),
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": lesson,
    });
    const { container } = render(<ProfilePage />);
    expect(await screen.findByText("2 di 3 aree definite")).toBeInTheDocument();
    const edges = [...container.querySelectorAll(".pf-prof-hex-edge")];
    // Tecnico-Preparazione piena; i lati verso Mental (40) tratteggiati.
    expect(edges.map((e) => e.classList.contains("is-dashed"))).toEqual([
      false,
      true,
      true,
    ]);
    const rings = [...container.querySelectorAll(".pf-prof-ring")];
    expect(rings.map((r) => r.classList.contains("is-defined"))).toEqual([
      true,
      true,
      false,
    ]);
    // Margine come nella demo: si stringe con la confidenza.
    expect(screen.getByText("84 ±12")).toBeInTheDocument();
    expect(screen.getByText("86 ±6")).toBeInTheDocument();
  });

  it("shows the consolidated profile without the approximation", async () => {
    serve({
      "/auth/journey": journey({
        calibration: calibration(null, "FREE_LEVEL_ESTIMATED", {
          ruleMet: true,
          canFinish: true,
        }),
      }),
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": { ...lesson, phase: "DECLINED" },
    });
    render(<ProfilePage />);
    expect(await screen.findByText("Sufficientemente completo")).toBeVisible();
    expect(screen.getByText("83")).toBeInTheDocument();
  });

  it.each([
    [
      "locked",
      { ...lesson, phase: "LOCKED", credits: { balance: 40, toUnlock: 100 } },
      "Continua la calibrazione per sbloccarla.",
    ],
    [
      "requested",
      {
        ...lesson,
        phase: "REQUESTED",
        seat: {
          status: "REQUESTED",
          club: { name: "Padel Club Nord", city: "Milano" },
          preferredLessonId: null,
          lesson: null,
        },
      },
      "Richiesta inviata",
    ],
    [
      "without clubs",
      { ...lesson, clubs: [] },
      "Non ancora disponibile nella tua zona.",
    ],
  ])("turns calibration into the lesson when %s", async (_c, view, text) => {
    serve({
      "/auth/journey": journey({ calibration: calibration(null) }),
      "/athlete-journey/profile": PROFILE,
      "/athlete-journey/free-lesson": view,
    });
    render(<ProfilePage />);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});

describe("La tua disponibilità", () => {
  it("counts the chosen days and saves the profile entries", async () => {
    const calls = serve({
      "/athlete/training/availability": NO_AVAILABILITY,
    });
    render(<AvailabilityPage />);
    const save = await screen.findByRole("button", {
      name: /Salva disponibilità/,
    });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    expect(
      screen.getByText("Indica almeno giorni e minuti a sessione."),
    ).toBeVisible();
    for (const day of ["Lunedì", "Mercoledì", "Sabato"])
      await userEvent.click(screen.getByRole("button", { name: day }));
    expect(screen.getByText("giorni a settimana")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /^120\+/ }));
    await userEvent.click(save);
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/journey/profilo?esito=disponibilita"),
    );
    const post = calls.find((c) => Object.keys(c.body).length > 0)!;
    expect(post.body).toEqual({
      currentFrequency: "2_3",
      daysPerWeek: 3,
      sessionDurationMinutes: 120,
      preferredDays: [1, 3, 6],
    });
  });
});

describe("La tua classifica FITP", () => {
  const view = (ranking: unknown = null) => ({
    "/athlete-journey/fit-ranking": {
      ranking,
      options: OPTIONS,
      recalculationPending: false,
    },
  });

  it("saves padel, Playtomic, tennis and card together", async () => {
    const calls = serve(view());
    render(<RankingPage />);
    await screen.findByText("Classifica FIT di padel");
    const current = () => screen.getAllByRole("group", { name: "Attuale" });
    const best = () =>
      screen.getAllByRole("group", { name: "Migliore di sempre" });
    await userEvent.click(
      within(current()[0]).getByRole("button", { name: /3ª/ }),
    );
    await userEvent.click(
      within(best()[0]).getByRole("button", { name: /2ª/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^Intermedio\s*2,5/ }),
    );
    expect(screen.getByPlaceholderText("Es. 2,75")).toHaveValue("3");
    await userEvent.click(
      within(current()[1]).getByRole("button", { name: /nessuna/ }),
    );
    await userEvent.click(
      within(best()[1]).getByRole("button", { name: /nessuna/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Salva classifica/ }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/journey/profilo?esito=classifica"),
    );
    const post = calls.find((c) => Object.keys(c.body).length > 0)!;
    expect(post.body).toEqual({
      padelCurrent: "3",
      padelBest: "2",
      tennisCurrent: "NONE",
      tennisBest: "NONE",
      cardNumber: "",
      playtomicLevel: 3,
    });
  });

  it("refuses a Playtomic level outside 0-7", async () => {
    serve(
      view({
        padelCurrent: "3",
        padelBest: "3",
        tennisCurrent: "NONE",
        tennisBest: "NONE",
        cardNumber: null,
        playtomicLevel: null,
      }),
    );
    render(<RankingPage />);
    const input = await screen.findByPlaceholderText("Es. 2,75");
    await userEvent.type(input, "7,5");
    await userEvent.click(
      screen.getByRole("button", { name: /Salva classifica/ }),
    );
    expect(
      screen.getByText(
        "Il livello Playtomic va da 0 a 7, con al massimo due decimali.",
      ),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("Pagine finte del profilo", () => {
  it.each([
    ["invito", InvitePage],
    ["community", CommunityPage],
  ])("%s: only the back arrow works", async (_name, Page) => {
    serve({ "/athlete-journey/profile": PROFILE });
    render(<Page />);
    expect(screen.getByRole("link", { name: "Indietro" })).toHaveAttribute(
      "href",
      "/journey/profilo",
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    for (const button of screen.getAllByRole("button"))
      expect(button).toBeDisabled();
  });
});
