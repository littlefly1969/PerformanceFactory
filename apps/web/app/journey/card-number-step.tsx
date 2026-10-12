"use client";
import { useState } from "react";

/** Numero di tessera FIT: facoltativo, si può proseguire anche vuoto. */
export function CardNumberStep({
  initial,
  busy,
  onSubmit,
}: {
  initial: string;
  busy: boolean;
  onSubmit: (value: string) => unknown;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="pf4-card-number"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(value.trim());
      }}
    >
      <label>
        <span>
          Ci serve solo per riconoscere la tua classifica; puoi saltarlo.
        </span>
        <input
          value={value}
          maxLength={30}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <button className="pf4-cta" disabled={busy}>
        {value.trim() ? "Continua →" : "Salta →"}
      </button>
    </form>
  );
}
