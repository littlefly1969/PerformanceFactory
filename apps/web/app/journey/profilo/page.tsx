"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AccountMenu } from "../../components/account-menu";
import type { FitRankingView } from "../../components/fit-ranking-editor";
import {
  type AthleteProfile,
  type FreeLessonView,
  percent,
  shortName,
  useResource,
} from "../_account/account-data";
import { AccountScreen } from "../_account/account-shell";
import {
  closedUnconsolidated,
  definedAreas,
  isConsolidated,
  microTestOpen,
  useAccountJourney,
} from "../_account/calibration-state";
import {
  OUTCOMES,
  type Outcome,
  nextStep,
  readOutcome,
} from "../_account/next-step";
import {
  AVAILABILITY_PATH,
  type Availability,
  availabilityComplete,
} from "./_profile/availability";
import {
  AvailabilityCard,
  ExternalIcon,
  FitCard,
  LessonSection,
  LinkCard,
  TodoCard,
} from "./_profile/profile-cards";
import { AreaRing, type HexAxis, ProfileHex } from "./_profile/profile-hex";
import "./_profile/profile.css";
import "./_profile/profile-body.css";

const GearIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
  </svg>
);

/**
 * Profilo dell'atleta nella fase gratuita, come la demo PF10: testata scura
 * con l'esagono grande (aree definite a linea piena, le altre tratteggiate),
 * la calibrazione che diventa la lezione, disponibilità e classifica FIT da
 * compilare o modificare, le sei aree, il prossimo passo, l'analisi delle
 * aree, l'invito e la community. Il calendario arriva con l'abbonamento.
 */
