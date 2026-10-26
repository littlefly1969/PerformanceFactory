import { Injectable, Logger } from '@nestjs/common';
import { Coordinates, coordinatesOf } from './distance';

/** Indirizzo da risolvere, nelle parti che l'atleta e l'admin scrivono. */
export type PostalAddress = {
  street: string;
  postalCode: string;
  city: string;
  province: string;
};

const DEFAULT_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_TIMEOUT_MS = 4_000;

/** Una riga di indirizzo sola, come la vuole un servizio di geocoding. */
export function addressQuery(address: PostalAddress) {
  return [
    address.street,
    `${address.postalCode} ${address.city}`.trim(),
    address.province,
    'Italia',
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

/** Prima risposta utile di un servizio in stile Nominatim. */
export function readCoordinates(payload: unknown): Coordinates | null {
  const first = Array.isArray(payload) ? payload[0] : payload;
  if (!first || typeof first !== 'object') return null;
  const row = first as { lat?: unknown; lon?: unknown };
  return coordinatesOf({
    latitude: Number(row.lat),
    longitude: Number(row.lon),
  });
}

/**
 * Risolve un indirizzo in coordinate con un servizio esterno, configurabile
 * con GEOCODING_URL. Non e un passo obbligatorio: se il servizio non e
 * configurato, non risponde o non trova l'indirizzo, restituisce null e chi
 * chiama lascia le coordinate vuote. Nessun errore arriva all'utente: senza
 * coordinate la distanza si dichiara non calcolabile.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  /**
   * Acceso per difetto, spegnibile con GEOCODING_ENABLED=false. Nei test
   * resta spento finche non lo si chiede: nessuna suite chiama un servizio
   * esterno senza dirlo.
   */
  get configured() {
    const flag = process.env.GEOCODING_ENABLED;
    if (flag) return flag !== 'false';
    return process.env.NODE_ENV !== 'test';
  }

  async locate(address: PostalAddress): Promise<Coordinates | null> {
    if (!this.configured) return null;
    const url = new URL(process.env.GEOCODING_URL || DEFAULT_URL);
    url.searchParams.set('q', addressQuery(address));
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'it');
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Number(process.env.GEOCODING_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    );
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent':
            process.env.GEOCODING_USER_AGENT ||
            'PerformanceFactory/1.0 (+https://performancefactory.littlefly.it)',
        },
      });
      if (!response.ok) return null;
      return readCoordinates(await response.json());
    } catch (error) {
      this.logger.warn(
        `Geocoding non disponibile: ${error instanceof Error ? error.message : 'errore'}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
