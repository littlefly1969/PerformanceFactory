"use client";
import { useEffect, useState } from "react";
import { API_BASE, secureFetch } from "../../lib/api";
import { athleteRequest } from "../_components/use-athlete";

type MarketingStatus = { granted: boolean };
type Referral = { code: string; link: string; invited: number };

/** Consenso marketing facoltativo: separato da quelli richiesti, revocabile. */
export function MarketingPreference() {
  const [status, setStatus] = useState<MarketingStatus>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    athleteRequest<MarketingStatus>("/consents/marketing")
      .then(setStatus)
      .catch(() => setMessage("Preferenza non disponibile."));
  }, []);
  async function change(granted: boolean) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await secureFetch(`${API_BASE}/consents/marketing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ granted }),
      });
      if (!response.ok) throw new Error();
      setStatus((await response.json()) as MarketingStatus);
      setMessage(granted ? "Consenso registrato." : "Consenso revocato.");
    } catch {
      setMessage("Non è stato possibile salvare. Riprova.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="pf4-athlete-section">
      <span className="pf4-kicker">Comunicazioni</span>
      {status && (
        <label className="pf4-check">
          <input
            type="checkbox"
            checked={status.granted}
            disabled={busy}
            onChange={(e) => void change(e.target.checked)}
          />{" "}
          Voglio ricevere novità, offerte e iniziative dei circoli partner
        </label>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

/** Link di invito personale, visibile solo con il flag `referral_share`. */
export function ReferralCard() {
  const [referral, setReferral] = useState<Referral>();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    athleteRequest<Record<string, boolean>>("/features/me")
      .then((flags) =>
        flags.referral_share
          ? athleteRequest<Referral>("/athlete/referral")
          : undefined,
      )
      .then((value) => {
        if (alive && value) setReferral(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (!referral) return null;
  return (
    <section className="pf4-athlete-section">
      <span className="pf4-kicker">Invita un amico</span>
      <h2>{referral.code}</h2>
      <p>
        Condividi il tuo link: chi si registra da qui resta collegato a te.
        {referral.invited > 0 &&
          ` Finora ${referral.invited === 1 ? "si è registrata 1 persona" : `si sono registrate ${referral.invited} persone`}.`}
      </p>
      <button
        type="button"
        className="pf4-text-link"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(referral.link)
            .then(() => setCopied(true))
            .catch(() => undefined);
        }}
      >
        {copied ? "Link copiato" : "Copia il link"}
      </button>
    </section>
  );
}
