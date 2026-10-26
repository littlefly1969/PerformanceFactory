/** Raggio medio della Terra in chilometri. */
const EARTH_RADIUS_KM = 6371;

export type Coordinates = { latitude: number; longitude: number };

/** Coordinate complete e nella scala valida; altrimenti null. */
export function coordinatesOf(value: {
  latitude?: number | null;
  longitude?: number | null;
}): Coordinates | null {
  const { latitude, longitude } = value;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null;
  return { latitude, longitude };
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Distanza in linea d'aria fra due punti, in chilometri con un decimale
 * (formula dell'emisenoverso). Non e la distanza su strada: all'atleta si
 * mostra come un «circa».
 */
export function distanceKm(from: Coordinates, to: Coordinates) {
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLon / 2) ** 2;
  const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  return Math.round(km * 10) / 10;
}

/**
 * Distanza fra atleta e circolo, null quando mancano le coordinate di uno dei
 * due: il motivo lo dice chi mostra il dato, non questa funzione.
 */
export function distanceBetween(
  athlete: { latitude?: number | null; longitude?: number | null } | null,
  club: { latitude?: number | null; longitude?: number | null },
) {
  const from = athlete ? coordinatesOf(athlete) : null;
  const to = coordinatesOf(club);
  if (!from || !to) return null;
  return distanceKm(from, to);
}
