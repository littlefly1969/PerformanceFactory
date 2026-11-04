import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClubPage from "./page";
import { journey, lesson, serve } from "../_account/account-fixtures";
import { calendarFile } from "./lesson-booked";

vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
  signOut: () => fetch("/api/auth/logout", { method: "POST" }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const slots = [
  {
    id: "l1",
    partnerId: "c1",
    startsAt: "2026-10-27T18:00:00",
    durationMinutes: 60,
    seatsLeft: 2,
  },
  {
    id: "l2",
    partnerId: "c1",
    startsAt: "2026-10-28T19:00:00",
    durationMinutes: 60,
    seatsLeft: 3,
  },
  {
    id: "l3",
    partnerId: "c1",
    startsAt: "2026-10-28T20:00:00",
    durationMinutes: 60,
    seatsLeft: 1,
  },
];

const requested = (lessonId: string | null) => ({
  ...lesson,
  slots,
  phase: "REQUESTED",
  seat: {
    status: "REQUESTED",
    club: {
      id: "c1",
      name: "Padel Club Nord",
      city: "Milano",
      logoUrl: null,
      photoUrl: null,
    },
    preferredLessonId: lessonId,
    lesson: null,
  },
});

const typeArea = async (text: string) => {
  expect(
    await screen.findByRole("heading", { name: "Dove sei?" }),
  ).toBeInTheDocument();
  await userEvent.type(
    screen.getByRole("textbox", { name: "CAP o città" }),
    text,
  );
};

describe("Lezione gratuita: dove sei", () => {
  it("with a CAP shows the clubs of that city, without km, and books without the coach consent", async () => {
    const calls = serve({
      "/auth/journey": journey(),
      "/area/suggestions": {
        suggestions: [
          {
            placeId: null,
            main: "65121",
            secondary: "Pescara",
            area: { city: "Pescara", postalCode: "65121", province: "PE" },
          },
        ],
      },
      "/free-lesson/request": requested(null),
      "/athlete-journey/free-lesson": { ...lesson, slots },
    });
    render(<ClubPage />);
    await typeArea("651");
    await userEvent.click(await screen.findByRole("button", { name: /65121/ }));

    expect(
      await screen.findByRole("heading", { name: "Dove giochi?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("65121 · Pescara")).toBeInTheDocument();
    const cards = within(screen.getByRole("radiogroup", { name: "Circolo" }));
    expect(cards.getAllByRole("radio")).toHaveLength(1);
    expect(
      cards.getByRole("radio", { name: "Padel Pescara, Pescara" }),
    ).toBeTruthy();
    expect(screen.queryByText(/km/)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Gioco qui/ }));
    expect(
      screen.getByRole("heading", { name: "Quando?" }),
    ).toBeInTheDocument();
    // Niente consenso da spuntare: è nell'informativa accettata all'inizio.
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(/non ha ancora pubblicato le date/)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: /Prenota il posto/ }),
    );
    await waitFor(() =>
      expect(
        calls.find((c) => c.url.endsWith("/free-lesson/request"))?.body,
      ).toEqual({ partnerId: "c3" }),
    );
  });

  it("resolves a Google suggestion and lets the athlete pick day and time", async () => {
    const calls = serve({
      "/auth/journey": journey(),
      "/area/suggestions": {
        suggestions: [
          {
            placeId: "place-milano",
            main: "Milano",
            secondary: "MI, Italia",
            area: null,
          },
        ],
      },
      "/area/resolve": {
        area: { city: "Milano", postalCode: null, province: "MI" },
      },
      "/free-lesson/request": requested("l3"),
      "/athlete-journey/free-lesson": { ...lesson, slots },
    });
    render(<ClubPage />);
    await typeArea("Mila");
    await userEvent.click(
      await screen.findByRole("button", { name: /Milano/ }),
    );
    await screen.findByRole("heading", { name: "Dove giochi?" });
    const resolve = calls.find((c) => c.url.endsWith("/area/resolve"));
    const suggest = calls.find((c) => c.url.endsWith("/area/suggestions"));
    expect(resolve?.body.placeId).toBe("place-milano");
    // Stessa sessione di ricerca per suggerimenti e scelta.
    expect(resolve?.body.sessionToken).toBe(suggest?.body.sessionToken);
    expect(screen.getAllByRole("radio")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: /Gioco qui/ }));
    const book = screen.getByRole("button", { name: /Prenota il posto/ });
    expect(book).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: /28/ }));
    await userEvent.click(screen.getByRole("radio", { name: "20:00" }));
    expect(screen.getByText("Gruppo di 4 · 1 ora")).toBeInTheDocument();
    await userEvent.click(book);
    await waitFor(() =>
      expect(
        calls.find((c) => c.url.endsWith("/free-lesson/request"))?.body,
      ).toEqual({ partnerId: "c1", lessonId: "l3" }),
    );
    // Richiesta, non posto confermato: giorno e ora scelti, niente «Ci vediamo».
    expect(
      await screen.findByRole("heading", { name: "Richiesta inviata." }),
    ).toBeInTheDocument();
    expect(screen.getByText("20:00")).toBeInTheDocument();
    expect(screen.queryByText("Ci vediamo in campo.")).toBeNull();
  });

  it("with the position orders the clubs by distance and shows the km", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: { latitude: 45.452, longitude: 9.175 },
          } as GeolocationPosition),
      },
    });
    serve({
      "/auth/journey": journey(),
      "/athlete-journey/free-lesson": { ...lesson, slots },
    });
    render(<ClubPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Usa la mia posizione/ }),
    );
    expect(await screen.findByText("Vicino a te")).toBeInTheDocument();
    const names = screen
      .getAllByRole("radio")
      .map((r) => r.getAttribute("aria-label"));
    expect(names[0]).toMatch(/^Circolo Navigli, 0,\d km$/);
    expect(names[1]).toMatch(/^Padel Club Nord, \d+,\d km$/);
    // Senza coordinate il circolo resta in fondo, con la sua città.
    expect(names[2]).toBe("Padel Pescara, Pescara");
  });

  it("asks for CAP or city when the position is not allowed", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (
          _ok: PositionCallback,
          ko: PositionErrorCallback,
        ) => ko({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
      },
    });
    serve({
      "/auth/journey": journey(),
      "/athlete-journey/free-lesson": lesson,
    });
    render(<ClubPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Usa la mia posizione/ }),
    );
    expect(
      await screen.findByText("Posizione non consentita: scrivi CAP o città."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dove sei?" })).toBeTruthy();
  });

  it("does not show the address anywhere", async () => {
    serve({
      "/auth/journey": journey(),
      "/athlete-journey/free-lesson": lesson,
    });
    render(<ClubPage />);
    await screen.findByRole("heading", { name: "Dove sei?" });
    expect(screen.queryByText(/indirizzo/i)).toBeNull();
  });
});

