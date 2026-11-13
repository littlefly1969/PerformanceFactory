"use client";
import { roundedRing } from "../../journey/profilo/_profile/profile-hex";
import { API_BASE, secureFetch } from "../../lib/api";

export type RankingBand = "PF1" | "PF2" | "PF3" | "PF4";

export type RankedView = {
  status: "RANKED";
  band: RankingBand;
  bandText: string;
  position: number;
  size: number;
  real: number;
  potential: number;
  horizon: "PROGRAM_3M" | "PROGRAM_6M" | "PROGRAM_12M";
  months: number;
  weights: { real: number; potential: number };
  board: {
    position: number;
    name: string;
    real: number;
    potential: number;
    me: boolean;
  }[];
  bands: {
    code: RankingBand;
    text: string;
    min: number;
    size: number;
    me: boolean;
  }[];
  example: {
    realFavoured: boolean;
    athletes: {
      name: string;
      real: number;
      potential: number;
      band: RankingBand;
    }[];
  } | null;
  /** Pop-up «Sei entrato in PFx»: alla prima fascia e a ogni cambio. */
  announce: boolean;
  /** Consenso a comparire con nome e iniziale. */
  visible: boolean;
};

export type RankingView =
  | RankedView
  | { status: "OFF" }
  | { status: "NOT_RANKED"; subscribed: boolean; visible: boolean };

export const RANKING_PATH = "/athlete/ranking";

/** «2.600»: i numeri come nella demo, con il punto delle migliaia. */
export const count = (n: number) => n.toLocaleString("it-IT");

/** Il pop-up della fascia è stato mostrato: non torna finché resta quella. */
export function markAnnounced(band: RankingBand) {
  return secureFetch(`${API_BASE}${RANKING_PATH}/announcement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ band }),
  }).catch(() => undefined);
}

const HEX = roundedRing(6, 94, 20);

/** Esagono pieno del codice di fascia, come il badge della demo. */
export function BandHex({ code, size }: { code: string; size: number }) {
  return (
    <span
      className="pf-rank-hex"
      style={
        {
          width: size,
          height: size,
          "--hex-size": `${size}px`,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 200">
        <path d={HEX} />
      </svg>
      <b>{code}</b>
    </span>
  );
}
