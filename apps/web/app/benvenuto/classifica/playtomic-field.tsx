"use client";
import {
  PLAYTOMIC_BANDS,
  parsePlaytomic,
} from "../../journey/profilo/_profile/playtomic";

/**
 * Livello Playtomic di padel nel benvenuto: lo stesso campo del profilo
 * (numero da 0 a 7 e fasce che propongono il valore centrale), sul fondo
 * scuro. Facoltativo come la tessera.
 */
export function PlaytomicField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const level = parsePlaytomic(value);
  return (
    <div className="pf-fit-playtomic">
      <label className="pf-fit-card-field">
        <span>Livello Playtomic di padel · facoltativo</span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="Da 0 a 7, es. 2,75"
          aria-invalid={level === undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <ul className="pf-fit-bands" aria-label="Fasce Playtomic">
        {PLAYTOMIC_BANDS.map((b) => {
          const on =
            typeof level === "number" && level >= b.min && level < b.max;
          return (
            <li key={b.name}>
              <button
                type="button"
                className={on ? "is-on" : undefined}
                aria-pressed={on}
                onClick={() => onChange(b.mid)}
              >
                {b.name}
                <span>{b.range}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