describe("Lezione gratuita: prenotazione", () => {
  it("says «Ci vediamo in campo» only for a seat the club confirmed", async () => {
    serve({
      "/auth/journey": journey(),
      "/athlete-journey/free-lesson": {
        ...requested("l1"),
        phase: "ASSIGNED",
        seat: {
          ...requested("l1").seat,
          status: "ASSIGNED",
          lesson: { startsAt: "2026-10-27T18:00:00", durationMinutes: 60 },
        },
      },
    });
    render(<ClubPage />);
    expect(
      await screen.findByRole("heading", { name: "Ci vediamo in campo." }),
    ).toBeInTheDocument();
    expect(screen.getByText("18:00")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Aggiungi al calendario/ }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Modifica" }));
    // Posto confermato: si può solo annullare.
    expect(screen.queryByRole("button", { name: /Cambia circolo/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Annulla la prenotazione/ }),
    ).toBeInTheDocument();
  });

  it("changes a request from the sheet, starting again from «Dove sei?»", async () => {
    serve({
      "/auth/journey": journey(),
      "/athlete-journey/free-lesson": requested("l1"),
    });
    render(<ClubPage />);
    await screen.findByRole("heading", { name: "Richiesta inviata." });
    await userEvent.click(screen.getByRole("button", { name: "Modifica" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Cambia circolo o orario/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "Dove sei?" }),
    ).toBeInTheDocument();
  });

  it("withdraws only after confirming in the sheet", async () => {
    const calls = serve({
      "/auth/journey": journey(),
      "/free-lesson/withdraw": { ...lesson, slots },
      "/athlete-journey/free-lesson": requested("l1"),
    });
    render(<ClubPage />);
    await screen.findByRole("heading", { name: "Richiesta inviata." });
    await userEvent.click(screen.getByRole("button", { name: "Modifica" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Annulla la prenotazione/ }),
    );
    expect(calls.some((c) => c.url.endsWith("/withdraw"))).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Sì, annulla" }));
    expect(
      await screen.findByRole("heading", { name: "Dove sei?" }),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith("/withdraw"))).toBe(true);
  });
});

describe("calendarFile", () => {
  it("describes the confirmed lesson as an iCalendar event", () => {
    const ics = calendarFile(
      { name: "Padel Club Nord", city: "Milano" },
      { startsAt: "2026-10-27T17:00:00.000Z", durationMinutes: 60 },
    );
    expect(ics).toContain("DTSTART:20261027T170000Z");
    expect(ics).toContain("DTEND:20261027T180000Z");
    expect(ics).toContain("SUMMARY:Lezione gratuita · Padel Club Nord");
    expect(ics).toContain("LOCATION:Padel Club Nord\\, Milano");
  });
});
