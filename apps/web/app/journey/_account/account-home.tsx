import Link from "next/link";
import { AccountMenu } from "../../components/account-menu";
import type { Journey } from "../journey-types";
import { AccountScreen, PillLink } from "./account-shell";
import { type FreeLessonView, useResource } from "./account-data";
import { isClosed, microTestOpen } from "./calibration-state";
import { nextStep } from "./next-step";
import { MiniSpider } from "./spiders";

/**
 * Home dopo l'assessment: il prossimo passo e lo Spider, che porta al
 * profilo. Prima dell'assessment la home è quella del benvenuto.
 */
export function AccountHome({ journey: j }: { journey: Journey }) {
  const evaluation = j.evaluation!;
  // Lo stesso passo del profilo: servono anche la fase della lezione.
  const lesson = useResource<FreeLessonView>("/athlete-journey/free-lesson");
  const step = lesson.data === undefined ? null : nextStep(j, lesson.data);
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
      {step && (
        <section className="pf-acc-lesson" aria-label="Prossimo passo">
          <span className="pf-acc-kicker">{step.kicker}</span>
          <h2>{step.title}</h2>
          <PillLink href={step.href}>{step.cta}</PillLink>
        </section>
      )}
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
