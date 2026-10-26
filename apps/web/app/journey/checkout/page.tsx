"use client";
import { useEffect, useState } from "react";
import { API_BASE, secureFetch } from "../../lib/api";
import type { ProgramHorizon } from "../journey-types";
import { readError } from "../_account/account-data";
import {
  AccountScreen,
  AccountTopBar,
  PillButton,
  PillLink,
} from "../_account/account-shell";
import { useAccountJourney } from "../_account/calibration-state";
import { HORIZON_MONTHS } from "../_account/scenario-values";

type Offer = {
  horizon: ProgramHorizon;
  billingOptions: {
    billingCycle: string;
    billingMonths: number;
    amountCents: number;
    currency: string;
  }[];
};

const CYCLES: Record<string, [string, string, string]> = {
  MONTHLY: ["Pagamento mensile", "Addebito ogni mese", "mese"],
  QUARTERLY: ["Pagamento trimestrale", "Addebito ogni 3 mesi", "3 mesi"],
  SEMIANNUAL: ["Pagamento semestrale", "Addebito ogni 6 mesi", "6 mesi"],
  ANNUAL: ["Pagamento annuale", "Addebito ogni anno", "anno"],
};

const price = (cents: number, currency: string) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(
    cents / 100,
  );

const HORIZONS: ProgramHorizon[] = ["PROGRAM_3M", "PROGRAM_6M", "PROGRAM_12M"];

/**
 * Checkout: durata del programma e cadenza di pagamento sono due scelte
 * diverse (A5). Le cadenze di ogni durata e i prezzi vengono dal back office;
 * il pagamento si conclude nella pagina sicura del fornitore.
 */
export default function CheckoutPage() {
  const { journey: j, busy, error, action } = useAccountJourney();
  const s = j?.scenarios?.status === "READY" ? j.scenarios : null;
  const horizon = s?.selectedHorizon ?? null;
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [cycle, setCycle] = useState("");
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    void fetch(`${API_BASE}/payments/offers`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Offer[]) => alive && setOffers(list))
      .catch(() => alive && setOffers([]));
    return () => {
      alive = false;
    };
  }, []);
  const options =
    offers?.find((o) => o.horizon === horizon)?.billingOptions ?? [];
  const shown = options.length > 0;
  useEffect(() => {
    if (!shown) return;
    void secureFetch(`${API_BASE}/athlete-journey/paywall/viewed`, {
      method: "POST",
    }).catch(() => undefined);
  }, [shown]);
  const chosen = options.some((o) => o.billingCycle === cycle) ? cycle : "";
  const pay = async () => {
    setPaying(true);
    setMessage("");
    try {
      const response = await secureFetch(`${API_BASE}/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizon, billingCycle: chosen }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as { checkoutUrl?: string };
      if (!body.checkoutUrl)
        throw new Error("Pagamento non disponibile, riprova.");
      window.location.assign(body.checkoutUrl);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Pagamento non disponibile.");
      setPaying(false);
    }
  };
  const top = <AccountTopBar title="Checkout" back="/journey/piano" />;
  if (!s || !horizon)
    return (
      <AccountScreen top={top}>
        <h1 className="pf-acc-title">Scegli prima il tuo orizzonte.</h1>
        <PillLink href="/journey/scenari">Vai agli scenari</PillLink>
      </AccountScreen>
    );
  return (
    <AccountScreen
      top={top}
      footer={
        <PillButton
          tone="lime"
          disabled={!chosen || paying || busy}
          onClick={() => void pay()}
        >
          {paying ? "Ti portiamo al pagamento…" : "Conferma e attiva"}
        </PillButton>
      }
    >
      <span className="pf-acc-kicker">1 · Programma</span>
      <h1 className="pf-acc-title is-small">
        Programma di {HORIZON_MONTHS[horizon]} mesi
      </h1>
      <div className="pf-acc-segment" role="radiogroup" aria-label="Durata">
        {HORIZONS.filter((h) => s.horizons.some((x) => x.horizon === h)).map(
          (h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={h === horizon}
              className={h === horizon ? "is-selected" : undefined}
              disabled={busy || paying}
              onClick={() => {
                if (h !== horizon) void action("horizon", { horizon: h });
              }}
            >
              {HORIZON_MONTHS[h]} mesi
            </button>
          ),
        )}
      </div>

      <span className="pf-acc-kicker">2 · Pagamento</span>
      <p>
        La durata del programma e la cadenza di pagamento sono due scelte
        diverse.
      </p>
      {offers && !shown && (
        <p className="pf-acc-muted">
          Le offerte per questo programma non sono ancora disponibili.
        </p>
      )}
      <div className="pf-acc-choices" role="radiogroup" aria-label="Cadenza">
        {options.map((o) => {
          const [title, note, per] = CYCLES[o.billingCycle] ?? [
            o.billingCycle,
            `Addebito ogni ${o.billingMonths} mesi`,
            `${o.billingMonths} mesi`,
          ];
          return (
            <button
              key={o.billingCycle}
              type="button"
              role="radio"
              aria-checked={o.billingCycle === chosen}
              className={`pf-acc-choice${o.billingCycle === chosen ? " is-selected" : ""}`}
              onClick={() => setCycle(o.billingCycle)}
            >
              <span>
                <b>{title}</b>
                <small>{note}</small>
              </span>
              <span>
                {price(o.amountCents, o.currency)} / {per}
              </span>
            </button>
          );
        })}
      </div>

      <span className="pf-acc-kicker">3 · Metodo di pagamento</span>
      <ul className="pf-acc-methods">
        <li>
          <b>Carta</b>
          <small>Nella pagina sicura</small>
        </li>
        <li>
          <b>Apple Pay e altri wallet</b>
          <small>Quando disponibili nella pagina sicura</small>
        </li>
      </ul>
      <p className="pf-acc-note">
        Il pagamento si conclude nella pagina sicura del fornitore. Rinnovo
        automatico, disdetta quando vuoi a fine periodo.
      </p>
      {(message || error) && (
        <p className="pf-acc-error" role="alert">
          {message || error}
        </p>
      )}
    </AccountScreen>
  );
}
