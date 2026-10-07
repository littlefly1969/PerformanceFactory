/**
 * Provenienza dell'atleta prima del login: un identificativo anonimo e le
 * sorgenti (utm, circolo, referral) della prima e dell'ultima visita.
 * Tutto vive nel localStorage del browser; se non è disponibile la
 * registrazione prosegue senza attribuzione.
 *
 * Ciclo di vita: i dati valgono ATTRIBUTION_TTL_DAYS giorni dall'ultima
 * scrittura e si azzerano appena un account si registra o accede, così una
 * seconda persona sullo stesso browser non eredita id, campagna, circolo o
 * referral della prima.
 */
export type Touch = {
  source?: string;
  medium?: string;
  campaign?: string;
  club?: string;
  ref?: string;
  landingPath?: string;
  at?: string;
};

export type Attribution = {
  anonymousId?: string;
  firstTouch?: Touch;
  lastTouch?: Touch;
};

const ANONYMOUS_KEY = "pf.anonymousId";
const ANONYMOUS_AT_KEY = "pf.anonymousIdAt";
const FIRST_KEY = "pf.firstTouch";
const LAST_KEY = "pf.lastTouch";
const KEYS = [ANONYMOUS_KEY, ANONYMOUS_AT_KEY, FIRST_KEY, LAST_KEY];
export const ATTRIBUTION_TTL_DAYS = 30;
const TTL_MS = ATTRIBUTION_TTL_DAYS * 24 * 60 * 60 * 1000;

const expired = (at: string | null | undefined, now: Date) => {
  const time = at ? Date.parse(at) : NaN;
  return !Number.isFinite(time) || now.getTime() - time > TTL_MS;
};
const PARAMS = {
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "campaign",
  club: "club",
  ref: "ref",
} as const;

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readTouch(key: string, now = new Date()): Touch | undefined {
  try {
    const store = storage();
    const raw = store?.getItem(key);
    const value = raw ? (JSON.parse(raw) as unknown) : null;
    if (!value || typeof value !== "object" || Array.isArray(value))
      return undefined;
    const touch = value as Touch;
    if (expired(touch.at, now)) {
      store?.removeItem(key);
      return undefined;
    }
    return touch;
  } catch {
    return undefined;
  }
}

/** Azzera id anonimo e sorgenti: dopo registrazione o accesso non servono più. */
export function clearAttribution() {
  const store = storage();
  try {
    for (const key of KEYS) store?.removeItem(key);
  } catch {
    /* Niente da azzerare. */
  }
}

export function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Identificativo anonimo stabile nel browser per ATTRIBUTION_TTL_DAYS giorni
 * dall'ultimo uso, o null se non salvabile.
 */
export function anonymousId(now = new Date()): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const existing = store.getItem(ANONYMOUS_KEY);
    const id =
      existing && !expired(store.getItem(ANONYMOUS_AT_KEY), now)
        ? existing
        : newId();
    store.setItem(ANONYMOUS_KEY, id);
    store.setItem(ANONYMOUS_AT_KEY, now.toISOString());
    return id;
  } catch {
    return null;
  }
}

/** Legge utm, circolo e referral dall'URL; null se la visita è diretta. */
export function touchFromUrl(url: URL, now = new Date()): Touch | null {
  const touch: Touch = {};
  for (const [param, field] of Object.entries(PARAMS)) {
    const value = url.searchParams.get(param)?.trim();
    if (value) touch[field] = value.slice(0, 100);
  }
  if (!Object.keys(touch).length) return null;
  return { ...touch, landingPath: url.pathname, at: now.toISOString() };
}

/**
 * Registra la visita: la prima sorgente non si sovrascrive mai, l'ultima
 * sì. Le visite dirette non cancellano una sorgente già nota.
 */
export function captureTouch(url: URL, now = new Date()) {
  const touch = touchFromUrl(url, now);
  const store = storage();
  if (!touch || !store) return;
  try {
    if (!readTouch(FIRST_KEY, now))
      store.setItem(FIRST_KEY, JSON.stringify(touch));
    store.setItem(LAST_KEY, JSON.stringify(touch));
  } catch {
    /* Senza storage la registrazione resta diretta. */
  }
}

export function currentAttribution(now = new Date()): Attribution {
  const attribution: Attribution = {};
  const id = anonymousId(now);
  if (id) attribution.anonymousId = id;
  const first = readTouch(FIRST_KEY, now);
  const last = readTouch(LAST_KEY, now);
  if (first) attribution.firstTouch = first;
  if (last) attribution.lastTouch = last;
  return attribution;
}
