import { useState } from "react";
import type { Calibration, Evaluation } from "./journey-types";
import { confidenceLabel } from "./provisional-evaluation";
import { MultiChoiceOptions } from "./choice-options";

/** Id domanda → valore scelto, o elenco se la domanda è multipla. */
type Answers = Record<string, string | string[]>;

const LEVELS: Record<string, string> = {
  BEGINNER: "Principiante",
  INTERMEDIATE: "Intermedio",
  ADVANCED: "Avanzato",
  COMPETITIVE: "Agonista",
  PRO: "Professionista",
};

/**
 * Micro-test proposto dall'AI: istruzioni, durata e sicurezza, poi l'esito
 * che l'atleta riporta. Si può saltare se ora non si può fare.
 */
function MicroTestForm({
  question: q,
  driver,
  busy,
  onSubmit,
  onSkip,
}: {
  question: NonNullable<Calibration["round"]>["questions"][number];
  driver: string | undefined;
  busy: boolean;
  onSubmit: (answers: Record<string, string>) => void;
  onSkip: () => void;
}) {
  const [value, setValue] = useState<string>();
  const test = q.microTest!;
  return (
    <form
      className="pf4-calibration-round"
      onSubmit={(event) => {
        event.preventDefault();
        if (value !== undefined) onSubmit({ [q.id]: value });
      }}
    >
      <p className="pf4-kicker">
        Micro-test{driver ? ` · ${driver}` : ""}
        {test.durationMinutes ? ` · circa ${test.durationMinutes} minuti` : ""}
      </p>
      <h3>{q.text}</h3>
      <p>{test.instructions}</p>
      {test.safetyNotes && (
        <p className="pf4-note">
          <strong>Sicurezza:</strong> {test.safetyNotes}
        </p>
      )}
      <fieldset>
        <legend>Com&apos;è andata? L&apos;esito lo riporti tu.</legend>
        <div className="pf4-options">
          {q.options.map((o) => (
            <button
              type="button"
              key={o.value}
              disabled={busy}
              aria-pressed={value === o.value}
              className={`pf4-option ${value === o.value ? "is-selected" : ""}`}
              onClick={() => setValue(o.value)}
            >
              <span>{o.label}</span>
              <span className="pf4-dot" />
            </button>
          ))}
        </div>
      </fieldset>
      <button className="pf4-cta" disabled={busy || value === undefined}>
        {busy ? "Aggiorniamo la tua valutazione…" : "Invia l'esito →"}
      </button>
      <button
        type="button"
        className="pf4-link"
        disabled={busy}
        onClick={onSkip}
      >
        Non posso farlo ora
      </button>
    </form>
  );
}

/** Domande del round aperto: si inviano tutte insieme, poi R e confidence si aggiornano. */
function RoundForm({
  round,
  busy,
  onSubmit,
}: {
  round: NonNullable<Calibration["round"]>;
  busy: boolean;
  onSubmit: (answers: Answers) => void;
}) {
  const [answers, setAnswers] = useState<Answers>(round.answers ?? {});
  const complete = round.questions.every((q) =>
    q.multiple ? !!answers[q.id]?.length : answers[q.id] !== undefined,
  );
  return (
    <form
      className="pf4-calibration-round"
      onSubmit={(event) => {
        event.preventDefault();
        if (complete) onSubmit(answers);
      }}
    >
      {round.action === "REQUEST_CLARIFICATION" && (
        <p className="pf4-kicker">Un chiarimento</p>
      )}
      {round.questions.map((q, index) => (
        <fieldset key={q.id}>
          <legend>
            {round.questions.length > 1 ? `${index + 1}. ` : ""}
            {q.text}
          </legend>
          {q.multiple ? (
            <MultiChoiceOptions
              options={q.options}
              selected={[answers[q.id] ?? []].flat()}
              busy={busy}
              onChange={(next) => setAnswers({ ...answers, [q.id]: next })}
            />
          ) : (
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
          )}
        </fieldset>
      ))}
      <button className="pf4-cta" disabled={busy || !complete}>
        {busy
          ? "Aggiorniamo la tua valutazione…"
          : round.questions.length > 1
            ? "Invia le risposte →"
            : "Invia la risposta →"}
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
  onSkip,
}: {
  calibration: Calibration;
  evaluation: Evaluation;
  busy: boolean;
  onOpenRound: () => void;
  onAnswer: (roundId: string, answers: Answers) => void;
  onSkip: (roundId: string) => void;
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
          Il prossimo passo sono i tuoi scenari a 4, 6 e 12 mesi.
        </p>
      ) : c.round?.action === "PROPOSE_MICRO_TEST" &&
        c.round.questions[0]?.microTest ? (
        <>
          <p>
            Una prova pratica breve: dice sul driver più di quanto possano dire
            le domande.
          </p>
          <MicroTestForm
            key={c.round.id}
            question={c.round.questions[0]}
            driver={
              evaluation.drivers.find(
                (d) => d.id === c.round!.questions[0].areaId,
              )?.name
            }
            busy={busy}
            onSubmit={(answers) => onAnswer(c.round!.id, answers)}
            onSkip={() => onSkip(c.round!.id)}
          />
        </>
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
            Ogni passo fa qualche domanda mirata, o propone una breve prova
            pratica, sui driver meno affidabili. Puoi continuare subito o
            riprendere quando vuoi: R si consolida quando le tue risposte sono
            abbastanza coerenti e complete.
          </p>
          <button className="pf4-cta" disabled={busy} onClick={onOpenRound}>
            {busy ? "Prepariamo le domande…" : "Nuove domande →"}
          </button>
        </>
      )}
    </section>
  );
}
