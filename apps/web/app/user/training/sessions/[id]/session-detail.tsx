"use client";
import Link from "next/link";
import { useState } from "react";
import { SubscriberShell } from "../../../_components/subscriber-shell";
import { athleteRequest, useAthlete } from "../../../_components/use-athlete";
import {
  sessionLabels,
  type Session,
} from "../../../_components/athlete-types";
import {
  effortFromRating,
  modeLabels,
  sessionArea,
  sessionMeta,
  sessionSteps,
  twoDigits,
} from "../../../_components/session-format";

function restBetween(session: Session) {
  if (session.restSeconds) return session.restSeconds;
  const rests = (session.exercises ?? []).flatMap((e) =>
    e.restSeconds ? [e.restSeconds] : [],
  );
  return rests.length ? Math.max(...rests) : null;
}

export function SessionDetail({ id }: { id: string }) {
  const {
    data: session,
    error,
    reload,
  } = useAthlete<Session>(
    `/athlete/training/sessions/${encodeURIComponent(id)}`,
  );
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  async function skip() {
    setBusy(true);
    setFailure("");
    try {
      await athleteRequest(
        `/athlete/training/sessions/${encodeURIComponent(id)}/skip`,
        {},
      );
      setConfirmSkip(false);
      reload();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rest = session ? restBetween(session) : null;
  const facts = session
    ? ([
        ["Obiettivo", session.goal],
        [
          "Durata",
          session.durationMinutes ? `${session.durationMinutes} minuti` : null,
        ],
        ["Area", session.track === "AREA" ? sessionArea(session) : null],
        ["Prerequisiti", session.prerequisites],
        ["Recupero tra esercizi", rest ? `${rest} secondi` : null],
        ["Come si esegue", session.mode ? modeLabels[session.mode] : null],
        ["Attrezzatura", session.equipment],
      ].filter(([, value]) => value) as [string, string][])
    : [];
  const steps = session ? sessionSteps(session) : [];
  const effort = session ? effortFromRating(session.completionRating) : null;
  return (
    <SubscriberShell
      back={
        session
          ? `/user/training?date=${session.date}&view=day`
          : "/user/training"
      }
      kicker={
        session
          ? [
              `Sessione ${twoDigits(session.sequence)}`,
              session.week ? `Settimana ${twoDigits(session.week)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : "Sessione"
      }
      error={error}
      reload={reload}
      loading={!session}
      footer={
        session?.canAct && !confirmSkip ? (
          <Link
            className="pfs-cta"
            href={`/user/training/sessions/${session.id}/esegui`}
          >
            Inizia la sessione
          </Link>
        ) : undefined
      }
    >
      {session && (
        <article className="pfs-sheet">
          <h1 className="pfs-title">{session.title}</h1>
          {!!sessionMeta(session).length && (
            <p className="pfs-meta">{sessionMeta(session).join(" · ")}</p>
          )}
          {failure && (
            <p className="pfs-alert" role="alert">
              {failure}
            </p>
          )}
          <section className="pfs-sheet-section">
            <span className="pfs-kicker">Perché questa sessione</span>
            <p className="pfs-body">{session.body}</p>
            {session.summary && <p className="pfs-small">{session.summary}</p>}
          </section>
          {!!facts.length && (
            <dl className="pfs-grid">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <button className="pfs-link pfs-print" onClick={() => window.print()}>
            Stampa la scheda
          </button>
          <section className="pfs-sheet-section">
            <span className="pfs-kicker">
              {session.exercises?.length ? "Gli esercizi" : "La sessione"}
            </span>
            <ol className="pfs-exercises">
              {steps.map((step, index) => (
                <li key={`${step.name}-${index}`}>
                  <small>{twoDigits(index + 1)}</small>
                  <strong>{step.name}</strong>
                  <span>{step.prescription}</span>
                </li>
              ))}
            </ol>
          </section>
          {session.canAct ? (
            confirmSkip ? (
              <section className="pfs-card">
                <h2>Salti questa sessione?</h2>
                <p>Resterà nel calendario come saltata.</p>
                <button className="pfs-cta" disabled={busy} onClick={skip}>
                  {busy ? "Salvataggio…" : "Conferma: salta la sessione"}
                </button>
                <button
                  className="pfs-link"
                  disabled={busy}
                  onClick={() => setConfirmSkip(false)}
                >
                  Torna alla sessione
                </button>
              </section>
            ) : (
              <button
                className="pfs-link pfs-skip"
                onClick={() => setConfirmSkip(true)}
              >
                Salta la sessione
              </button>
            )
          ) : (
            <section className="pfs-card pfs-outcome">
              <span className="pfs-kicker">
                {sessionLabels[session.displayStatus]}
              </span>
              {effort !== null && <p>Fatica percepita: {effort} / 5</p>}
              {session.completionNotes && (
                <p className="pfs-body">{session.completionNotes}</p>
              )}
              <Link className="pfs-row-link" href="/user">
                Torna alla home <span aria-hidden="true">→</span>
              </Link>
            </section>
          )}
        </article>
      )}
    </SubscriberShell>
  );
}
