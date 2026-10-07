import { BadRequestException } from '@nestjs/common';

/**
 * Eventi che il browser puo inviare prima della registrazione (A7.9, A6-D4
 * ricostruito). Gli eventi dopo il login li emette il server.
 */
export const CLIENT_EVENTS = [
  'landing_viewed',
  'discovery_started',
  'discovery_completed',
  'registration_started',
] as const;

export const SERVER_EVENTS = ['registration_completed'] as const;

export type ClientEventName = (typeof CLIENT_EVENTS)[number];
export type AnalyticsEventName =
  | ClientEventName
  | (typeof SERVER_EVENTS)[number];

export type EventProperties = Record<string, string | number | boolean>;

const MAX_PROPERTIES = 20;
const MAX_KEY = 40;
const MAX_VALUE = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROPERTY_KEY = /^[a-z][a-z0-9_]*$/;
/** Tolleranza sull'orologio del dispositivo e ritardo massimo di invio. */
const MAX_FUTURE_MS = 5 * 60 * 1000;
const MAX_PAST_MS = 7 * 24 * 60 * 60 * 1000;

export function assertAnonymousId(value: unknown) {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new BadRequestException('anonymousId non valido');
  return value.toLowerCase();
}

export function isAnonymousId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** Proprieta piatte e corte: niente oggetti annidati, niente testi lunghi. */
export function sanitizeProperties(value: unknown): EventProperties {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('properties deve essere un oggetto');
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_PROPERTIES)
    throw new BadRequestException('Troppe proprieta nell evento');
  const out: EventProperties = {};
  for (const [key, raw] of entries) {
    if (key.length > MAX_KEY || !PROPERTY_KEY.test(key))
      throw new BadRequestException(`Proprieta non valida: ${key}`);
    if (typeof raw === 'string') out[key] = raw.slice(0, MAX_VALUE);
    else if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
    else if (typeof raw === 'boolean') out[key] = raw;
    else throw new BadRequestException(`Valore non valido per ${key}`);
  }
  return out;
}

export function clientEventName(value: unknown): ClientEventName {
  if (!CLIENT_EVENTS.includes(value as ClientEventName))
    throw new BadRequestException('Evento non ammesso');
  return value as ClientEventName;
}

/** Ora dell'evento dal client, accettata solo in una finestra plausibile. */
export function eventTime(value: unknown, now = new Date()) {
  if (value === undefined) return now;
  const date = typeof value === 'string' ? new Date(value) : null;
  if (
    !date ||
    Number.isNaN(date.getTime()) ||
    date.getTime() > now.getTime() + MAX_FUTURE_MS ||
    date.getTime() < now.getTime() - MAX_PAST_MS
  )
    return now;
  return date;
}
