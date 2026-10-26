"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SubscriberShell } from "./_components/subscriber-shell";
import { athleteRequest, useAthlete } from "./_components/use-athlete";
import type { Home, Session } from "./_components/athlete-types";
import { displayDate } from "./_components/athlete-types";
import { sessionArea, sessionMeta } from "./_components/session-format";
import { ObjectiveCard } from "./obiettivi/objective-card";

function Brand({ name }: { name: string | null }) {
  return (
    <>
      <Link
        href="/user"
        className="pfs-brand"
        aria-label="Performance Factory Home"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 20V4h8a5 5 0 0 1 0 10H9" />
        </svg>
        <span>Performance Factory</span>
      </Link>
      <Link
        href="/user/profile"
        className="pfs-avatar"
        aria-label="Il tuo profilo"
      >
        {name?.trim().charAt(0).toUpperCase() || "·"}
      </Link>
    </>
  );
}

function TodayCard({ session, today }: { session: Session; today: string }) {
  const isToday = session.date === today;
  return (
    <section className="pfs-card pfs-today">
      <span className="pfs-kicker pfs-dot is-lime">
        {sessionArea(session)} ·{" "}
        {isToday
          ? "Oggi"
          : displayDate(session.date, { weekday: "long", day: "numeric" })}
      </span>
      <h1>{session.title}</h1>
      {!!sessionMeta(session).length && (
        <p className="pfs-meta">{sessionMeta(session).join(" · ")}</p>
      )}
      <Link
        className="pfs-cta"
        href={
          isToday
            ? `/user/training/sessions/${session.id}/esegui`
            : `/user/training/sessions/${session.id}`
        }
      >
        {isToday ? "Inizia ora" : "Apri la scheda"}{" "}
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

function LessonCard({ session }: { session: Session }) {
  return (
    <section className="pfs-card pfs-lesson">
      <span className="pfs-kicker pfs-dot">{sessionArea(session)}</span>
      <h2>{session.title}</h2>
      <p className="pfs-meta">
        {[displayDate(session.date), ...sessionMeta(session)].join(" · ")}
      </p>
      <Link
        className="pfs-row-link"
        href={`/user/training/sessions/${session.id}`}
      >
        Apri la lezione <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

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
  const needsAvailability = [
    "TRAINING_AVAILABILITY_REQUIRED",
    "TRAINING_PROGRAM_REQUIRED",
  ].includes(home?.lifecycle?.errorCode ?? "");
  const version = home?.program.cycle?.version;
  const objective = home?.objectives?.[0];
  return (
    <SubscriberShell
      brand={<Brand name={home?.firstName ?? null} />}
      nav
      error={error}
      reload={reload}
      loading={!home}
    >
      {home && (
        <>
          <div className="pfs-home-bar">
            <Link
              href="/user/performance"
              className="pfs-r"
              aria-label="La tua performance"
            >
              <small>R</small>
              <strong>{home.performance?.current ?? "—"}</strong>
            </Link>
            <Link href="/user/training" className="pfs-plan-link">
              {version ? `Piano v${version}.0` : "Il tuo piano"}
            </Link>
            <Link href="/user/obiettivi" className="pfs-objectives-link">
              Obiettivi <span aria-hidden="true">→</span>
            </Link>
          </div>
          {action?.type === "TRAINING_SESSION" ? (
            <TodayCard session={action.session} today={home.today} />
          ) : (
            <section className="pfs-card pfs-today">
              {action?.type === "REQUEST_PLAN" ? (
                <>
                  <span className="pfs-kicker">Il tuo prossimo passo</span>
                  <h1>
                    {home.lifecycle?.status === "COMPLETED"
                      ? "Pronto per un nuovo ciclo?"
                      : "Il tuo percorso comincia qui."}
                  </h1>
                  <p>
                    Prepareremo gli allenamenti a partire dal tuo obiettivo e
                    dalle tue risposte.
                  </p>
                  <button
                    className="pfs-cta"
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
                  <h1>
                    {needsAvailability
                      ? "Completa la tua disponibilità."
                      : "Il programma richiede ancora un po’ di tempo."}
                  </h1>
                  <p>
                    {needsAvailability
                      ? "Indica nel profilo i giorni e il tempo che puoi dedicare agli allenamenti. Riprenderemo da lì."
                      : home.lifecycle?.retryScheduled
                        ? "La richiesta è salvata. Riproveremo automaticamente: non serve ricominciare."
                        : "Contatta il tuo coach per proseguire il percorso."}
                  </p>
                  {needsAvailability && (
                    <Link className="pfs-cta" href="/user/profile">
                      Completa il profilo →
                    </Link>
                  )}
                  {!needsAvailability && home.lifecycle?.requestAllowed && (
                    <button
                      className="pfs-cta"
                      disabled={requesting}
                      onClick={requestPlan}
                    >
                      {requesting ? "Ripresa…" : "Riprova ora →"}
                    </button>
                  )}
                </>
              ) : action?.type === "CHECK_IN" ? (
                <>
                  <span className="pfs-kicker pfs-dot is-lime">Check-in</span>
                  <h1>{home.checkIn?.title}</h1>
                  <p>Le tue risposte aiutano a costruire il prossimo ciclo.</p>
                  <Link className="pfs-cta" href="/user/check-in">
                    Inizia il check-in →
                  </Link>
                </>
              ) : action?.type === "WINDOW_COMPLETE" ? (
                <>
                  <span className="pfs-kicker">Blocco completato</span>
                  {home.program.cycle && (
                    <p className="pfs-meta" aria-label="Finestra corrente">
                      Finestra{" "}
                      {home.program.cycle.windowInProgram ??
                        home.program.cycle.version}
                      {home.program.cycle.windowsPerProgram
                        ? ` / ${home.program.cycle.windowsPerProgram}`
                        : ""}
                      {home.program.durationWeeks
                        ? ` · programma di ${home.program.durationWeeks} settimane`
                        : ""}
                    </p>
                  )}
                  <h1>Hai concluso gli allenamenti di questo blocco.</h1>
                  <p>
                    Il prossimo ciclo sarà preparato alla fine della finestra
                    {home.program.cycle
                      ? `, il ${displayDate(home.program.cycle.endsOn)}`
                      : ""}
                    . Nel frattempo rispetta il recupero previsto.
                  </p>
                  <Link className="pfs-cta" href="/user/training">
                    Guarda il calendario →
                  </Link>
                </>
              ) : action?.type === "PREPARING" ? (
                <>
                  <span className="pfs-kicker">Il tuo programma</span>
                  <h1>
                    {home.lifecycle?.preparingNext
                      ? "Stiamo preparando il prossimo ciclo."
                      : "Stiamo preparando il tuo programma."}
                  </h1>
                  <p>
                    Troverai qui i tuoi allenamenti appena saranno pronti. Il
                    percorso riprende dai tuoi progressi e dalle tue risposte.
                  </p>
                  <button className="pfs-cta" onClick={reload}>
                    Aggiorna →
                  </button>
                </>
              ) : (
                <>
                  <span className="pfs-kicker">Oggi</span>
                  <h1>Nessuna nuova attività in programma.</h1>
                  <p>
                    Puoi ritrovare le tue sessioni nel calendario, anche quelle
                    non ancora svolte.
                  </p>
                  <Link className="pfs-cta" href="/user/training">
                    Apri il calendario →
                  </Link>
                </>
              )}
            </section>
          )}
          {requestError && (
            <p role="alert" className="pfs-alert">
              {requestError}
            </p>
          )}
          {home.checkIn && action?.type !== "CHECK_IN" && (
            <section className="pfs-card pfs-today">
              <span className="pfs-kicker">
                {[
                  `${home.checkIn.count} domande`,
                  `${Math.max(1, Math.round(home.checkIn.count / 2))} min`,
                  home.streak.days > 1
                    ? `serie di ${home.streak.days} giorni`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <h2>{home.checkIn.title}</h2>
              <Link className="pfs-cta" href="/user/check-in">
                Fai il check-in <span aria-hidden="true">→</span>
              </Link>
            </section>
          )}
          {objective && (
            <Link href="/user/obiettivi" className="pfs-objective-link">
              <ObjectiveCard objective={objective} compact />
            </Link>
          )}
          {home.nextSession &&
            !(
              action?.type === "TRAINING_SESSION" &&
              action.session.id === home.nextSession.id
            ) && (
              <section className="pfs-card pfs-lesson">
                <span className="pfs-kicker pfs-dot">
                  Prossimo allenamento · {displayDate(home.nextSession.date)}
                </span>
                <h2>{home.nextSession.title}</h2>
                <p className="pfs-meta">
                  {sessionMeta(home.nextSession).join(" · ")}
                </p>
                <Link
                  className="pfs-row-link"
                  href={`/user/training/sessions/${home.nextSession.id}`}
                >
                  Apri la scheda <span aria-hidden="true">→</span>
                </Link>
              </section>
            )}
          {home.lessons?.map((lesson) => (
            <LessonCard key={lesson.id} session={lesson} />
          ))}
        </>
      )}
    </SubscriberShell>
  );
}
