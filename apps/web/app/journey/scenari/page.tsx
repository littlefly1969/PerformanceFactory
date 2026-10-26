"use client";
import type { ProgramHorizon } from "../journey-types";
import { horizonP } from "../_account/scenario-values";
import {
  AccountScreen,
  AccountTopBar,
  PillButton,
  PillLink,
} from "../_account/account-shell";
import { isClosed, useAccountJourney } from "../_account/calibration-state";
import { MiniSpider } from "../_account/spiders";

const COPY: Record<number, string> = {
  3: "In 3 mesi questo è il livello stimato raggiungibile se segui il percorso.",
  6: "In 6 mesi puoi puntare a una traiettoria più ampia.",
  12: "In 12 mesi questo è lo scenario di crescita stimato.",
};

/**
 * Scelta dello scenario a calibrazione chiusa: P3, P6 e P12 con lo Spider di
 * R e P. Si sceglie l'orizzonte; come pagarlo si decide al checkout.
 */
export default function ScenariosPage() {
  const { journey: j, error, busy, action, refresh } = useAccountJourney();
  const s = j?.scenarios;
  const closed = isClosed(j?.calibration);
  const choose = async (horizon: ProgramHorizon) => {
    if (await action("horizon", { horizon }))
      window.location.assign("/journey/piano");
  };
  return (
    <AccountScreen
      top={<AccountTopBar title="Scelta scenario" back="/journey/profilo" />}
    >
      <h1 className="pf-acc-title">Scegli il tuo orizzonte.</h1>
      <p className="pf-acc-lead">
        Scegli l’orizzonte del programma. Come pagarlo lo decidi dopo.
      </p>
      {error && (
        <p className="pf-acc-error" role="alert">
          {error}
        </p>
      )}
      {j && !closed && (
        <section className="pf-acc-card">
          <p>
            P3, P6 e P12 si mostrano quando la calibrazione è chiusa: prima
            serve una R affidabile.
          </p>
          <PillLink href="/journey/calibrazione">
            Stato della calibrazione
          </PillLink>
        </section>
      )}
      {closed && !s && (
        <section className="pf-acc-card" role="status">
          <p>
            La scelta del percorso non è ancora disponibile. Riprova più tardi:
            appena è attiva trovi qui i tuoi scenari a 3, 6 e 12 mesi.
          </p>
          <PillButton
            tone="outline"
            arrow={false}
            onClick={() => void refresh()}
          >
            Aggiorna
          </PillButton>
        </section>
      )}
      {closed && s && s.status !== "READY" && (
        <section className="pf-acc-card" role="status">
          <p>
            {s.status === "PENDING"
              ? "Stiamo calcolando dove puoi arrivare in 3, 6 e 12 mesi."
              : "I tuoi scenari non sono ancora pronti."}
          </p>
          <PillButton
            tone="outline"
            arrow={false}
            onClick={() => void refresh()}
          >
            Aggiorna
          </PillButton>
        </section>
      )}
      {s?.status === "READY" &&
        s.horizons.map((h) => (
          <article
            key={h.horizon}
            className={`pf-acc-scenario${s.selectedHorizon === h.horizon ? " is-selected" : ""}`}
            aria-label={`Programma di ${h.months} mesi`}
          >
            <div className="pf-acc-scenario-body">
              <MiniSpider
                real={h.drivers.map((d) => d.current)}
                potential={h.drivers.map((d) => d.potential)}
                scale={s.scale}
              />
              <div>
                <span className="pf-acc-kicker">
                  Programma di {h.months} mesi
                </span>
                <strong>
                  P{h.months} · {horizonP(h)}
                </strong>
                <p>{COPY[h.months]}</p>
              </div>
            </div>
            <PillButton disabled={busy} onClick={() => void choose(h.horizon)}>
              {s.selectedHorizon === h.horizon
                ? `Continua con ${h.months} mesi`
                : `Scegli ${h.months} mesi`}
            </PillButton>
          </article>
        ))}
      {s?.status === "READY" && s.engine.provisional && (
        <p className="pf-acc-note">
          Stima provvisoria: la affiniamo con i dati dei tuoi allenamenti.
        </p>
      )}
    </AccountScreen>
  );
}
