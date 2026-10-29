"use client";
import { useEffect } from "react";
import { useJourney } from "../use-journey";
import type { Calibration, Journey } from "../journey-types";

/** R consolidata: la calibrazione è chiusa e gli scenari sono il passo dopo. */
export const isClosed = (c: Calibration | null | undefined) =>
  c?.status === "CALIBRATION_COMPLETED" || c?.status === "PAYWALL_READY";

/** R consolidata: regola soddisfatta, a calibrazione aperta o chiusa. */
export const isConsolidated = (c: Calibration | null | undefined) =>
  !!c?.ruleMet || (isClosed(c) && c?.completionReason !== "DEADLINE_REACHED");

/** Chiusa dalla scadenza senza R consolidata: la stima resta poco affidabile. */
export const closedUnconsolidated = (c: Calibration | null | undefined) =>
  isClosed(c) && c?.completionReason === "DEADLINE_REACHED" && !c.ruleMet;

/** C'è un micro-test proposto dall'AI che aspetta l'atleta. */
export const microTestOpen = (c: Calibration | null | undefined) =>
  c?.round?.action === "PROPOSE_MICRO_TEST" && c.round.status === "OPEN";

/** Fasi servite dalle pagine dell'area atleta gratuita. */
const ACCOUNT_PHASES: Journey["phase"][] = [
  "ASSESSMENT_INTRO",
  "ASSESSMENT_UNAVAILABLE",
  "ASSESSMENT",
  "PROCESSING",
  "EVALUATION",
];

/**
 * Il percorso per le pagine dell'area atleta: consensi, benvenuto e fasi
 * dopo l'abbonamento restano su /journey, che sa dove portare l'atleta.
 */
export function useAccountJourney() {
  const journey = useJourney();
  const j = journey.journey;
  const elsewhere =
    !!j &&
    (!ACCOUNT_PHASES.includes(j.phase) ||
      (j.phase === "ASSESSMENT_INTRO" && !j.welcomeCompleted));
  useEffect(() => {
    if (elsewhere) window.location.replace("/journey");
  }, [elsewhere]);
  return journey;
}
