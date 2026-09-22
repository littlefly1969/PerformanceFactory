"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AthleteShell } from "./_components/athlete-shell";
import { athleteRequest, useAthlete } from "./_components/use-athlete";
import type { Home } from "./_components/athlete-types";
import { displayDate } from "./_components/athlete-types";
import { CalendarStrip, SessionCard } from "./_components/calendar-strip";
export default function AthleteHome() {
  const { data: home, error, reload } = useAthlete<Home>("/athlete/home");
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const lock = useRef(false);
  async function requestPlan() {
    if (lock.current) return;
    lock.current = true;
    setRequesting(true);
    setRequestError("");
    try {
      await athleteRequest("/training/lifecycle/request", {});
      reload();
    } catch {
      setRequestError(
        "Non è stato possibile avviare il programma. Riprova tra poco.",
      );
    } finally {
      lock.current = false;
      setRequesting(false);
    }
  }
  useEffect(() => {
    if (
      home?.program.status !== "PREPARING" &&
      !home?.lifecycle?.retryScheduled
    )
      return;
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [home?.program.status, home?.lifecycle?.retryScheduled, reload]);
  const action = home?.primaryAction;
  return (
    <AthleteShell label="Home" error={error} reload={reload} loading={!home}>
      {home && (
        <>
          <div className="pf4-home-greeting">
            <h1>Ciao{home.firstName ? ` ${home.firstName}` : ""}.</h1>
            {home.performance && (
              <Link href="/user/performance" className="pf4-compact-index">
                <span>Attuale → potenziale</span>
                <strong>
                  {home.performance.current}{" "}
                  <em>→ {home.performance.potential ?? "—"}</em>
                </strong>
              </Link>
            )}
          </div>
          <div className="pf4-home-meters">
            <div>
              <span>Il tuo programma</span>
              <strong>
                {home.program.durationWeeks ?? "—"} <small>settimane</small>
              </strong>
            </div>
            <div>
              <span>Sessioni completate</span>
              <strong>
                {home.program.completed} <small>/ {home.program.total}</small>
              </strong>
            </div>
          </div>
          <section className="pf4-today-card">
            {action?.type === "REQUEST_PLAN" ? (
              <>
                <span className="pf4-kicker">Il tuo prossimo passo</span>
                <h2>
                  {home.lifecycle?.status === "COMPLETED"
                    ? "Pronto per un nuovo ciclo?"
                    : "Il tuo percorso comincia qui."}
                </h2>
                <p>
                  Prepareremo gli allenamenti a partire dal tuo obiettivo e
                  dalle tue risposte.
                </p>
                <button
                  className="pf4-cta"
                  disabled={
                    requesting || home.lifecycle?.requestAllowed === false
                  }
                  onClick={requestPlan}
                >
                  {requesting ? "Preparazione…" : "Prepara il mio piano →"}
                </button>
              </>
            ) : action?.type === "ERROR" ? (
              <>
                <h2>Il programma richiede ancora un po’ di tempo.</h2>
                <p>
                  {home.lifecycle?.retryScheduled
                    ? "La richiesta è salvata. Riproveremo automaticamente: non serve ricominciare."
                    : "Contatta il tuo coach per proseguire il percorso."}
                </p>
                {home.lifecycle?.requestAllowed && (
                  <button
                    className="pf4-cta"
                    disabled={requesting}
                    onClick={requestPlan}
                  >
                    {requesting ? "Ripresa…" : "Riprova ora →"}
                  </button>
                )}
              </>
            ) : action?.type === "TRAINING_SESSION" ? (
              <>
                <span className="pf4-kicker">
                  {action.session.date === home.today
                    ? "La tua sessione di oggi"
                    : "Il prossimo allenamento"}
                </span>
                <h2>{action.session.title}</h2>
                <p>
                  {displayDate(action.session.date)} · {action.session.type}
                </p>
                <Link
                  className="pf4-cta"
                  href={`/user/training/sessions/${action.session.id}`}
                >
                  {action.session.date === home.today
                    ? "Inizia la sessione"
                    : "Apri la sessione"}{" "}
                  <span>→</span>
                </Link>
              </>
            ) : action?.type === "CHECK_IN" ? (
              <>
                <span className="pf4-kicker">Il tuo prossimo passo</span>
                <h2>{home.checkIn?.title}</h2>
                <p>Le tue risposte aiutano a costruire il prossimo ciclo.</p>
                <Link className="pf4-cta" href="/user/check-in">
                  Inizia il check-in →
                </Link>
              </>
            ) : action?.type === "PREPARING" ? (
              <>
                <span className="pf4-kicker">Il tuo programma</span>
                <h2>
                  {home.lifecycle?.preparingNext
                    ? "Stiamo preparando il prossimo ciclo."
                    : "Stiamo preparando il tuo programma."}
                </h2>
                <p>
                  Troverai qui i tuoi allenamenti appena saranno pronti. Il
                  percorso riprende dai tuoi progressi e dalle tue risposte.
                </p>
                <button className="pf4-cta" onClick={reload}>
                  Aggiorna →
                </button>
              </>
            ) : (
              <>
                <span className="pf4-kicker">Oggi</span>
                <h2>Nessuna nuova attività in programma.</h2>
                <p>
                  Puoi ritrovare le tue sessioni nel calendario, anche quelle
                  non ancora svolte.
                </p>
                <Link className="pf4-cta" href="/user/training">
                  Apri il calendario →
                </Link>
              </>
            )}
          </section>
          {requestError && (
            <p role="alert" className="pf4-error">
              {requestError}
            </p>
          )}
          {home.nextSession &&
            !(
              action?.type === "TRAINING_SESSION" &&
              action.session.id === home.nextSession.id
            ) && (
              <section className="pf4-athlete-section">
                <span className="pf4-kicker">Il prossimo passo</span>
                <SessionCard session={home.nextSession} />
              </section>
            )}
          {home.checkIn && action?.type !== "CHECK_IN" && (
            <Link className="pf4-session-card" href="/user/check-in">
              <div>
                <span className="pf4-kicker">
                  Check-in disponibile · {home.checkIn.count} domande
                </span>
                <h2>{home.checkIn.title}</h2>
              </div>
              <span>→</span>
            </Link>
          )}
          <CalendarStrip calendar={home.week} />
          <section className="pf4-athlete-section">
            <span className="pf4-kicker">Il tuo percorso</span>
            {home.program.summary && <p>{home.program.summary}</p>}
            {home.streak.days > 0 && (
              <p>
                {home.streak.days}{" "}
                {home.streak.days === 1
                  ? "giorno di allenamento"
                  : "giorni consecutivi di allenamento"}
                .
              </p>
            )}
            <Link className="pf4-text-link" href="/user/performance">
              Guarda i tuoi progressi →
            </Link>
          </section>
        </>
      )}
    </AthleteShell>
  );
}
