import type { ReactNode, Ref } from "react";
import type { DiscoveryOption, DiscoveryQuestion } from "./discovery-types";
import { DiscoveryQuestionRenderer } from "./question-renderer";
import { NumberGauge } from "./number-gauge";
import { PadelCourt } from "./padel-court";

/** Le domande con una data sono pagine chiare, senza campo (demo PF10). */
export const isPlainQuestion = (question: DiscoveryQuestion) =>
  question.type === "date";

/**
 * Domanda del funnel: campo da padel animato (o quadrante numerico) sullo
 * scuro e foglio chiaro con titolo, risposte e pulsante.
 */
export function FunnelQuestion({
  question,
  options,
  value,
  headingRef,
  onChange,
  footer,
}: {
  question: DiscoveryQuestion;
  options: DiscoveryOption[];
  value: unknown;
  headingRef: Ref<HTMLHeadingElement>;
  onChange: (value: unknown) => void;
  footer?: ReactNode;
}) {
  const numeric = question.type === "number" || question.type === "scale";
  const stepper =
    question.type === "single_choice" &&
    question.ui?.presentation === "stepper";
  const hints = [
    question.description,
    question.type === "multi_choice" ? "Puoi scegliere più risposte." : "",
  ].filter(Boolean);
  const content = (
    <>
      <h1 ref={headingRef} tabIndex={-1}>
        {question.title}
      </h1>
      {hints.length > 0 && <p>{hints.join("\n")}</p>}
      <DiscoveryQuestionRenderer
        question={question}
        options={options}
        value={value}
        onChange={onChange}
      />
    </>
  );
  if (isPlainQuestion(question))
    return (
      <>
        <section className="pf4-body pf4-plain pf4-question">{content}</section>
        {footer}
      </>
    );
  return (
    <>
      <div
        className={`pf4-hero${numeric ? " pf4-hero-gauge" : " pf4-hero-court"}`}
      >
        {numeric ? (
          <NumberGauge
            value={typeof value === "number" ? value : undefined}
            min={question.min}
            max={question.max}
            unit={question.ui?.unit}
          />
        ) : (
          <PadelCourt />
        )}
      </div>
      <div className="pf4-sheet">
        <section
          className={`pf4-body pf4-question${numeric ? " pf4-question-number" : ""}${stepper ? " pf4-question-stepper" : ""}`}
        >
          {content}
        </section>
        {footer}
      </div>
    </>
  );
}
