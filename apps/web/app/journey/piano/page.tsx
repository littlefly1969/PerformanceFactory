"use client";
import {
  AccountScreen,
  AccountTopBar,
  PillLink,
} from "../_account/account-shell";
import { useAccountJourney } from "../_account/calibration-state";
import { horizonP, horizonR } from "../_account/scenario-values";
import { MiniSpider } from "../_account/spiders";

const UNLOCKS = [
  ["Piano di allenamento", "Sessioni settimanali sulle sei aree"],
  ["Coaching AI continuativo", "Risposte e adattamenti sul tuo piano"],
  ["Calendario", "Giorno, settimana e periodo"],
  ["Follow-up", "Dopo gli allenamenti e dopo le pause"],
  ["Adattamenti", "Il piano cambia con i tuoi feedback"],
];

/**
 * Il piano dello scenario scelto: la stima R → P resta dell'atleta anche
 * senza abbonamento; il pagamento sblocca il come arrivarci (A4.7).
 */
export default function PlanPage() {
  const { journey: j } = useAccountJourney();
  const s = j?.scenarios?.status === "READY" ? j.scenarios : null;
  const h = s?.horizons.find((x) => x.horizon === s.selectedHorizon);
  const top = <AccountTopBar title="Il tuo piano" back="/journey/scenari" />;
  if (!s || !h)
    return (
      <AccountScreen top={top}>
        <h1 className="pf-acc-title">Scegli prima il tuo orizzonte.</h1>
        <PillLink href="/journey/scenari">Vai agli scenari</PillLink>
      </AccountScreen>
    );
  const p = horizonP(h);
  return (
    <AccountScreen
      top={top}
      footer={
        <>
          <PillLink href="/journey/checkout" tone="lime">
            Continua
          </PillLink>
          <a className="pf-acc-link" href="/journey/profilo">
            Non ora
          </a>
        </>
      }
    >
      <h1 className="pf-acc-title">
        Il piano per arrivare a P{h.months} · {p}
      </h1>
      <div className="pf-acc-plan-head">
        <MiniSpider
          real={h.drivers.map((d) => d.current)}
          potential={h.drivers.map((d) => d.potential)}
          scale={s.scale}
          size={128}
        />
        <dl>
          <div>
            <dt>R oggi</dt>
            <dd>{horizonR(h)}</dd>
          </div>
          <div>
            <dt>P{h.months} stimato</dt>
            <dd>{p}</dd>
          </div>
        </dl>
      </div>
      <p>
        La stima resta tua anche senza abbonamento. Con il piano ricevi il come
        arrivarci.
      </p>
      <span className="pf-acc-kicker">Cosa si sblocca</span>
      <ul className="pf-acc-unlocks">
        {UNLOCKS.map(([title, text]) => (
          <li key={title}>
            <b>{title}</b>
            <small>{text}</small>
          </li>
        ))}
      </ul>
    </AccountScreen>
  );
}
