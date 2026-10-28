import { createHmac, timingSafeEqual } from 'crypto';
import type { ResolvedPlace } from '../geo/places.service';

/** Una scelta vale per il salvataggio che la segue, non per sempre. */
const SELECTION_TTL_MS = 15 * 60 * 1000;

type Payload = ResolvedPlace & { sub: string; exp: number };

const secret = () => {
  const value = process.env.ACCESS_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!value && process.env.NODE_ENV === 'production')
    throw new Error('ACCESS_TOKEN_SECRET o SESSION_SECRET e obbligatorio');
  return value ?? 'dev-address-selection-secret';
};

const sign = (body: string) =>
  createHmac('sha256', `address-selection:${secret()}`)
    .update(body)
    .digest('base64url');

/**
 * Prova che l'indirizzo è un risultato ottenuto dal backend per questo
 * atleta: il browser lo riporta al salvataggio ma non può cambiarlo, perché
 * ogni campo, coordinate comprese, è coperto dalla firma.
 */
export function signSelection(
  userId: string,
  place: ResolvedPlace,
  now = Date.now(),
) {
  const body = Buffer.from(
    JSON.stringify({ ...place, sub: userId, exp: now + SELECTION_TTL_MS }),
  ).toString('base64url');
  return `${body}.${sign(body)}`;
}

/** L'indirizzo firmato, oppure null se scaduto, alterato o di un altro atleta. */
export function readSelection(
  userId: string,
  token: string,
  now = Date.now(),
): ResolvedPlace | null {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null;
  let payload: Payload;
  try {
    payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as Payload;
  } catch {
    return null;
  }
  if (payload.sub !== userId || !(payload.exp > now)) return null;
  return {
    placeId: payload.placeId,
    formattedAddress: payload.formattedAddress,
    street: payload.street,
    postalCode: payload.postalCode,
    city: payload.city,
    province: payload.province,
    latitude: payload.latitude,
    longitude: payload.longitude,
  };
}
