import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Coordinates, coordinatesOf } from './distance';
import type { PostalAddress } from './geocoding.service';

const BASE_URL = 'https://places.googleapis.com/v1';
const DEFAULT_TIMEOUT_MS = 4_000;
const MAX_SUGGESTIONS = 5;

/** Solo i campi che servono: ogni campo in più costa e va conservato. */
export const AUTOCOMPLETE_FIELD_MASK = [
  'suggestions.placePrediction.placeId',
  'suggestions.placePrediction.text.text',
  'suggestions.placePrediction.structuredFormat.mainText.text',
  'suggestions.placePrediction.structuredFormat.secondaryText.text',
].join(',');
export const DETAILS_FIELD_MASK =
  'id,formattedAddress,addressComponents,location';
export const LOCATION_FIELD_MASK = 'location';

export type PlaceSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string | null;
};

/** Parti che un indirizzo completo deve avere per essere salvato. */
export type AddressPart =
  | 'COUNTRY'
  | 'STREET'
  | 'STREET_NUMBER'
  | 'POSTAL_CODE'
  | 'CITY'
  | 'PROVINCE'
  | 'LOCATION';

export type ResolvedPlace = PostalAddress &
  Coordinates & { placeId: string; formattedAddress: string | null };

export type PlaceResolution =
  | { complete: true; place: ResolvedPlace }
  | {
      complete: false;
      missing: AddressPart[];
      formattedAddress: string | null;
    };

type Component = { longText?: string; shortText?: string; types?: string[] };

/** Corpo della richiesta Autocomplete (New): solo indirizzi in Italia. */
export function autocompleteRequest(input: string, sessionToken: string) {
  return {
    input,
    sessionToken,
    languageCode: 'it',
    regionCode: 'it',
    includedRegionCodes: ['it'],
    includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'route'],
  };
}

/** Suggerimenti leggibili dalla risposta Autocomplete, senza query/luoghi vuoti. */
export function readSuggestions(payload: unknown): PlaceSuggestion[] {
  const rows = (payload as { suggestions?: unknown[] } | null)?.suggestions;
  if (!Array.isArray(rows)) return [];
  const out: PlaceSuggestion[] = [];
  for (const row of rows) {
    const p = (
      row as {
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }
    ).placePrediction;
    const text = p?.text?.text?.trim();
    if (!p?.placeId || !text) continue;
    out.push({
      placeId: p.placeId,
      text,
      mainText: p.structuredFormat?.mainText?.text?.trim() || text,
      secondaryText: p.structuredFormat?.secondaryText?.text?.trim() || null,
    });
  }
  return out.slice(0, MAX_SUGGESTIONS);
}

/**
 * Indirizzo strutturato da Place Details (New). Non inventa nulla: un comune,
 * una via senza civico o un luogo senza CAP o provincia restano incompleti.
 */
export function readPlace(payload: unknown): PlaceResolution {
  const place = (payload ?? {}) as {
    id?: string;
    formattedAddress?: string;
    addressComponents?: Component[];
    location?: { latitude?: number; longitude?: number };
  };
  const components = Array.isArray(place.addressComponents)
    ? place.addressComponents
    : [];
  const part = (type: string) =>
    components.find((c) => c.types?.includes(type));
  const long = (type: string) => part(type)?.longText?.trim() || '';
  const short = (type: string) => part(type)?.shortText?.trim() || '';
  const route = long('route');
  const number = long('street_number');
  const postalCode = long('postal_code');
  const city =
    long('locality') ||
    long('administrative_area_level_3') ||
    long('postal_town');
  const province = short('administrative_area_level_2').toUpperCase();
  const location = coordinatesOf({
    latitude: Number(place.location?.latitude),
    longitude: Number(place.location?.longitude),
  });
  const missing: AddressPart[] = [];
  if (short('country').toUpperCase() !== 'IT') missing.push('COUNTRY');
  if (!route) missing.push('STREET');
  if (!number) missing.push('STREET_NUMBER');
  if (!/^\d{5}$/.test(postalCode)) missing.push('POSTAL_CODE');
  if (!city) missing.push('CITY');
  if (!/^[A-Z]{2}$/.test(province)) missing.push('PROVINCE');
  if (!location) missing.push('LOCATION');
  const formattedAddress = place.formattedAddress?.trim() || null;
  if (missing.length || !place.id || !location)
    return { complete: false, missing, formattedAddress };
  return {
    complete: true,
    place: {
      placeId: place.id,
      formattedAddress,
      street: `${route} ${number}`,
      postalCode,
      city,
      province,
      ...location,
    },
  };
}

/**
 * Google Places API (New), chiamata solo dal backend con la chiave
 * GOOGLE_PLACES_API_KEY: Autocomplete per i suggerimenti, Place Details per
 * risolvere la scelta. Senza chiave il servizio è spento e l'indirizzo si
 * scrive a mano come prima. Nessuna cache: ogni risposta serve alla sola
 * richiesta che l'ha chiesta. Nei log non finiscono testi né indirizzi.
 */
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  get configured() {
    if (process.env.GOOGLE_PLACES_ENABLED === 'false') return false;
    return !!process.env.GOOGLE_PLACES_API_KEY;
  }

  async suggest(input: string, sessionToken: string) {
    const payload = await this.call(
      'places:autocomplete',
      AUTOCOMPLETE_FIELD_MASK,
      {
        method: 'POST',
        body: JSON.stringify(autocompleteRequest(input, sessionToken)),
      },
    );
    return readSuggestions(payload);
  }

  /** Dettagli della scelta: lo stesso token chiude la sessione di ricerca. */
  async resolve(placeId: string, sessionToken: string) {
    const query = new URLSearchParams({
      sessionToken,
      languageCode: 'it',
      regionCode: 'it',
    });
    const payload = await this.call(
      `places/${encodeURIComponent(placeId)}?${query}`,
      DETAILS_FIELD_MASK,
    );
    return readPlace(payload);
  }

  /** Coordinate aggiornate di un luogo già scelto; null se non arrivano. */
  async locate(placeId: string): Promise<Coordinates | null> {
    try {
      const payload = (await this.call(
        `places/${encodeURIComponent(placeId)}`,
        LOCATION_FIELD_MASK,
      )) as { location?: { latitude?: number; longitude?: number } };
      return coordinatesOf({
        latitude: Number(payload?.location?.latitude),
        longitude: Number(payload?.location?.longitude),
      });
    } catch {
      return null;
    }
  }

  private async call(path: string, fieldMask: string, init: RequestInit = {}) {
    if (!this.configured)
      throw new ServiceUnavailableException(
        'Il servizio indirizzi non è attivo',
      );
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Number(process.env.GOOGLE_PLACES_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    );
    try {
      const response = await fetch(`${BASE_URL}/${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': process.env.GOOGLE_PLACES_API_KEY ?? '',
          'x-goog-fieldmask': fieldMask,
        },
      });
      if (!response.ok) {
        this.logger.warn(`Google Places ha risposto ${response.status}`);
        throw new Error('provider');
      }
      return (await response.json()) as unknown;
    } catch (error) {
      if (controller.signal.aborted)
        this.logger.warn('Google Places non ha risposto in tempo');
      else if (!(error instanceof Error && error.message === 'provider'))
        this.logger.warn('Google Places non raggiungibile');
      throw new ServiceUnavailableException(
        'Il servizio indirizzi non risponde. Riprova tra poco.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