export default function ProfilePage() {
  const { journey: j, error, busy, action } = useAccountJourney();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [info, setInfo] = useState(false);
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
  const lesson = useResource<FreeLessonView>("/athlete-journey/free-lesson");
  const availability = useResource<Availability>(AVAILABILITY_PATH);
  const fit = useResource<FitRankingView>("/athlete-journey/fit-ranking");
  const evaluation = j?.evaluation ?? null;
  const calibration = j?.calibration ?? null;
  const closed = isConsolidated(calibration);
  const expiredWeak = closedUnconsolidated(calibration);
  const rule = calibration?.consolidationRule.minOverallConfidence ?? null;
  const global = profile.data?.global ?? null;
  const defined = evaluation
    ? definedAreas(calibration, evaluation.drivers)
    : new Set<string>();
  const axes: HexAxis[] = evaluation
    ? evaluation.drivers.map((d) => ({
        id: d.id,
        label: shortName(d.name),
        score: d.score,
        confidence: d.confidence,
        defined: defined.has(d.id),
      }))
    : (j?.driverList ?? []).map((d) => ({
        id: d.id,
        label: shortName(d.name),
        score: null,
        confidence: 0,
        defined: false,
      }));
  const hexAxes = axes.length >= 3 ? axes : placeholderAxes;
  // Prima dell'assessment la fase è UNAVAILABLE: decidono flag e circoli.
  const offered =
    !!lesson.data?.enabled && (lesson.data.clubs?.length ?? 0) > 0;
  const started = j?.phase === "ASSESSMENT" || j?.phase === "PROCESSING";
  const answered = j ? Math.min(j.currentQuestion, j.count) : 0;
  const step = j && lesson.data !== undefined ? nextStep(j, lesson.data) : null;
  const firstName = (profile.data?.firstName ?? j?.firstName ?? "").trim();
  const startAssessment = () => {
    if (started) return window.location.assign("/journey");
    void action("start").then((ok) => ok && window.location.assign("/journey"));
  };
  const assessCta = busy
    ? "Prepariamo le domande…"
    : started || answered > 0
      ? "Continua l’assessment"
      : "Inizia l’assessment";
  const total = evaluation?.drivers.length ?? 0;
  const availabilityDone =
    !!availability.data && availabilityComplete(availability.data);
  // Scheda «Fase gratuita» come la demo: «Calibrazione in corso» (o
  // completata) e la pillola corta «Calibrazione»; a fase chiusa gli scenari.
  const phase = !step
    ? null
    : step.kind === "scenarios"
      ? { title: step.kicker, href: step.href, cta: step.cta, label: step.cta }
      : {
          title:
            step.kind === "finish"
              ? "Calibrazione completata"
              : "Calibrazione in corso",
          href: step.kind === "lesson" ? "/journey/calibrazione" : step.href,
          cta: "Calibrazione",
          label: step.kind === "lesson" ? "Continua la calibrazione" : step.cta,
        };
  return (
    <AccountScreen nav="profile" coachDot={microTestOpen(calibration)}>
      <header className="pf-prof-head">
        <div className="pf-prof-glow" aria-hidden="true" />
        <div className="pf-prof-top">
          <AccountMenu
            name={firstName}
            from="profilo"
            className="pf-prof-avatar"
            align="start"
          />
          <Link
            href="/account?da=profilo"
            className="pf-prof-gear"
            aria-label="Impostazioni"
          >
            <GearIcon />
          </Link>
        </div>
        {j && !evaluation && (
          <div className="pf-prof-hello">
            <h1>Ciao{firstName ? ` ${firstName}` : ""}.</h1>
            {offered ? (
              <p>
                {answered > 0
                  ? "Ti mancano poche domande per sbloccare la tua "
                  : "Pochi minuti di domande e sblocchi la tua "}
                <span>lezione di prova gratuita</span>
                {answered > 0 ? "." : " con un coach."}
              </p>
            ) : (
              // La lezione si promette solo se il server la offre.
              <p>
                {answered > 0
                  ? "Ti mancano poche domande per il tuo primo Spider."
                  : "Pochi minuti di domande e scopri dove sei oggi."}
              </p>
            )}
          </div>
        )}
        {evaluation && <h1 className="pf-sr-only">Il tuo profilo</h1>}
        <ProfileHex
          axes={hexAxes}
          overallConfidence={evaluation ? evaluation.overallConfidence : null}
          scale={evaluation?.scale ?? { min: 0, max: 100 }}
        >
          {j && !evaluation && (
            <div className="pf-prof-hex-cta">
              <button type="button" disabled={busy} onClick={startAssessment}>
                <span>{assessCta}</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          )}
        </ProfileHex>
        {evaluation && global && (
          <>
            <div className="pf-prof-r">
              <p>
                <span>R</span>
                <b>
                  {closed ? "" : "≈ "}
                  {global.value}
                </b>
              </p>
              <div>
                <span className={`pf-prof-chip${closed ? " is-done" : ""}`}>
                  {closed ? "Sufficientemente completo" : "Profilo provvisorio"}
                </span>
                <button
                  type="button"
                  className="pf-prof-info-btn"
                  aria-expanded={info}
                  aria-controls="pf-prof-info"
                  aria-label={
                    info ? "Chiudi le informazioni su R" : "Informazioni su R"
                  }
                  onClick={() => setInfo(!info)}
                >
                  {info ? "×" : "i"}
                </button>
              </div>
            </div>
            {expiredWeak && (
              <p className="pf-prof-warning" role="status">
                <strong>Attenzione: stima poco affidabile.</strong> La fase
                gratuita è scaduta prima che ti conoscessimo abbastanza: R e i
                tuoi scenari partono da dati ancora parziali.
              </p>
            )}
            {info && (
              <div className="pf-prof-info" id="pf-prof-info">
                <div>
                  <b>
                    Tra {global.low} e {global.high}
                  </b>
                  <span>
                    Confidenza complessiva {percent(global.confidence)}
                  </span>
                </div>
                <p>
                  {closed
                    ? "La stima è consolidata: le tue risposte bastano per un valore affidabile."
                    : "La stima si basa su dati ancora parziali. L’intervallo si stringe man mano che completi le aree."}
                </p>
                <p className="is-muted">
                  R non è la media dei sei punteggi. P3, P6 e P12 si mostrano
                  quando la calibrazione è chiusa.
                </p>
                <span className="pf-prof-info-note">
                  Soglia di completezza{" "}
                  {rule === null ? "da definire" : percent(rule)}
                </span>
              </div>
            )}
          </>
        )}
      </header>

      <div className="pf-prof-body">
        {outcome && j && (
          <p
            className="pf-prof-confirm"
            role="status"
            tabIndex={-1}
            ref={confirmation}
          >
            {OUTCOMES[outcome]}
          </p>
        )}
        {error && (
          <p className="pf-acc-error" role="alert">
            {error}
          </p>
        )}
        {evaluation && step && (
          <LessonSection
            view={lesson.data}
            calibrationHref={step.href}
            calibrationCta={
              step.kind === "lesson" || step.kind === "scenarios"
                ? "Continua la calibrazione"
                : step.cta
            }
          />
        )}
        {/* Da compilare in alto, come nella demo; compilate scendono in fondo. */}
        {availability.data !== undefined && !availabilityDone && (
          <TodoCard
            href="/journey/profilo/disponibilita"
            title="Quale è la tua disponibilità?"
          />
        )}
        {fit.data !== undefined && !fit.data?.ranking && (
          <TodoCard
            href="/journey/profilo/classifica"
            title="La tua classifica FITP"
          />
        )}

        {evaluation && (
          <section className="pf-prof-areas" aria-labelledby="pf-prof-areas">
            <div className="pf-prof-section-head">
              <h2 id="pf-prof-areas">Le sei aree</h2>
              <span>
                {defined.size} di {total} aree definite
              </span>
            </div>
            <ul>
              {evaluation.drivers.map((d) => (
                <li key={d.id}>
                  <Link href="/journey/calibrazione">
                    <AreaRing
                      confidence={d.confidence}
                      defined={defined.has(d.id)}
                    >
                      {Math.round(d.score)}
                    </AreaRing>
                    <span>{d.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {evaluation && phase && (
          <section className="pf-prof-phase" aria-label="Prossimo passo">
            <div>
              <span className="pf-prof-kicker">Fase gratuita</span>
              <strong>{phase.title}</strong>
            </div>
            <Link href={phase.href} aria-label={phase.label}>
              <span>{phase.cta}</span>
              <span aria-hidden="true">→</span>
            </Link>
          </section>
        )}

        {evaluation && (
          <LinkCard
            href="/journey/calibrazione"
            kicker={`${total}/${total} stimate · ${defined.size}/${total} definite`}
            title="Analisi delle sei aree"
          />
        )}
        {availabilityDone && <AvailabilityCard value={availability.data!} />}
        {fit.data?.ranking && <FitCard view={fit.data} />}
        <LinkCard href="/journey/profilo/invita" title="Invita un amico" />
        <LinkCard
          href="/journey/profilo/community"
          title="Unisciti alla community"
          tone="outline"
          icon={<ExternalIcon />}
        />
      </div>
    </AccountScreen>
  );
}

/** Esagono vuoto finché il percorso non ha ancora l'elenco delle aree. */
const placeholderAxes: HexAxis[] = Array.from({ length: 6 }, (_, i) => ({
  id: `area-${i}`,
  label: "",
  score: null,
  confidence: 0,
  defined: false,
}));
