import type { LessonClub } from "../_account/account-data";

export type Coordinates = { latitude: number; longitude: number };

/** Zona scritta dall'atleta (CAP o città), risolta nella sua città. */
export type Area = {
  city: string;
  postalCode: string | null;
  province: string | null;
};

/**
 * Da dove cerca l'atleta: la posizione del telefono (precisa, con i km) o
 * una zona (i circoli di quella città, senza km).
 */
export type Place =
  | { kind: "position"; coords: Coordinates }
  | { kind: "area"; area: Area };

export type PlacedClub = LessonClub & {
  /** Distanza in linea d'aria, solo con la posizione. */
  distanceKm: number | null;
};

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Distanza in linea d'aria, in km con un decimale (come il backend). */
export function distanceKm(from: Coordinates, to: Coordinates) {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLon / 2) ** 2;
  const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  return Math.round(km * 10) / 10;
}

/** Confronto di nomi di città senza maiuscole, accenti e apostrofi tipografici. */
export const sameText = (a: string | null, b: string | null) =>
  !!a && !!b && normalize(a) === normalize(b);

export const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** «2,4 km» all'italiana. */
export const kmLabel = (km: number) =>
  `${km.toLocaleString("it-IT", { maximumFractionDigits: 1 })} km`;

export type ClubSearch = {
  clubs: PlacedClub[];
  /**
   * Quanto è largo il risultato: la città scelta, la sua provincia quando in
   * città non c'è nessun circolo, o tutti i circoli come ultima risorsa.
   */
  scope: "near" | "city" | "province" | "all";
};

/**
 * Circoli da mostrare per il luogo scelto. Con la posizione tutti, dal più
 * vicino (chi non ha coordinate in fondo); con una zona quelli della città,
 * poi della provincia, e se non ce n'è nessuno tutti, in ordine di nome.
 */
export function clubsFor(clubs: LessonClub[], place: Place): ClubSearch {
  if (place.kind === "position") {
    const placed = clubs.map((club) => ({
      ...club,
      distanceKm: club.location
        ? distanceKm(place.coords, club.location)
        : null,
    }));
    placed.sort(
      (a, b) =>
        (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) ||
        a.name.localeCompare(b.name, "it"),
    );
    return { clubs: placed, scope: "near" };
  }
  const plain = clubs.map((club) => ({ ...club, distanceKm: null }));
  const { area } = place;
  const city = plain.filter((club) => sameText(club.city, area.city));
  if (city.length) return { clubs: city, scope: "city" };
  const province = area.province
    ? plain.filter((club) => sameText(club.province, area.province))
    : [];
  if (province.length) return { clubs: province, scope: "province" };
  return { clubs: plain, scope: "all" };
}

/** Etichetta del luogo scelto, nella pillola sopra i circoli. */
export const placeLabel = (place: Place) =>
  place.kind === "position"
    ? "Vicino a te"
    : [place.area.postalCode, place.area.city].filter(Boolean).join(" · ");
