import type { IncomingMessage, ServerResponse } from 'http';

/** 30 giorni: l'app installata sulla Home non chiede il login ogni giorno. */
const DEFAULT_ATHLETE_SESSION_MS = 1000 * 60 * 60 * 24 * 30;

export type AthleteSession = {
  athlete?: boolean;
  athleteRefreshedOn?: string;
  cookie?: { maxAge?: number | null };
};

export function athleteSessionMaxAge() {
  const value = Number(process.env.ATHLETE_SESSION_MAX_AGE_MS);
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_ATHLETE_SESSION_MS;
}

const today = (now: Date) => now.toISOString().slice(0, 10);

/**
 * Solo l'atleta ha la sessione lunga: admin, professionisti e AI tuner restano
 * sulla durata standard (SESSION_MAX_AGE_MS).
 */
export function markAthleteSession(
  session: AthleteSession | undefined,
  now = new Date(),
) {
  if (!session) return;
  session.athlete = true;
  session.athleteRefreshedOn = today(now);
  if (session.cookie) session.cookie.maxAge = athleteSessionMaxAge();
}

/**
 * Sessione "rolling" una volta al giorno: la scadenza riparte dall'ultimo
 * utilizzo senza riscrivere lo store a ogni richiesta. Cambiare un campo della
 * sessione fa ri-emettere il cookie con la nuova scadenza.
 */
export function refreshAthleteSession(
  req: IncomingMessage & { session?: AthleteSession },
  _res: ServerResponse,
  next: () => void,
) {
  const session = req.session;
  if (session?.athlete && session.athleteRefreshedOn !== today(new Date()))
    markAthleteSession(session);
  next();
}
