"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { LogoutButton } from "../../components/logout-button";
import { FitRankingEditor } from "../../components/fit-ranking-editor";
import {
  type AthleteProfile,
  type FreeLessonView,
  percent,
  shortName,
  useProfilePhoto,
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

/** Intestazione: foto con il tasto per cambiarla, nome, sport ed esperienza. */
function ProfileHeader({ profile }: { profile: AthleteProfile | null }) {
  const photo = useProfilePhoto();
  const [menu, setMenu] = useState(false);
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
      <Link
        href="/benvenuto/foto"
        className="pf-acc-avatar"
        aria-label="Cambia la foto del profilo"
      >
        {photo ? (
          <Image src={photo} alt="" width={64} height={64} unoptimized />
        ) : (
          <span aria-hidden="true">{name[0]?.toUpperCase() ?? "·"}</span>
        )}
        <span className="pf-acc-avatar-badge" aria-hidden="true">
          ◉
        </span>
      </Link>
      <div>
        <h1>{name || "Il tuo profilo"}</h1>
        {meta && <p className="pf-acc-meta">{meta}</p>}
      </div>
      <div className="pf-acc-settings">
        <button
          type="button"
          aria-label="Impostazioni"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          ⚙
        </button>
        {menu && (
          <div className="pf-acc-menu">
            <Link href="/benvenuto/foto">Cambia foto</Link>
            <LogoutButton />
          </div>
        )}
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
  const { journey: j, error, busy, action, refresh } = useAccountJourney();
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
  return (
    <AccountScreen nav="profile" coachDot={microTestOpen(calibration)}>
      <ProfileHeader profile={profile.data ?? null} />
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
          <div className="pf-acc-phase">
            <div>
              <span className="pf-acc-kicker">Fase gratuita</span>
              <strong>
                {closed ? "Calibrazione completata" : "Calibrazione in corso"}
              </strong>
            </div>
            <PillLink
              href={closed ? "/journey/scenari" : "/journey/calibrazione"}
            >
              {closed ? "I tuoi scenari" : "Calibrazione"}
            </PillLink>
          </div>
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

      <section className="pf-acc-card pf-acc-fit">
        <FitRankingEditor
          onSaved={() => {
            // La classifica rivaluta driver e confidenza: cambiano anche
            // Spider, calibrazione ed eleggibilità alla lezione.
            void profile.reload();
            void refresh().catch(() => undefined);
            void lesson.reload();
          }}
        />
      </section>
    </AccountScreen>
  );
}
