import { useEffect, useState } from "react";
import { RadarChart } from "../components/radar-chart";
import { API_BASE } from "../lib/api";
import type { ProgramHorizon, Scenarios } from "./journey-types";
import { confidenceLabel } from "./provisional-evaluation";

type Offer = {
  horizon: ProgramHorizon;
  billingOptions: {
    billingCycle: string;
    billingMonths: number;
    amountCents: number;
    currency: string;
  }[];
};

const CYCLES: Record<string, string> = {
  MONTHLY: "al mese",
  QUARTERLY: "ogni 3 mesi",
  SEMIANNUAL: "ogni 6 mesi",
  ANNUAL: "all'anno",
};

const price = (cents: number, currency: string) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(
    cents / 100,
  );

const round = (value: number) => Math.round(value);

/** Cadenze di pagamento compatibili con l'orizzonte scelto (offerta di #9). */
function HorizonOffer({ horizon }: { horizon: ProgramHorizon }) {
  const [offer, setOffer] = useState<Offer | null>();
  useEffect(() => {
    let active = true;
    void fetch(`${API_BASE}/payments/offers`)
      .then((r) => (r.ok ? r.json() : []))
      .then((offers: Offer[]) => {
        if (active) setOffer(offers.find((o) => o.horizon === horizon) ?? null);
      })
      .catch(() => active && setOffer(null));
    return () => {
      active = false;
    };
  }, [horizon]);
  if (offer === undefined) return null;
  if (!offer?.billingOptions.length)
    return <p>Le offerte per questo percorso non sono ancora disponibili.</p>;
  return (
    <ul className="pf4-offer" aria-label="Come pagare il percorso">
      {offer.billingOptions.map((o) => (
        <li key={o.billingCycle}>
          <strong>{price(o.amountCents, o.currency)}</strong>{" "}
          {CYCLES[o.billingCycle] ?? o.billingCycle}
        </li>
      ))}
    </ul>
  );
}

/**
 * Reveal a calibrazione chiusa: tre Spider R+P3, R+P6, R+P12 e la scelta del
 * percorso. La scelta porta all'offerta; il pagamento è il passo successivo.
 */
export function ScenariosReveal({
  scenarios,
  busy,
  onSelect,
}: {
  scenarios: Scenarios;
  busy: boolean;
  onSelect: (horizon: ProgramHorizon) => void;
}) {
  const selected = scenarios.selectedHorizon;
  return (
    <section
      className="pf4-body pf4-scenarios"
      aria-labelledby="pf4-scenarios-title"
    >
      <span className="pf4-kicker">I tuoi scenari</span>
      <h2 id="pf4-scenarios-title">Dove puoi arrivare in 3, 6 e 12 mesi.</h2>
      <p>
        Partiamo dalla tua R consolidata. Il potenziale cresce più in fretta
        all&apos;inizio e poi rallenta: dipende dal tuo livello, dal tuo impegno
        e dai giorni che puoi dedicare.
        {scenarios.engine.provisional &&
          " È una stima provvisoria, che affineremo con i dati dei tuoi allenamenti."}
      </p>
      <div className="pf4-scenario-grid">
        {scenarios.horizons.map((h) => (
          <article
            key={h.horizon}
            className={`pf4-scenario ${selected === h.horizon ? "is-selected" : ""}`}
            aria-label={`Scenario a ${h.months} mesi`}
          >
            <h3>
              P{h.months} · {h.months} mesi
            </h3>
            <RadarChart
              max={scenarios.scale.max}
              areas={h.drivers.map((d) => ({
                id: d.id,
                label: d.name,
                real: d.current,
                potential: d.potential,
              }))}
            />
            <ul>
              {h.drivers.map((d) => (
                <li key={d.id}>
                  {d.name}: {round(d.current)} →{" "}
                  <strong>{round(d.potential)}</strong>{" "}
                  <small>(affidabilità {confidenceLabel(d.confidence)})</small>
                </li>
              ))}
            </ul>
            <button
              className="pf4-cta"
              disabled={busy}
              aria-pressed={selected === h.horizon}
              onClick={() => onSelect(h.horizon)}
            >
              {selected === h.horizon
                ? "Percorso scelto"
                : `Scegli ${h.months} mesi →`}
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <div className="pf4-scenario-offer" role="status">
          <p>
            Hai scelto il percorso di{" "}
            {scenarios.horizons.find((h) => h.horizon === selected)?.months}{" "}
            mesi. Puoi cambiarlo finché non attivi l&apos;abbonamento.
          </p>
          <HorizonOffer horizon={selected} />
        </div>
      )}
    </section>
  );
}
