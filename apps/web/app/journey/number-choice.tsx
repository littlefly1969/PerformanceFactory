"use client";
import { useState } from "react";
import { NumberGauge } from "../start/number-gauge";
import "./number-choice.css";

type Option = { value: string | number; label: string };

/**
 * Numero dell'opzione, solo se è una quantità: il valore è un numero e
 * l'etichetta comincia con lo stesso numero («5 giorni»). Gli id seriali delle
 * opzioni scritte dall'AI («0» per «Mai») non sono quantità.
 */
export function optionNumber(option: Option) {
  const value =
    typeof option.value === "number" ? option.value : Number(option.value);
  if (!Number.isFinite(value) || String(option.value).trim() === "")
    return null;
  const shown = option.label.match(/^\s*(\d+(?:[.,]\d+)?)/)?.[1];
  return shown !== undefined && Number(shown.replace(",", ".")) === value
    ? value
    : null;
}

/**
 * Domanda quantitativa: una domanda operativa (giorni, minuti) con almeno tre
 * opzioni, tutte quantità, a scelta singola. Si risponde con il quadrante,
 * non con un elenco lungo. Le domande dei driver restano scelte.
 */
export function numericOptions(question: {
  options: Option[];
  multiple?: boolean;
  kind?: string;
}) {
  const { options } = question;
  if (
    (question.kind !== undefined && question.kind !== "OPERATIONAL") ||
    question.multiple ||
    options.length < 3
  )
    return null;
  const numbers = options.map(optionNumber);
  if (numbers.some((n) => n === null)) return null;
  return options
    .map((option, i) => ({ option, number: numbers[i]! }))
    .sort((a, b) => a.number - b.number);
}

/** Unità dell'opzione: l'etichetta senza il numero («5 giorni» → «giorni»). */
export const optionUnit = (label: string) =>
  label.replace(/^\s*[\d.,]+\s*/, "").trim();

/**
 * Risposta numerica del percorso: quadrante, più e meno, un valore alla volta
 * fra le opzioni previste. Sostituisce l'elenco di opzioni numeriche.
 */
export function NumberChoiceStep({
  options,
  selected,
  busy,
  onSubmit,
}: {
  options: Option[];
  selected: unknown;
  busy: boolean;
  onSubmit: (value: string | number) => unknown;
}) {
  const sorted = numericOptions({ options })!;
  const answered = sorted.findIndex(
    (o) => String(o.option.value) === String(selected),
  );
  // Senza risposta si parte dal valore centrale: «Continua» conferma ciò che si vede.
  const [index, setIndex] = useState(
    answered >= 0 ? answered : Math.floor((sorted.length - 1) / 2),
  );
  const current = sorted[index];
  const move = (direction: 1 | -1) =>
    setIndex((i) => Math.min(sorted.length - 1, Math.max(0, i + direction)));
  return (
    <form
      className="pf4-number-choice"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(current.option.value);
      }}
    >
      <NumberGauge
        value={current.number}
        min={sorted[0].number}
        max={sorted[sorted.length - 1].number}
        unit={optionUnit(current.option.label)}
      />
      <div className="pf4-number pf4-stepper">
        <div>
          <button
            type="button"
            aria-label="Diminuisci"
            disabled={busy || index === 0}
            onClick={() => move(-1)}
          >
            −
          </button>
          <output aria-live="polite">{current.option.label}</output>
          <button
            type="button"
            aria-label="Aumenta"
            disabled={busy || index === sorted.length - 1}
            onClick={() => move(1)}
          >
            +
          </button>
        </div>
        <small>
          Min {sorted[0].number} · Max {sorted[sorted.length - 1].number}{" "}
          {optionUnit(sorted[sorted.length - 1].option.label)}
        </small>
      </div>
      <button className="pf4-cta" disabled={busy}>
        Continua →
      </button>
    </form>
  );
}
