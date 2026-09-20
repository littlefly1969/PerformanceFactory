"use client";
import Link from "next/link";
import { useState } from "react";
import { AthleteShell } from "../_components/athlete-shell";
import { athleteRequest, useAthlete } from "../_components/use-athlete";
import type { CheckIn } from "../_components/athlete-types";
function Questionnaire({ checkIn }: { checkIn: CheckIn }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const q = checkIn.questions[index];
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await athleteRequest(
        checkIn.kind === "TRAINING"
          ? "/answers/training/batch"
          : "/answers/batch",
        {
          questionSetId: checkIn.id,
          answers: checkIn.questions.map((q) => ({
            questionId: q.id,
            answerOptionId: answers[q.id],
          })),
        },
      );
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <section className="pf4-check-in">
        <span className="pf4-badge">✓ Check-in salvato</span>
        <h1>Ripartiamo da come stai.</h1>
        <p>Le tue risposte sono state registrate.</p>
        <Link className="pf4-cta" href="/user">
          Torna alla Home →
        </Link>
        <Link className="pf4-text-link" href="/user/performance">
          Guarda i progressi →
        </Link>
      </section>
    );
  if (!q) return <p>Questo check-in non contiene domande.</p>;
  return (
    <section className="pf4-check-in">
      <div
        className="pf4-progress"
        role="progressbar"
        aria-label="Avanzamento check-in"
        aria-valuenow={index}
        aria-valuemax={checkIn.questions.length}
        aria-valuemin={0}
      >
        {checkIn.questions.map((question, i) => (
          <span className={i < index ? "is-complete" : ""} key={question.id} />
        ))}
      </div>
      <p className="pf4-kicker">
        {checkIn.title} · {index + 1} / {checkIn.questions.length}
      </p>
      <h1>{q.text}</h1>
      <div className="pf4-options">
        {q.options.map((o, i) => (
          <button
            className={`pf4-option ${answers[q.id] === o.id ? "is-selected" : ""}`}
            key={o.id}
            aria-pressed={answers[q.id] === o.id}
            onClick={() => setAnswers({ ...answers, [q.id]: o.id })}
            disabled={busy}
          >
            <small>{String.fromCharCode(65 + i)}</small>
            <span>{o.label}</span>
            <span className="pf4-dot" />
          </button>
        ))}
      </div>
      {error && (
        <p className="pf4-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="pf4-cta"
        disabled={busy || !answers[q.id]}
        onClick={() =>
          index + 1 < checkIn.questions.length
            ? setIndex(index + 1)
            : void submit()
        }
      >
        {busy
          ? "Salvataggio…"
          : index + 1 < checkIn.questions.length
            ? "Continua →"
            : "Concludi il check-in →"}
      </button>
      {index > 0 && (
        <button
          className="pf4-text-link"
          disabled={busy}
          onClick={() => setIndex(index - 1)}
        >
          ← Indietro
        </button>
      )}
    </section>
  );
}
export default function CheckInPage() {
  const { data, error, reload } = useAthlete<CheckIn | null>(
    "/athlete/check-in",
  );
  return (
    <AthleteShell
      label="Check-in"
      loading={data === undefined}
      error={error}
      reload={reload}
    >
      {data ? (
        <Questionnaire key={data.id} checkIn={data} />
      ) : (
        data === null && (
          <>
            <h1>Sei in pari.</h1>
            <p>Il prossimo check-in comparirà qui al termine delle attività.</p>
            <Link className="pf4-cta" href="/user">
              Torna alla Home →
            </Link>
          </>
        )
      )}
    </AthleteShell>
  );
}
