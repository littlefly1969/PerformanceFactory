"use client";
import { useCallback, useEffect, useState } from "react";
import { API_BASE, secureFetch } from "../../lib/api";

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
        | "CLOSED";
      missing: Array<"LEVEL" | "CONFIDENCE" | "PROFILE">;
      credits: { balance: number; toUnlock: number };
      clubs: {
        id: string;
        name: string;
        city: string | null;
        /** Distanza in linea d'aria, null se non si può calcolare. */
        distanceKm: number | null;
      }[];
      /** Senza distanza il motivo: manca l'indirizzo o non è riconosciuto. */
      distance: {
        available: boolean;
        reason: "NO_ADDRESS" | "ADDRESS_NOT_LOCATED" | null;
      };
      slots: LessonSlot[];
      attributedClubId: string | null;
      seat: {
        status: string;
        club: { name: string; city: string | null };
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
  summary?: string;
  video?: ChosenVideo | null;
};

export type SituationFeedback = {
  value: string;
  correct: boolean;
  correctValue: string;
  feedback: Record<string, string>;
};

/** Messaggio leggibile di una risposta di errore dell'API. */
export async function readError(response: Response) {
  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  return Array.isArray(data.message)
    ? data.message.join(". ")
    : (data.message ?? "Operazione non riuscita. Riprova.");
}

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
