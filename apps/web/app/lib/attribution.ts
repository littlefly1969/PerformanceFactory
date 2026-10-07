/**
 * Provenienza dell'atleta prima del login: un identificativo anonimo e le
 * sorgenti (utm, circolo, referral) della prima e dell'ultima visita.
 * Tutto vive nel localStorage del browser; se non è disponibile la
 * registrazione prosegue senza attribuzione.
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
const FIRST_KEY = "pf.firstTouch";
const LAST_KEY = "pf.lastTouch";
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

function readTouch(key: string): Touch | undefined {
  try {
    const raw = storage()?.getItem(key);
    const value = raw ? (JSON.parse(raw) as unknown) : null;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Touch)
      : undefined;
  } catch {
    return undefined;
  }
}

function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Identificativo anonimo stabile nel browser, o null se non salvabile. */
export function anonymousId(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const existing = store.getItem(ANONYMOUS_KEY);
    if (existing) return existing;
    const id = newId();
    store.setItem(ANONYMOUS_KEY, id);
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
    if (!readTouch(FIRST_KEY)) store.setItem(FIRST_KEY, JSON.stringify(touch));
    store.setItem(LAST_KEY, JSON.stringify(touch));
  } catch {
    /* Senza storage la registrazione resta diretta. */
  }
}

export function currentAttribution(): Attribution {
  const attribution: Attribution = {};
  const id = anonymousId();
  if (id) attribution.anonymousId = id;
  const first = readTouch(FIRST_KEY);
  const last = readTouch(LAST_KEY);
  if (first) attribution.firstTouch = first;
  if (last) attribution.lastTouch = last;
  return attribution;
}
