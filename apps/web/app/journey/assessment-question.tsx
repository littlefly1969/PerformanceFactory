import { CourtIllustration } from "../start/funnel-question";
import { CardNumberStep } from "./card-number-step";
import { MultiChoiceStep } from "./choice-options";
import type { Journey } from "./journey-types";

type Question = Journey["questions"][number];

/**
 * Domanda dell'assessment con l'aspetto del funnel: riquadro scuro in alto,
 * foglio chiaro sotto. Disponibilità e classifica FIT arrivano per prime,
 * subito dopo la creazione dell'account.
 */
export function AssessmentQuestion({
  question: q,
  position,
  count,
  answer,
  busy,
  onAnswer,
}: {
  question: Question;
  position: number;
  count: number;
  answer: unknown;
  busy: boolean;
  onAnswer: (value: unknown) => unknown;
}) {
  return (
    <>
      <div className="pf4-hero">
        <div className="pf4-hero-art">
          <CourtIllustration />
        </div>
      </div>
      <div className="pf4-sheet">
        <section className="pf4-body pf4-question" key={q.id}>
          <span className="pf4-kicker">
            {position} / {count} · {q.section ?? q.areaName}
          </span>
          <h1>{q.title}</h1>
          {q.inputType === "TEXT" ? (
            <CardNumberStep
              key={q.id}
              initial={String(answer ?? "")}
              busy={busy}
              onSubmit={onAnswer}
            />
          ) : q.multiple ? (
            <MultiChoiceStep
              key={q.id}
              options={q.options}
              initial={answer}
              busy={busy}
              onSubmit={onAnswer}
            />
          ) : (
            <div className="pf4-options">
              {q.options.map((o) => {
                const selected = String(answer) === String(o.value);
                return (
                  <button
                    disabled={busy}
                    aria-pressed={selected}
                    className={`pf4-option ${selected ? "is-selected" : ""}`}
                    key={String(o.value)}
                    onClick={() => onAnswer(o.value)}
                  >
                    <span>{o.label}</span>
                    <span className="pf4-dot" />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
