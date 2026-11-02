import Link from "next/link";
import type { Calibration, Evaluation } from "../journey-types";
import { AccountScreen, PillLink } from "./account-shell";
import { MiniSpider } from "./spiders";

/**
 * Esito dell'assessment nella veste della demo PF10: fondo scuro, Spider
 * provvisorio e barra della calibrazione con la soglia della regola di
 * consolidamento restituita dal server. È una prima stima, che si affina con
 * le domande di calibrazione e i micro-test.
 */
export function ProvisionalReady({
  evaluation,
  calibration,
  onHome,
}: {
  evaluation: Evaluation;
  calibration?: Calibration | null;
  onHome: () => void;
}) {
  const value = Math.round(evaluation.overallConfidence);
  const threshold =
    calibration?.consolidationRule?.minOverallConfidence ?? undefined;
  // «Sufficientemente completo» solo con la regola valutata dal server, che
  // conta anche le soglie per area: l'arrotondamento serve solo a mostrarla.
  const reached = !!calibration?.ruleMet;
  return (
    <AccountScreen
      tone="dark"
      footer={
        <>
          <PillLink href="/journey/calibrazione" tone="lime">
            Continua la calibrazione
          </PillLink>
          <Link
            href="/journey"
            className="pf-acc-link"
            onClick={(event) => {
              event.preventDefault();
              onHome();
            }}
          >
            Torna alla home
          </Link>
        </>
      }
    >
      <section className="pf-acc-ready" aria-labelledby="pf-acc-ready">
        <span className="pf-acc-kicker">Prime domande completate</span>
        <h1 id="pf-acc-ready" className="pf-acc-title">
          Il tuo profilo provvisorio è pronto.
        </h1>
        <div className="pf-acc-ready-spider">
          <MiniSpider
            real={evaluation.drivers.map((d) => d.score)}
            scale={evaluation.scale}
            provisional
            size={190}
          />
        </div>
        <div className="pf-acc-ready-meter">
          <span className="pf-acc-kicker">Calibrazione</span>
          <div className="pf-acc-ready-value">
            <strong>{value}</strong>
            <span className="pf-acc-badge">
              {reached ? "Sufficientemente completo" : "Profilo provvisorio"}
            </span>
          </div>
          <div
            className="pf-acc-ready-bar"
            role="meter"
            aria-label="Calibrazione"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
          >
            <i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
            {threshold !== undefined && (
              <b style={{ left: `${threshold}%` }} aria-hidden="true" />
            )}
          </div>
          {threshold !== undefined && (
            <span
              className="pf-acc-ready-threshold"
              style={{ left: `${threshold}%` }}
            >
              Soglia {threshold}
            </span>
          )}
        </div>
        <p>
          È una prima stima. Si affina con le domande di calibrazione e i
          micro-test; dove sappiamo meno, il tratto è più tenue.
        </p>
      </section>
    </AccountScreen>
  );
}
