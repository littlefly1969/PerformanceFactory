"use client";
import { useState } from "react";

type Option = { value: string | number; label: string; exclusive?: boolean };

/**
 * Nuova selezione di una domanda multipla: un'opzione esclusiva («Nessuna»)
 * resta da sola, una scelta normale toglie l'esclusiva.
 */
export function toggleChoice(
  options: Option[],
  selected: string[],
  value: string,
) {
  if (selected.includes(value)) return selected.filter((v) => v !== value);
  const option = options.find((o) => String(o.value) === value);
  if (option?.exclusive) return [value];
  return [
    ...selected.filter(
      (v) => !options.some((o) => o.exclusive && String(o.value) === v),
    ),
    value,
  ];
}

/** Opzioni di una domanda a scelta multipla scritta dall'AI. */
export function MultiChoiceOptions({
  options,
  selected,
  busy,
  onChange,
}: {
  options: Option[];
  selected: string[];
  busy: boolean;
  onChange: (next: string[]) => void;
}) {
  return (
    <>
      <p>Puoi scegliere più risposte.</p>
      <div className="pf4-options">
        {options.map((o) => {
          const value = String(o.value);
          const pressed = selected.includes(value);
          return (
            <button
              type="button"
              key={value}
              disabled={busy}
              aria-pressed={pressed}
              className={`pf4-option ${pressed ? "is-selected" : ""}`}
              onClick={() => onChange(toggleChoice(options, selected, value))}
            >
              <span>{o.label}</span>
              <span className="pf4-dot pf4-square" />
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Domanda multipla dell'assessment: si sceglie, poi si conferma. */
export function MultiChoiceStep({
  options,
  initial,
  busy,
  onSubmit,
}: {
  options: Option[];
  initial: unknown;
  busy: boolean;
  onSubmit: (value: string[]) => unknown;
}) {
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(initial) ? initial.map(String) : [],
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (selected.length) void onSubmit(selected);
      }}
    >
      <MultiChoiceOptions
        options={options}
        selected={selected}
        busy={busy}
        onChange={setSelected}
      />
      <button className="pf4-cta" disabled={busy || !selected.length}>
        Continua →
      </button>
    </form>
  );
}
