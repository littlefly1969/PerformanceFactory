import Link from "next/link";
import type { ReactNode } from "react";
import type { Calibration, Evaluation } from "../journey-types";
import { AccountScreen, PillButton, PillLink } from "./account-shell";
import { definedAreas } from "./calibration-state";
import { MiniSpider } from "./spiders";

/**
 * Esito dell'assessment nella veste della demo PF10: fondo scuro, Spider
 * provvisorio e barra della calibrazione con la soglia della regola di
 * consolidamento restituita dal server. È una prima stima, che si affina con
 * i blocchi di calibrazione; la stessa schermata chiude ogni blocco.
 */
export function ProvisionalReady({
  evaluation,
  calibration,
  onHome,
  kicker = "Prime domande completate",
  title = "Il tuo profilo provvisorio è pronto.",
  onContinue,
  extra,
}: {
  evaluation: Evaluation;
  calibration?: Calibration | null;
  /** Uscita senza ricaricare; senza, «Salva i progressi ed esci» porta alla home. */
  onHome?: () => void;
  kicker?: string;
  title?: string;
  /** Prossimo blocco nella stessa pagina; senza, si apre la calibrazione. */
  onContinue?: () => void;
  /**
   * Passo in più sotto «Continua» (scenari, circolo). A calibrazione
   * sufficiente è il passo principale: va passato in giallo.
   */
  extra?: ReactNode;
}) {
  const value = Math.round(evaluation.overallConfidence);
  const threshold =
    calibration?.consolidationRule?.minOverallConfidence ?? undefined;
  // «Sufficientemente completo» solo con la regola valutata dal server, che
  // conta anche le soglie per area: l'arrotondamento serve solo a mostrarla.
  const reached = !!calibration?.ruleMet;
  // Aree già definite: il loro braccio dello Spider è continuo.
  const defined = definedAreas(calibration, evaluation.drivers);
  // Calibrazione sufficiente: niente «Continua la calibrazione». Il passo
  // giallo è quello in più (circolo, scenari) o, senza, il ritorno alla home.
  const home = reached && !extra;
  return (
    <AccountScreen
      tone="dark"
      footer={
        <>
          {reached ? null : onContinue ? (
            <PillButton tone="lime" onClick={onContinue}>
              Continua la calibrazione
            </PillButton>
          ) : (
            <PillLink href="/journey/calibrazione?ciclo=1" tone="lime">
              Continua la calibrazione
            </PillLink>
          )}
          {extra}
          {home && onHome ? (
            <PillButton tone="lime" onClick={onHome}>
              Salva e vai alla home
            </PillButton>
          ) : home ? (
            <PillLink href="/journey" tone="lime">
              Salva e vai alla home
            </PillLink>
          ) : (
            <Link
              href="/journey"
              className="pf-acc-link"
              onClick={(event) => {
                if (!onHome) return;
                event.preventDefault();
                onHome();
              }}
            >
              Salva i progressi ed esci
            </Link>
          )}
        </>
      }
    >
      <section className="pf-acc-ready" aria-labelledby="pf-acc-ready">
        <span className="pf-acc-kicker">{kicker}</span>
        <h1 id="pf-acc-ready" className="pf-acc-title">
          {title}
        </h1>
        <div className="pf-acc-ready-spider">
          <MiniSpider
            real={evaluation.drivers.map((d) => d.score)}
            scale={evaluation.scale}
            provisional
            defined={evaluation.drivers.map((d) => defined.has(d.id))}
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
          Ogni blocco sono due domande sulle aree che conosciamo meno. Alla
          soglia lo Spider è abbastanza preciso per costruire il programma; dove
          sappiamo meno, il tratto è più tenue.
        </p>
      </section>
    </AccountScreen>
  );
}
