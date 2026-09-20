"use client";
import Link from "next/link";
import { useState } from "react";
import { AthleteShell } from "../../../_components/athlete-shell";
import { athleteRequest, useAthlete } from "../../../_components/use-athlete";
import {
  displayDate,
  sessionLabels,
  type Session,
} from "../../../_components/athlete-types";
export function SessionDetail({ id }: { id: string }) {
  const {
    data: session,
    error,
    reload,
  } = useAthlete<Session>(
    `/athlete/training/sessions/${encodeURIComponent(id)}`,
  );
  const [stage, setStage] = useState<"detail" | "feedback" | "skip" | "done">(
    "detail",
  );
  const [rating, setRating] = useState<number>();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  async function finish(action: "complete" | "skip") {
    setBusy(true);
    setFailure("");
    try {
      await athleteRequest(
        `/athlete/training/sessions/${encodeURIComponent(id)}/${action}`,
        action === "complete"
          ? { completionRating: rating, completionNotes: notes || undefined }
          : {},
      );
      setStage("done");
      reload();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AthleteShell
      label="Training · Sessione"
      error={error}
      reload={reload}
      loading={!session}
    >
      {session && (
        <>
          <Link
            className="pf4-text-link"
            href={`/user/training?date=${session.date}`}
          >
            ← Calendario
          </Link>
          <div className="pf4-session-heading">
            <span className="pf4-kicker">
              {displayDate(session.date)} ·{" "}
              {sessionLabels[session.displayStatus]}
            </span>
            <h1>{session.title}</h1>
            <p>{session.type}</p>
          </div>
          {failure && (
            <p className="pf4-error" role="alert">
              {failure}
            </p>
          )}
          {stage === "feedback" && session.canAct ? (
            <section className="pf4-feedback">
              <span className="pf4-kicker">Sessione conclusa</span>
              <h2>Come è andata?</h2>
              <p>Se vuoi, lascia una valutazione e una nota al tuo coach.</p>
              <div className="pf4-rating" aria-label="Valutazione da 1 a 5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    aria-pressed={rating === n}
                    onClick={() => setRating(rating === n ? undefined : n)}
                    disabled={busy}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <label>
                La tua nota (facoltativa)
                <textarea
                  maxLength={5000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={busy}
                  placeholder="Cosa hai sentito durante la sessione?"
                />
              </label>
              <button
                className="pf4-cta"
                disabled={busy}
                onClick={() => finish("complete")}
              >
                {busy ? "Salvataggio…" : "Salva e chiudi →"}
              </button>
              <button
                className="pf4-text-link"
                disabled={busy}
                onClick={() => setStage("detail")}
              >
                Indietro
              </button>
            </section>
          ) : stage === "skip" && session.canAct ? (
            <section className="pf4-feedback">
              <h2>Salti questa sessione?</h2>
              <p>Resterà nel calendario come saltata.</p>
              <button
                className="pf4-cta"
                disabled={busy}
                onClick={() => finish("skip")}
              >
                {busy ? "Salvataggio…" : "Conferma: salta la sessione"}
              </button>
              <button
                className="pf4-text-link"
                disabled={busy}
                onClick={() => setStage("detail")}
              >
                Torna alla sessione
              </button>
            </section>
          ) : (
            <>
              {stage === "done" && (
                <div className="pf4-saved" role="status">
                  Sessione salvata.{" "}
                  <Link href="/user">Scopri il prossimo passo →</Link>
                </div>
              )}
              {session.summary && (
                <section className="pf4-athlete-section">
                  <span className="pf4-kicker">Il tuo programma</span>
                  <p>{session.summary}</p>
                </section>
              )}
              {!!session.details.length && (
                <dl className="pf4-profile">
                  {session.details.map((d) => (
                    <div key={d.label}>
                      <dt>{d.label}</dt>
                      <dd>{d.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <section className="pf4-athlete-section">
                <span className="pf4-kicker">La sessione</span>
                <div className="pf4-session-body">{session.body}</div>
              </section>
              {session.canAct && stage !== "done" ? (
                <div className="pf4-session-actions">
                  <button
                    className="pf4-cta"
                    onClick={() => setStage("feedback")}
                  >
                    Segna come completata ✓
                  </button>
                  <button
                    className="pf4-text-link"
                    onClick={() => setStage("skip")}
                  >
                    Salta la sessione
                  </button>
                </div>
              ) : (
                <section className="pf4-athlete-section">
                  <span className="pf4-kicker">
                    {sessionLabels[session.displayStatus]}
                  </span>
                  {session.completionRating !== null && (
                    <p>La tua valutazione: {session.completionRating} / 5</p>
                  )}
                  {session.completionNotes && (
                    <p className="pf4-session-body">
                      {session.completionNotes}
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </AthleteShell>
  );
}
