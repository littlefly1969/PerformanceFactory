"use client";
import { useEffect, useState } from "react";
import type { ProgramHorizon } from "../journey-types";
import {
  AccountScreen,
  AccountTopBar,
  PillButton,
  PillLink,
} from "../_account/account-shell";
import {
  closedUnconsolidated,
  isClosed,
  useAccountJourney,
} from "../_account/calibration-state";
import { horizonP, horizonR } from "../_account/scenario-values";
import { MiniSpider } from "../_account/spiders";

const SCENARIOS = "/journey/scenari";
/** Nella demo il confronto parte dal programma di 6 mesi. */
const DEFAULT: ProgramHorizon = "PROGRAM_6M";

/**
 * S15 della demo PF10, «Dove sei adesso e dove puoi arrivare»: la R di oggi
 * e la stima P di ogni orizzonte, con i dati degli scenari già calcolati dal
 * server. Qui si guarda soltanto: l'orizzonte si sceglie nella pagina dopo.
 * Senza scenari pronti si passa alla pagina degli scenari, che spiega lo stato.
 */
export default function RevealPage() {
  const { journey: j, error, refresh } = useAccountJourney();
  // Il primo caricamento è fallito (rete o server): niente attesa infinita,
  // un messaggio e un nuovo tentativo esplicito.
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await refresh();
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setRetrying(false);
    }
  };
  const s = j?.scenarios?.status === "READY" ? j.scenarios : null;
  const ready = !!s && isClosed(j?.calibration);
  const [shown, setShown] = useState<ProgramHorizon | null>(null);
  useEffect(() => {
    if (j && !ready) window.location.replace(SCENARIOS);
  }, [j, ready]);
  const top = <AccountTopBar title="Il tuo scenario" back="/journey/profilo" />;
  if (!j && (error || failed) && !retrying)
    return (
      <AccountScreen
        top={top}
        footer={
          <PillButton tone="lime" onClick={() => void retry()}>
            Riprova
          </PillButton>
        }
      >
        <p className="pf-acc-error" role="alert">
          Non riusciamo a caricare i tuoi scenari. Controlla la connessione e
          riprova.
        </p>
      </AccountScreen>
    );
  if (!s || !ready)
    return (
      <AccountScreen top={top}>
        <p className="pf-acc-muted" role="status">
          Carichiamo i tuoi scenari…
        </p>
      </AccountScreen>
    );
  const horizons = s.horizons;
  const current =
    horizons.find((h) => h.horizon === shown) ??
    horizons.find((h) => h.horizon === (s.selectedHorizon ?? DEFAULT)) ??
    horizons[0];
  const p = (horizon: ProgramHorizon) => {
    const h = horizons.find((x) => x.horizon === horizon);
    return h ? horizonP(h) : null;
  };
  const p6 = p("PROGRAM_6M");
  const plateau = p6 !== null && p6 === p("PROGRAM_12M");
  return (
    <AccountScreen
      top={top}
      footer={
        <PillLink href={SCENARIOS} tone="lime">
          Scegli il tuo scenario
        </PillLink>
      }
    >
      <h1 className="pf-acc-title">Dove sei adesso e dove puoi arrivare</h1>
      {closedUnconsolidated(j?.calibration) && (
        <p className="pf-acc-warning" role="status">
          <strong>Attenzione: la tua R è una stima poco affidabile.</strong> La
          fase gratuita è scaduta prima che ti conoscessimo abbastanza.
        </p>
      )}
      <div className="pf-acc-reveal-seg" role="radiogroup" aria-label="Orizzonte">
        {horizons.map((h) => (
          <button
            key={h.horizon}
            type="button"
            role="radio"
            aria-checked={h.horizon === current.horizon}
            className={h.horizon === current.horizon ? "is-selected" : undefined}
            onClick={() => setShown(h.horizon)}
          >
            {h.months} mesi
          </button>
        ))}
      </div>
      <figure className="pf-acc-reveal-spider">
        <MiniSpider
          real={current.drivers.map((d) => d.current)}
          potential={current.drivers.map((d) => d.potential)}
          scale={s.scale}
          size={220}
        />
        <figcaption>
          <span className="is-real">R · oggi</span>
          <span className="is-potential">
            P{current.months} · stima a {current.months} mesi
          </span>
        </figcaption>
      </figure>
      <dl className="pf-acc-reveal-cells" aria-live="polite">
        <div>
          <dt>R</dt>
          <dd>{horizonR(current)}</dd>
        </div>
        {horizons.map((h) => (
          <div
            key={h.horizon}
            className={h.horizon === current.horizon ? "is-selected" : undefined}
          >
            <dt>P{h.months}</dt>
            <dd>{horizonP(h)}</dd>
          </div>
        ))}
      </dl>
      <p className="pf-acc-muted">
        Stima realistica se segui il percorso con regolarità. È una stima
        condizionata, non una garanzia.
      </p>
      {plateau && (
        <p className="pf-acc-muted">
          P6 e P12 coincidono: oltre i 6 mesi la stima si assesta. Non la
          alziamo per farla sembrare migliore.
        </p>
      )}
      {s.engine.provisional && (
        <p className="pf-acc-note">
          Stima provvisoria: la affiniamo con i dati dei tuoi allenamenti.
        </p>
      )}
    </AccountScreen>
  );
}
