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
 * affidabile. Nessuna attesa fra un round e l'altro e nessun conto alla
 * rovescia: R si consolida quando le evidenze bastano (PF-FS-PREPAYWALL §4.3, §7).
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
  const completed =
    c.status === "CALIBRATION_COMPLETED" || c.status === "PAYWALL_READY";
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
        {completed ? "Calibrazione completata" : "Calibrazione"}
      </span>
      <h2 id="pf4-calibration-title">
        {completed
          ? "La tua R è consolidata."
          : "Rendiamo la stima più precisa."}
      </h2>
      {level && (
        <p>
          Livello stimato: <strong>{level}</strong> (affidabilità{" "}
          {confidenceLabel(evaluation.levelConfidence ?? 0)}).
        </p>
      )}
      {c.status === "FREE_LESSON_VALIDATION" && (
        <p role="status">
          Hai chiesto la lezione gratuita: la tua R e il tuo potenziale si
          chiudono dopo il feedback del coach del circolo.
        </p>
      )}
      {completed ? (
        <p>
          {c.completionReason === "CONFIDENCE_REACHED"
            ? "Le tue risposte sono abbastanza coerenti e complete per una stima affidabile."
            : "I driver ancora poco affidabili restano indicati come tali, senza valori inventati."}{" "}
          Il prossimo passo sono i tuoi scenari a 3, 6 e 12 mesi.
        </p>
      ) : c.round ? (
        <>
          <p>Poche domande sui driver dove la stima è meno sicura.</p>
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
            Puoi continuare subito o riprendere quando vuoi: R si consolida
            quando le tue risposte sono abbastanza coerenti e complete.
          </p>
          <button className="pf4-cta" disabled={busy} onClick={onOpenRound}>
            {busy ? "Prepariamo le domande…" : "Nuove domande →"}
          </button>
        </>
      )}
    </section>
  );
}
