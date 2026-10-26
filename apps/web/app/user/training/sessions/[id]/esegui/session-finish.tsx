"use client";
import { useState } from "react";
import { SubscriberShell } from "../../../../_components/subscriber-shell";
import { athleteRequest } from "../../../../_components/use-athlete";
import type { Exercise, Session } from "../../../../_components/athlete-types";
import {
  capitalized,
  inWords,
  ratingFromEffort,
} from "../../../../_components/session-format";

/** Nota per il coach e per l'AI: gli esercizi saltati pesano sul prossimo ciclo. */
export function completionNote(
  steps: Exercise[],
  outcomes: string[],
  note: string,
) {
  const skipped = steps.filter((_, i) => outcomes[i] === "SKIPPED");
  return [
    note.trim(),
    skipped.length
      ? `Esercizi saltati: ${skipped.map((s) => s.name).join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 5000);
}

export function SessionFinish({
  session,
  steps,
  outcomes,
  startedAt,
  onSaved,
}: {
  session: Session;
  steps: Exercise[];
  outcomes: string[];
  startedAt: number;
  onSaved: () => void;
}) {
  const [effort, setEffort] = useState<number>();
  const [note, setNote] = useState("");
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const done = outcomes.filter((o) => o === "DONE").length;
  const [minutes] = useState(() =>
    Math.max(1, Math.round((Date.now() - startedAt) / 60000)),
  );
  async function save() {
    if (!effort) return;
    setBusy(true);
    setFailure("");
    try {
      const completionNotes = completionNote(steps, outcomes, note);
      await athleteRequest(
        `/athlete/training/sessions/${encodeURIComponent(session.id)}/complete`,
        {
          completionRating: ratingFromEffort(effort),
          ...(completionNotes ? { completionNotes } : {}),
        },
      );
      onSaved();
    } catch (e) {
      setFailure((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <SubscriberShell
      footer={
        <button className="pfs-cta" disabled={!effort || busy} onClick={save}>
          {busy ? "Salvataggio…" : "Torna alla home"}
        </button>
      }
    >
      <div className="pfs-finish">
        <i className="pfs-rule" aria-hidden="true" />
        <span className="pfs-kicker">Sessione completata</span>
        <h1 className="pfs-title">
          {capitalized(inWords(done))} su {inWords(steps.length)}.
        </h1>
        <span className="pfs-kicker">Com’è andata?</span>
        <div className="pfs-effort" role="group" aria-label="Fatica da 1 a 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              aria-pressed={effort === n}
              onClick={() => setEffort(n)}
              disabled={busy}
            >
              {n}
            </button>
          ))}
        </div>
        <small className="pfs-scale">1 = troppo facile · 5 = al limite</small>
        <dl className="pfs-rows">
          <div>
            <dt>Durata</dt>
            <dd>{minutes} min</dd>
          </div>
          <div>
            <dt>Esercizi</dt>
            <dd>
              {done} su {steps.length}
            </dd>
          </div>
          {session.planVersion && (
            <div>
              <dt>Piano</dt>
              <dd>v{session.planVersion}.0</dd>
            </div>
          )}
        </dl>
        <div className="pfs-adapt">
          <strong>Il tuo piano si adatta a come hai risposto.</strong>
          <p>Dicci com’è andata: è il dato che usiamo per adattarlo.</p>
          {writing ? (
            <label>
              Una nota per il coach (facoltativa)
              <textarea
                maxLength={4000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
                placeholder="Cosa hai sentito durante la sessione?"
              />
            </label>
          ) : (
            <button className="pfs-link" onClick={() => setWriting(true)}>
              Aggiungi una nota
            </button>
          )}
        </div>
        {failure && (
          <p className="pfs-alert" role="alert">
            {failure}
          </p>
        )}
      </div>
    </SubscriberShell>
  );
}
