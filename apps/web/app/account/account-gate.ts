"use client";
import { useEffect, useState } from "react";
import { API_BASE, secureFetch } from "../lib/api";
import type { Journey } from "../journey/journey-types";
import { ACCOUNT_RETURNS, isAccountReturn } from "./account-links";

/** Fasi in cui l'atleta è abbonato: la sua home è l'area /user. */
const SUBSCRIBED: Journey["phase"][] = [
  "SUBSCRIBED",
  "RESULT",
  "DURATION",
  "COMPLETE",
];

/**
 * Accesso alle pagine dell'account: serve solo essere autenticati, aver dato
 * i consensi e aver aperto il benvenuto, che resta il primo inserimento. Non
 * dipende da abbonamento, programma o fase dell'assessment. Restituisce la
 * home dell'atleta, gratuita o abbonata, per i ritorni.
 */
export function useAccountGate() {
  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await secureFetch(`${API_BASE}/auth/journey`);
        if (response.status === 401 || response.status === 403) {
          window.location.replace("/login");
          return;
        }
        if (!response.ok) throw new Error();
        const j = (await response.json()) as Journey;
        if (
          j.phase === "CONSENTS" ||
          (j.phase === "ASSESSMENT_INTRO" && !j.welcomeCompleted)
        ) {
          window.location.replace("/journey");
          return;
        }
        if (alive) setHome(SUBSCRIBED.includes(j.phase) ? "/user" : "/journey");
      } catch {
        // Senza risposta sul percorso l'account resta usabile: le API
        // dell'atleta decidono comunque l'accesso.
        if (alive) setHome("/journey");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return home;
}

/**
 * Dove riportano Indietro e Fatto: la pagina chiamante se è fra quelle note,
 * altrimenti `fallback`. Mai un indirizzo arbitrario preso dall'URL.
 */
export function useAccountReturn(fallback: string | null) {
  const [from, setFrom] = useState<string | null>(null);
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("da");
    setFrom(isAccountReturn(key) ? key : null);
  }, []);
  const href = from
    ? ACCOUNT_RETURNS[from as keyof typeof ACCOUNT_RETURNS]
    : fallback;
  return { from, href };
}
