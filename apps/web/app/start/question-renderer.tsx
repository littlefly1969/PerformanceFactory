import { useEffect, useState } from "react";
import type { DiscoveryOption, DiscoveryQuestion } from "./discovery-types";
import {
  bandIndex,
  counterFor,
  numberForBand,
  type ChoiceCounter,
} from "./choice-counter";

export function DiscoveryQuestionRenderer({
  question,
  value,
  options,
  onChange,
}: {
  question: DiscoveryQuestion;
  value: unknown;
  options: DiscoveryOption[];
  onChange: (value: unknown) => void;
}) {
  if (question.type === "date")
    return (
      <div className="pf4-number pf4-date-field">
        <label htmlFor={question.id}>Data</label>
        <input
          id={question.id}
          type="date"
          aria-label={question.title}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  if (question.type === "number" || question.type === "scale") {
    const current = typeof value === "number" ? value : undefined;
    const step = question.step ?? 1;
    const decimals = String(step).split(".")[1]?.length ?? 0;
    const nudge = (direction: 1 | -1) => {
      const base = current ?? question.min ?? 0;
      const next =
        current === undefined
          ? base
          : Number((base + direction * step).toFixed(decimals));
      onChange(
        Math.min(
          question.max ?? Infinity,
          Math.max(question.min ?? -Infinity, next),
        ),
      );
    };
    return (
      <div className="pf4-number pf4-stepper">
        <label htmlFor={question.id} className="pf4-sr">
          {question.title}
        </label>
        <div>
          <button
            type="button"
            aria-label="Diminuisci"
            disabled={
              current !== undefined &&
              question.min !== undefined &&
              current <= question.min
            }
            onClick={() => nudge(-1)}
          >
            −
          </button>
          <input
            id={question.id}
            type="number"
            inputMode="decimal"
            min={question.min}
            max={question.max}
            step={step}
            value={current ?? ""}
            placeholder="—"
            onChange={(e) =>
              onChange(
                e.target.value === "" ? undefined : e.target.valueAsNumber,
              )
            }
          />
          <button
            type="button"
            aria-label="Aumenta"
            disabled={
              current !== undefined &&
              question.max !== undefined &&
              current >= question.max
            }
            onClick={() => nudge(1)}
          >
            +
          </button>
        </div>
        {(question.min !== undefined || question.max !== undefined) && (
          <small>
            {question.min !== undefined && `Min ${question.min}`}
            {question.min !== undefined && question.max !== undefined && " · "}
            {question.max !== undefined && `Max ${question.max}`}
            {question.ui?.unit && ` ${question.ui.unit}`}
          </small>
        )}
      </div>
    );
  }
  const counter = counterFor(question, options);
  if (counter)
    return (
      <CounterStepper
        question={question}
        counter={counter}
        options={options}
        value={value}
        onChange={onChange}
      />
    );
  if (
    question.type === "single_choice" &&
    question.ui?.presentation === "stepper"
  )
    return (
      <ChoiceStepper
        question={question}
        options={options}
        value={value}
        onChange={onChange}
      />
    );
  const multiple = question.type === "multi_choice";
  const cards = question.ui?.presentation === "cards";
  return (
    <div
      className={`pf4-options ${cards ? "pf4-cards" : ""}`}
      style={{
        gridTemplateColumns: `repeat(${question.ui?.columns ?? 1}, minmax(0, 1fr))`,
      }}
      role="group"
      aria-label={question.title}
    >
      {options.map((option, index) => {
        const optionValue =
          question.type === "boolean" ? option.value : option.id;
        const selected = multiple
          ? Array.isArray(value) && value.includes(optionValue)
          : value === optionValue;
        return (
          <button
            type="button"
            key={option.id}
            className={`pf4-option ${selected ? "is-selected" : ""}`}
            aria-pressed={selected}
            onClick={() =>
              onChange(
                multiple
                  ? selected
                    ? (value as unknown[]).filter((v) => v !== optionValue)
                    : option.exclusive
                      ? [optionValue]
                      : [
                          ...(Array.isArray(value) ? value : []).filter(
                            (v) =>
                              !options.some((o) => o.exclusive && o.id === v),
                          ),
                          optionValue,
                        ]
                  : optionValue,
              )
            }
          >
            {cards ? (
              <>
                <span className="pf4-card-value">
                  <strong>{option.label.replace("-", "–")}</strong>
                  {question.ui?.unit && (
                    <>
                      {" "}
                      <span>{question.ui.unit}</span>
                    </>
                  )}
                </span>
                {/* Dove cade la scelta fra le opzioni, come nella demo. */}
                <span className="pf4-card-bar" aria-hidden="true">
                  <i
                    style={{
                      left: `${(index / options.length) * 100}%`,
                      width: `${100 / options.length}%`,
                    }}
                  />
                </span>
              </>
            ) : (
              <>
                <span>
                  {option.label}
                  {option.description && <small>{option.description}</small>}
                </span>
                <span
                  className={`pf4-dot ${multiple ? "pf4-square" : ""}`}
                  aria-hidden="true"
                />
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Scelta singola mostrata come selettore − / + (demo PF10): scorre le opzioni
 * nell'ordine configurato e parte vuoto, così una risposta è sempre una scelta.
 */
function ChoiceStepper({
  question,
  value,
  options,
  onChange,
}: {
  question: DiscoveryQuestion;
  value: unknown;
  options: DiscoveryOption[];
  onChange: (value: unknown) => void;
}) {
  const index = options.findIndex((option) => option.id === value);
  const current = index >= 0 ? options[index] : undefined;
  const pick = (next: number) =>
    onChange(options[Math.min(options.length - 1, Math.max(0, next))].id);
  return (
    <div
      className="pf4-choice-stepper"
      role="group"
      aria-label={question.title}
    >
      <output aria-live="polite">
        {current?.label ?? "Usa − e + per scegliere"}
      </output>
      <div>
        <button
          type="button"
          aria-label="Indietro di una risposta"
          disabled={index <= 0}
          onClick={() => pick(index - 1)}
        >
          −
        </button>
        <span aria-hidden="true">
          {index >= 0 ? `${index + 1}/${options.length}` : "—"}
        </span>
        <button
          type="button"
          aria-label="Avanti di una risposta"
          disabled={index >= options.length - 1}
          onClick={() => pick(index + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

const counterKey = (question: DiscoveryQuestion) =>
  `pf4.counter.${question.id}`;

/** Il numero scelto l'ultima volta, se cade ancora nella fascia salvata. */
function initialNumber(
  question: DiscoveryQuestion,
  counter: ChoiceCounter,
  index: number,
) {
  if (index < 0) return counter.start;
  try {
    const raw = sessionStorage.getItem(counterKey(question));
    const saved = raw === null ? NaN : Number(raw);
    if (Number.isInteger(saved) && bandIndex(counter, saved) === index)
      return saved;
  } catch {
    /* Senza storage si riparte dal primo numero della fascia. */
  }
  return numberForBand(counter, index);
}

/**
 * Contatore della demo PF10: nel pulsante solo il numero, sopra in grigio la
 * fascia (non sulla frequenza, demo V11). Parte dal valore iniziale già scelto, così «Continua» è attivo.
 */
function CounterStepper({
  question,
  counter,
  value,
  options,
  onChange,
}: {
  question: DiscoveryQuestion;
  counter: ChoiceCounter;
  value: unknown;
  options: DiscoveryOption[];
  onChange: (value: unknown) => void;
}) {
  const selected = options.findIndex((option) => option.id === value);
  const [n, setN] = useState(() => initialNumber(question, counter, selected));
  const band = bandIndex(counter, n);
  useEffect(() => {
    // Il valore iniziale è una risposta: si salva la fascia in cui cade.
    if (selected !== band) onChange(options[band].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pick = (next: number) => {
    const clamped = Math.min(counter.max, Math.max(counter.min, next));
    setN(clamped);
    try {
      sessionStorage.setItem(counterKey(question), String(clamped));
    } catch {
      /* Il numero è solo di cortesia: la risposta è la fascia. */
    }
    const index = bandIndex(counter, clamped);
    if (options[index].id !== value) onChange(options[index].id);
  };
  return (
    <div
      className="pf4-choice-stepper pf4-choice-counter"
      role="group"
      aria-label={question.title}
    >
      <output
        aria-live="polite"
        className={counter.showBand ? undefined : "pf4-sr"}
      >
        {counter.bands[band].label}
      </output>
      <div>
        <button
          type="button"
          aria-label="Diminuisci"
          disabled={n <= counter.min}
          onClick={() => pick(n - 1)}
        >
          −
        </button>
        <span aria-hidden="true">{counter.display(n)}</span>
        <button
          type="button"
          aria-label="Aumenta"
          disabled={n >= counter.max}
          onClick={() => pick(n + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
