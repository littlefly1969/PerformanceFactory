import { useState } from "react";
import type { Calibration, Evaluation } from "./journey-types";
import { confidenceLabel } from "./provisional-evaluation";

const LEVELS: Record<string, string> = {
  BEGINNER: "Principiante",
  INTERMEDIATE: "Intermedio",
  ADVANCED: "Avanzato",
  COMPETITIVE: "Agonista",
  PRO: "Professionista",
};

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Domande del round aperto: si inviano tutte insieme, poi R e confidence si aggiornano. */
function RoundForm({
  round,
  busy,
  onSubmit,
}: {
  round: NonNullable<Calibration["round"]>;
  busy: boolean;
  onSubmit: (answers: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    round.answers ?? {},
  );
  const complete = round.questions.every((q) => answers[q.id] !== undefined);
  return (
    <form
      className="pf4-calibration-round"
      onSubmit={(event) => {
        event.preventDefault();
        if (complete) onSubmit(answers);
      }}
    >
      {round.questions.map((q, index) => (
        <fieldset key={q.id}>
          <legend>
            {index + 1}. {q.text}
          </legend>
          <div className="pf4-options">
            {q.options.map((o) => (
              <button
                type="button"
                key={o.value}
                disabled={busy}
                aria-pressed={answers[q.id] === o.value}
                className={`pf4-option ${answers[q.id] === o.value ? "is-selected" : ""}`}
                onClick={() => setAnswers({ ...answers, [q.id]: o.value })}
              >
                <span>{o.label}</span>
                <span className="pf4-dot" />
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <button className="pf4-cta" disabled={busy || !complete}>
        {busy ? "Aggiorniamo la tua valutazione…" : "Invia le risposte →"}
      </button>
    </form>
  );
}

/**
 * Fase gratuita: niente programma, solo domande mirate che rendono R più
 * affidabile fino alla soglia o all'assessment di chiusura.
 */
export function CalibrationPanel({
  calibration: c,
  evaluation,
  busy,
  onOpenRound,
  onAnswer,
}: {
  calibration: Calibration;
  evaluation: Evaluation;
  busy: boolean;
  onOpenRound: () => void;
  onAnswer: (roundId: string, answers: Record<string, string>) => void;
}) {
  const completed = c.status === "CALIBRATION_COMPLETED";
  const level =
    evaluation.level && c.status !== "FREE_CALIBRATING"
      ? LEVELS[evaluation.level]
      : null;
  return (
    <section
      className="pf4-body pf4-calibration"
      aria-labelledby="pf4-calibration-title"
    >
      <span className="pf4-kicker">
        {completed
          ? "Calibrazione completata"
          : `Calibrazione · giorno ${c.day} di ${c.maxDays}`}
      </span>
      <h2 id="pf4-calibration-title">
        {completed
          ? "La tua R è consolidata."
          : c.round?.kind === "CLOSING"
            ? "Assessment di chiusura."
            : "Rendiamo la stima più precisa."}
      </h2>
      {level && (
        <p>
          Livello stimato: <strong>{level}</strong> (affidabilità{" "}
          {confidenceLabel(evaluation.levelConfidence ?? 0)}).
        </p>
      )}
      {completed ? (
        <p>
          {c.completionReason === "CONFIDENCE_REACHED"
            ? `Ogni driver ha raggiunto un'affidabilità di almeno ${c.confidenceThreshold} su 100.`
            : c.completionReason === "DEADLINE_REACHED"
              ? `Sono passati ${c.maxDays} giorni: abbiamo consolidato con le risposte che hai dato. I driver ancora poco affidabili restano indicati come tali, senza valori inventati.`
              : "Abbiamo chiuso con l'assessment finale: i driver ancora poco affidabili restano indicati come tali, senza valori inventati."}{" "}
          Il prossimo passo sono i tuoi scenari a 3, 6 e 12 mesi.
        </p>
      ) : c.round ? (
        <>
          <p>
            {c.round.kind === "CLOSING"
              ? "Ultime domande sui driver ancora poco affidabili: dopo queste la tua R viene consolidata."
              : "Poche domande sui driver dove la stima è meno sicura."}
          </p>
          <RoundForm
            key={c.round.id}
            round={c.round}
            busy={busy}
            onSubmit={(answers) => onAnswer(c.round!.id, answers)}
          />
        </>
      ) : (
        <>
          <p>
            Ogni round fa qualche domanda mirata sui driver meno affidabili.
            L&apos;obiettivo è un&apos;affidabilità di almeno{" "}
            {c.confidenceThreshold} su 100 per ogni driver, entro {c.maxDays}{" "}
            giorni.
            {c.roundsCompleted > 0 &&
              ` Round completati: ${c.roundsCompleted}.`}
          </p>
          {c.nextRoundAt ? (
            <p role="status">
              Le prossime domande saranno pronte {dateTime(c.nextRoundAt)}.
            </p>
          ) : (
            <button className="pf4-cta" disabled={busy} onClick={onOpenRound}>
              {busy
                ? "Prepariamo le domande…"
                : c.nextRoundKind === "CLOSING"
                  ? "Inizia l'assessment di chiusura →"
                  : "Nuove domande →"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
