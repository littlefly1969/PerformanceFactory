import Link from "next/link";
import { AccountMenu } from "../../components/account-menu";
import type { Journey } from "../journey-types";
import { AccountScreen, PillLink } from "./account-shell";
import { isClosed, microTestOpen } from "./calibration-state";
import { MiniSpider } from "./spiders";

/** Il prossimo passo della fase gratuita, deciso dallo stato del backend. */
function nextStep(j: Journey) {
  const c = j.calibration;
  if (isClosed(c))
    return {
      kicker: "Calibrazione completata",
      title: "Scopri dove puoi arrivare in 3, 6 e 12 mesi.",
      href: "/journey/scenari",
      cta: "I tuoi scenari",
    };
  if (microTestOpen(c))
    return {
      kicker: "Micro-test",
      title: "Una prova breve ti aspetta.",
      href: "/journey/coach",
      cta: "Fai il micro-test",
    };
  return {
    kicker: "Calibrazione in corso",
    title: "Rendiamo la stima più precisa.",
    href: "/journey/calibrazione",
    cta: "Continua",
  };
}

/**
 * Home dopo l'assessment: il prossimo passo e lo Spider, che porta al
 * profilo. Prima dell'assessment la home è quella del benvenuto.
 */
export function AccountHome({ journey: j }: { journey: Journey }) {
  const evaluation = j.evaluation!;
  const step = nextStep(j);
  const closed = isClosed(j.calibration);
  const name = j.firstName?.trim();
  return (
    <AccountScreen nav="home" coachDot={microTestOpen(j.calibration)}>
      <div className="pf-acc-row">
        <h1 className="pf-acc-title">{name ? `Ciao ${name}.` : "Ciao."}</h1>
        <AccountMenu
          name={name}
          from="home"
          className="pf-acc-avatar is-small"
        />
      </div>
      <span className="pf-acc-badge">
        {closed ? "R consolidata" : "Profilo provvisorio"}
      </span>
      <section className="pf-acc-lesson" aria-label="Prossimo passo">
        <span className="pf-acc-kicker">{step.kicker}</span>
        <h2>{step.title}</h2>
        <PillLink href={step.href}>{step.cta}</PillLink>
      </section>
      <Link className="pf-acc-card pf-acc-home-spider" href="/journey/profilo">
        <MiniSpider
          real={evaluation.drivers.map((d) => d.score)}
          scale={evaluation.scale}
          provisional={!closed}
          size={112}
        />
        <div>
          <span className="pf-acc-kicker">Il tuo Spider</span>
          <strong>Vai al profilo →</strong>
          <p>
            Confidenza complessiva {Math.round(evaluation.overallConfidence)}%
          </p>
        </div>
      </Link>
    </AccountScreen>
  );
}
