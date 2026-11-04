import { describe, expect, it } from "vitest";
import { clubsFor, distanceKm, kmLabel, placeLabel } from "./club-location";

const club = (
  id: string,
  city: string | null,
  province: string | null,
  location: { latitude: number; longitude: number } | null = null,
) => ({
  id,
  name: id,
  city,
  province,
  postalCode: null,
  location,
  logoUrl: null,
  photoUrl: null,
});

const clubs = [
  club("Aquilano", "L'Aquila", "AQ", { latitude: 42.35, longitude: 13.4 }),
  club("Pescara 1", "Pescara", "PE", { latitude: 42.46, longitude: 14.21 }),
  club("Montesilvano", "Montesilvano", "PE", {
    latitude: 42.51,
    longitude: 14.15,
  }),
  club("Senza sede", "Chieti", "CH"),
];

describe("clubsFor", () => {
  it("keeps the clubs of the city, ignoring case, accents and apostrophes", () => {
    const result = clubsFor(clubs, {
      kind: "area",
      area: { city: "l’aquilá", postalCode: "67100", province: "AQ" },
    });
    expect(result.scope).toBe("city");
    expect(result.clubs.map((c) => c.id)).toEqual(["Aquilano"]);
    expect(result.clubs[0]!.distanceKm).toBeNull();
  });

  it("falls back to the province, then to every club", () => {
    expect(
      clubsFor(clubs, {
        kind: "area",
        area: { city: "Spoltore", postalCode: "65010", province: "PE" },
      }),
    ).toMatchObject({
      scope: "province",
      clubs: [{ id: "Pescara 1" }, { id: "Montesilvano" }],
    });
    expect(
      clubsFor(clubs, {
        kind: "area",
        area: { city: "Roma", postalCode: null, province: null },
      }).scope,
    ).toBe("all");
  });

  it("orders by distance from the position, clubs without a place last", () => {
    const result = clubsFor(clubs, {
      kind: "position",
      coords: { latitude: 42.47, longitude: 14.2 },
    });
    expect(result.clubs.map((c) => c.id)).toEqual([
      "Pescara 1",
      "Montesilvano",
      "Aquilano",
      "Senza sede",
    ]);
    expect(result.clubs[3]!.distanceKm).toBeNull();
  });
});

describe("labels", () => {
  it("writes km the Italian way and names the place", () => {
    expect(kmLabel(2.4)).toBe("2,4 km");
    expect(
      distanceKm(
        { latitude: 42.3498, longitude: 13.3995 },
        { latitude: 42.4618, longitude: 14.2161 },
      ),
    ).toBeGreaterThan(65);
    expect(
      placeLabel({
        kind: "area",
        area: { city: "Pescara", postalCode: "65121", province: "PE" },
      }),
    ).toBe("65121 · Pescara");
    expect(
      placeLabel({ kind: "position", coords: { latitude: 0, longitude: 0 } }),
    ).toBe("Vicino a te");
  });
});
