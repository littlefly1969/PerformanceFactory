"use client";
import { useEffect, useRef, useState } from "react";
import { AccountMenu } from "../../components/account-menu";
import {
  type AthleteProfile,
  type FreeLessonView,
  percent,
  shortName,
  useResource,
} from "../_account/account-data";
import { AccountScreen, PillLink } from "../_account/account-shell";
import { AssessmentLessonCard, FreeLessonCard } from "../_account/lesson-card";
import { ProfileSpider } from "../_account/spiders";
import {
  isClosed,
  microTestOpen,
  useAccountJourney,
} from "../_account/calibration-state";
import {
  OUTCOMES,
  type Outcome,
  nextStep,
  readOutcome,
} from "../_account/next-step";

/** Intestazione: avatar con il menu dell'account, nome, sport ed esperienza. */
function ProfileHeader({ profile }: { profile: AthleteProfile | null }) {
  const name = profile?.firstName?.trim() ?? "";
  const meta = [
    profile?.sport,
    profile?.experience &&
      (/gioc/i.test(profile.experience)
        ? profile.experience
        : `${profile.experience} di gioco`),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <header className="pf-acc-profile-head">
      <AccountMenu
        name={name}
        from="profilo"
        className="pf-acc-avatar"
        align="start"
      />
      <div>
        <h1>{name || "Il tuo profilo"}</h1>
        {meta && <p className="pf-acc-meta">{meta}</p>}
      </div>
    </header>
  );
}

/**
 * Profilo dell'atleta nella fase gratuita: lezione gratuita, sintesi globale
 * di R con la sua confidenza, Spider delle sei aree e stato della
 * calibrazione. Prima dell'assessment lo Spider è vuoto.
 */
export default function ProfilePage() {
  const { journey: j, error, busy, action } = useAccountJourney();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const confirmation = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    // Il vecchio richiamo all'indirizzo nel profilo porta all'account.
    if (window.location.hash === "#indirizzo") {
      window.location.replace("/account/indirizzo?da=profilo");
      return;
    }
    // Ritorno da un'attività conclusa: la conferma si mostra una volta,
    // ricarica e indietro ritrovano il riepilogo senza ripeterla.
    const done = readOutcome(window.location.search);
    if (!done) return;
    setOutcome(done);
    window.history.replaceState(null, "", "/journey/profilo");
  }, []);
  // La conferma riceve il focus quando i dati aggiornati sono sullo schermo.
  useEffect(() => {
    if (outcome && j) confirmation.current?.focus();
  }, [outcome, j]);
  const profile = useResource<AthleteProfile>("/athlete-journey/profile");
  const evaluation = j?.evaluation ?? null;
  const lesson = useResource<FreeLessonView>("/athlete-journey/free-lesson");
  // Prima dell'assessment la fase è UNAVAILABLE: decidono flag e circoli.
  const offered =
    !!lesson.data?.enabled && (lesson.data.clubs?.length ?? 0) > 0;
  const calibration = j?.calibration ?? null;
  const closed = isClosed(calibration);
  const rule = calibration?.consolidationRule.minOverallConfidence ?? null;
  const global = profile.data?.global ?? null;
  const axes = evaluation
    ? evaluation.drivers.map((d) => ({
        id: d.id,
        label: shortName(d.name),
        value: d.score,
        confidence: d.confidence,
      }))
    : (j?.driverList ?? []).map((d) => ({
        id: d.id,
        label: shortName(d.name),
        value: null,
      }));
  const completeness = evaluation
    ? Math.min(
        100,
        Math.round((evaluation.overallConfidence / (rule || 100)) * 100),
      )
    : 0;
  const started = j?.phase === "ASSESSMENT" || j?.phase === "PROCESSING";
  const step = j && lesson.data !== undefined ? nextStep(j, lesson.data) : null;
  return (
    <AccountScreen nav="profile" coachDot={microTestOpen(calibration)}>
      <ProfileHeader profile={profile.data ?? null} />
      {outcome && j && (
        <p
          className="pf-acc-confirm"
          role="status"
          tabIndex={-1}
          ref={confirmation}
        >
          {OUTCOMES[outcome]} Qui trovi R, affidabilità e il prossimo passo.
        </p>
      )}
      {error && (
        <p className="pf-acc-error" role="alert">
          {error}
        </p>
      )}
      {j && !evaluation && (
        <AssessmentLessonCard
          answered={Math.min(j.currentQuestion, j.count)}
          count={j.count}
          started={started}
          busy={busy}
          offered={offered}
          onStart={() => {
            if (started) return window.location.assign("/journey");
            void action("start").then(
              (ok) => ok && window.location.assign("/journey"),
            );
          }}
        />
      )}
      {evaluation && lesson.data && <FreeLessonCard view={lesson.data} />}

      {evaluation && global && (
        <section className="pf-acc-global" aria-labelledby="pf-acc-global">
          <div className="pf-acc-row">
            <span className="pf-acc-kicker" id="pf-acc-global">
              Sintesi globale · R
            </span>
            <span className="pf-acc-badge">
              {closed ? "R consolidata" : "Profilo provvisorio"}
            </span>
          </div>
          <div className="pf-acc-row is-big">
            <strong>
              {closed ? "" : "≈ "}
              {global.value}
            </strong>
            <div>
              <b>
                Tra {global.low} e {global.high}
              </b>
              <small>Confidenza complessiva {percent(global.confidence)}</small>
            </div>
          </div>
          <p>
            {closed
              ? "La stima è consolidata: le tue risposte bastano per un valore affidabile."
              : "La stima si basa su dati ancora parziali. L’intervallo si stringe man mano che completi le aree."}
          </p>
          <p className="pf-acc-muted">
            R non è la media dei sei punteggi: ogni area pesa per quanto la
            conosciamo. P3, P6 e P12 si mostrano quando la calibrazione è
            chiusa.
          </p>
          <small className="pf-acc-note">
            Soglia di completezza{" "}
            {rule === null ? "da definire" : percent(rule)}
          </small>
          {step && (
            <div className="pf-acc-phase" aria-label="Prossimo passo">
              <div>
                <span className="pf-acc-kicker">Fase gratuita</span>
                <strong>{step.kicker}</strong>
              </div>
              <PillLink href={step.href}>{step.cta}</PillLink>
            </div>
          )}
        </section>
      )}

      <section className="pf-acc-spider-wrap" aria-label="Il tuo Spider">
        <ProfileSpider
          axes={axes}
          scale={evaluation?.scale ?? { min: 0, max: 100 }}
          provisional={!closed}
        />
      </section>

      <section className="pf-acc-card" aria-labelledby="pf-acc-completion">
        <span className="pf-acc-kicker" id="pf-acc-completion">
          Completamento profilo · sei aree
        </span>
        <div
          className="pf-acc-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={completeness}
        >
          <span style={{ width: `${completeness}%` }} />
        </div>
        <p>
          {evaluation
            ? "Ogni risposta e ogni micro-test rendono più nitida l’area che conosciamo meno."
            : "Rispondi all’assessment: lo Spider nasce provvisorio e si definisce mentre ti alleni."}
        </p>
      </section>
    </AccountScreen>
  );
}
