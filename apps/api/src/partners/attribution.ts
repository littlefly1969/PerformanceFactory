/**
 * Provenienza dell'atleta, ricostruita da A2/A4/A5/A7 in assenza di A6:
 * sorgente, campagna, circolo (QR/link) e referral accompagnano l'utente dalla
 * prima visita alla registrazione. Si conservano prima e ultima sorgente.
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

export type AttributionInput = {
  anonymousId?: string;
  firstTouch?: unknown;
  lastTouch?: unknown;
};

const TEXT_FIELDS = ['source', 'medium', 'campaign'] as const;
const CODE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const TEXT = /^[\p{L}\p{N} ._\-+/]{1,100}$/u;

export function normalizeCode(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const code = value.trim().toLowerCase();
  return CODE.test(code) ? code : undefined;
}

/** Tiene solo campi noti e valori brevi; tutto il resto viene scartato. */
export function sanitizeTouch(value: unknown, now = new Date()): Touch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const touch: Touch = {};
  for (const field of TEXT_FIELDS) {
    const text = typeof raw[field] === 'string' ? raw[field].trim() : '';
    if (text && TEXT.test(text)) touch[field] = text;
  }
  const club = normalizeCode(raw.club);
  if (club) touch.club = club;
  const ref = normalizeCode(raw.ref);
  if (ref) touch.ref = ref;
  if (
    typeof raw.landingPath === 'string' &&
    raw.landingPath.startsWith('/') &&
    raw.landingPath.length <= 200
  )
    touch.landingPath = raw.landingPath.split('?')[0];
  if (typeof raw.at === 'string') {
    const at = new Date(raw.at);
    if (!Number.isNaN(at.getTime()) && at.getTime() <= now.getTime() + 60_000)
      touch.at = at.toISOString();
  }
  return Object.keys(touch).length ? touch : null;
}

/** Un utente senza tracce arriva in modo diretto: lo si registra comunque. */
export const DIRECT_TOUCH: Touch = { source: 'direct' };

/**
 * Circolo e referrer valgono dalla prima sorgente che li porta; se la prima
 * non li ha, si usa l'ultima. Regola proposta, da confermare con A6.
 */
export function attributedCodes(first: Touch, last: Touch) {
  return {
    club: first.club ?? last.club,
    ref: first.ref ?? last.ref,
  };
}
