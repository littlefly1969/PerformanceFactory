"use client";
import { useCallback, useEffect, useState } from "react";
import { API_BASE, secureFetch } from "../../lib/api";
import type { Calibration } from "../journey-types";

/** Intestazione del profilo e sintesi globale di R, calcolata dal backend. */
export type AthleteProfile = {
  firstName: string | null;
  sport: string | null;
  experience: string | null;
  global: {
    value: number;
    low: number;
    high: number;
    confidence: number;
    provisional: boolean;
  } | null;
};

export type LessonSlot = {
  id: string;
  partnerId: string;
  startsAt: string;
  durationMinutes: number;
  seatsLeft: number;
};

/**
 * Circolo che offre la lezione: la distanza la calcola il browser dalla
 * posizione dell'atleta, solo se la concede; con CAP o città si filtra per
 * città.
 */
export type LessonClub = {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  location: { latitude: number; longitude: number } | null;
  /** Percorsi relativi alla base dell'API, versionati dal back office. */
  logoUrl: string | null;
  photoUrl: string | null;
  /**
   * Almeno una lezione in calendario con posti liberi: «Disponibile».
   * Altrimenti «Al completo» e il circolo non si sceglie (demo V11).
   */
  available: boolean;
};

export type FreeLessonView =
  | { enabled: false }
  | {
      enabled: true;
      phase:
        | "UNAVAILABLE"
        | "LOCKED"
        | "ELIGIBLE"
        | "DECLINED"
        | "REQUESTED"
        | "ASSIGNED"
        | "ATTENDED"
        | "NO_SHOW"
        | "CLOSED"
        /** Circoli che la offrono, ma tutti al completo: niente da scegliere né rifiutare. */
        | "FULL";
      missing: Array<"LEVEL" | "CONFIDENCE" | "PROFILE">;
      credits: { balance: number; toUnlock: number };
      clubs: LessonClub[];
      slots: LessonSlot[];
      attributedClubId: string | null;
      seat: {
        status: string;
        club: {
          id: string;
          name: string;
          city: string | null;
          logoUrl: string | null;
          photoUrl: string | null;
        };
        preferredLessonId: string | null;
        lesson: { startsAt: string; durationMinutes: number } | null;
      } | null;
    };

/** Video scelto dall'AI: senza indirizzo si mostra il titolo nel riquadro. */
export type ChosenVideo = { title: string; url: string | null };

export type MicroTestResult = {
  status: string;
  format: "PRACTICAL" | "SITUATIONAL";
  title: string;
  area: { id: string; name: string };
  confidence?: { before: number | null; after: number | null };
  correct?: number;
  total?: number;
  /** Prova pratica: l'esito scelto dall'atleta. */
  answer?: string | null;
  summary?: string;
  video?: ChosenVideo | null;
  /** Crediti del micro-test dal back office, mostrati come punti. */
  points?: number;
  /** Frase e consiglio scritti dall'AI per il livello raggiunto. */
  verdict?: string;
  takeaway?: string;
};

/** Filtri del micro-test: Teorici, Pratici sul campo, Pratici fuori dal campo. */
export type MicroTestFilter = "THEORY" | "ON_COURT" | "OFF_COURT";

type HomeMicroTestStatus =
  | "READY"
  | "PREPARING"
  | "EVALUATING"
  /** Il filtro ha usato i suoi micro-test di oggi. */
  | "DONE_TODAY";

export type HomeMicroTestReady = {
  roundId: string;
  filter?: MicroTestFilter;
  title: string;
  area: { id: string; name: string };
  durationMinutes: number | null;
  format: "PRACTICAL" | "SITUATIONAL";
  /** Punti che vale, dalla configurazione del back office. */
  points: number;
  round: NonNullable<Calibration["round"]>;
};

/**
 * Micro-test della home, fuori dal ciclo di calibrazione: uno pronto (o in
 * preparazione) per filtro, fino al limite del giorno, finché la fase
 * gratuita è aperta.
 */
export type HomeMicroTest = {
  /** Riepilogo per la home: il primo filtro con un test pronto. */
  status: HomeMicroTestStatus | "FAILED" | "UNAVAILABLE";
  test: HomeMicroTestReady | null;
  /** Giorni di fila con almeno un micro-test e la settimana da lunedì. */
  streak: { days: number; week: boolean[] };
  /** Stato di ciascun filtro, con i posti usati oggi; vuoto a fase chiusa. */
  filters?: {
    filter: MicroTestFilter;
    status: HomeMicroTestStatus;
    usedToday: number;
    limit: number;
    test: HomeMicroTestReady | null;
  }[];
  /** Micro-test già fatti, dal più recente, per filtro. */
  history: {
    roundId: string;
    filter?: MicroTestFilter;
    completedAt: string;
    title: string;
    points: number;
  }[];
};

export type SituationFeedback = {
  value: string;
  correct: boolean;
  correctValue: string;
  feedback: Record<string, string>;
};

/** Messaggio leggibile di una risposta di errore dell'API. */
export async function readError(response: Response) {
  return (await apiError(response)).message;
}

/** Errore dell'API con il suo codice, per i casi che la pagina recupera. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function apiError(response: Response) {
  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    code?: string;
  };
  return new ApiError(
    Array.isArray(data.message)
      ? data.message.join(". ")
      : (data.message ?? "Operazione non riuscita. Riprova."),
    data.code,
  );
}

/** Giorni e durata mancano: il checkout o il programma chiedono il passo. */
export const needsAvailability = (e: unknown) =>
  e instanceof ApiError && e.code === "AVAILABILITY_REQUIRED";

/** POST JSON all'API: restituisce il corpo o lancia con il messaggio. */
export async function postJson<T>(path: string, body: unknown = {}) {
  const response = await secureFetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as T;
}

/** Lettura di una risorsa dell'atleta; `reload` la richiede di nuovo. */
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>();
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!path) return;
    try {
      const response = await secureFetch(`${API_BASE}${path}`);
      if (!response.ok) throw new Error(await readError(response));
      setData((await response.json()) as T);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connessione non disponibile");
      setData(null);
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, reload: load, setData };
}

/** Foto del profilo, se l'atleta l'ha caricata nel benvenuto. */
export function useProfilePhoto() {
  const { data } = useResource<{ image?: string | null }>(
    "/athlete/profile/photo",
  );
  return data?.image ?? null;
}

/** Etichetta breve del driver per lo Spider. */
export const shortName = (name: string) =>
  name.replace(/\s+(atletica|training)$/i, "");

export const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${Math.round(value)}%`;
