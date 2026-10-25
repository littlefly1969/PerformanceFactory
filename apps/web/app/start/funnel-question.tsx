import type { ReactNode, Ref } from "react";
import type { DiscoveryOption, DiscoveryQuestion } from "./discovery-types";
import { DiscoveryQuestionRenderer } from "./question-renderer";
import { NumberGauge } from "./number-gauge";

/** Illustrazione vettoriale del riquadro scuro: un campo in prospettiva. */
function CourtIllustration() {
  return (
    <svg className="pf4-illustration" viewBox="0 0 320 150" aria-hidden="true">
      <path d="M60 140 110 22h100l50 118Z" />
      <path d="M85 81h150M160 22v118M98 52h124M72 112h176" />
      <circle cx="214" cy="60" r="7" className="pf4-ball" />
    </svg>
  );
}

/**
 * Domanda del funnel: riquadro scuro in alto (illustrazione o quadrante
 * numerico) e foglio chiaro con titolo, risposte e pulsante.
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
  return (
    <>
      <div className={`pf4-hero${numeric ? " pf4-hero-gauge" : ""}`}>
        {numeric ? (
          <NumberGauge
            value={typeof value === "number" ? value : undefined}
            min={question.min}
            max={question.max}
            unit={question.ui?.unit}
          />
        ) : (
          <div className="pf4-hero-art">
            <CourtIllustration />
          </div>
        )}
      </div>
      <div className="pf4-sheet">
        <section
          className={`pf4-body pf4-question${numeric ? " pf4-question-number" : ""}`}
        >
          <h1 ref={headingRef} tabIndex={-1}>
            {question.title}
          </h1>
          {question.description && <p>{question.description}</p>}
          {question.type === "multi_choice" && (
            <p>Puoi scegliere più risposte.</p>
          )}
          <DiscoveryQuestionRenderer
            question={question}
            options={options}
            value={value}
            onChange={onChange}
          />
        </section>
        {footer}
      </div>
    </>
  );
}
