"use client";
import type { MicroTestFilter } from "../_account/account-data";

/** Nome del filtro per i testi: «teorici», «pratici sul campo»… */
export const FILTER_TEXT: Record<MicroTestFilter, string> = {
  THEORY: "teorici",
  ON_COURT: "pratici sul campo",
  OFF_COURT: "pratici fuori dal campo",
};

const WHERE: { filter: MicroTestFilter; label: string; icon: string }[] = [
  {
    filter: "ON_COURT",
    label: "Sul campo",
    icon: "M4 5h16v14H4z M4 12h16 M12 5v14",
  },
  {
    filter: "OFF_COURT",
    label: "Fuori dal campo",
    icon: "M6 8v8 M18 8v8 M3 10v4 M21 10v4 M6 12h12",
  },
];

/**
 * Filtro della demo V10: «Teorici» o «Pratici» e, per i pratici, «Sul
 * campo» o «Fuori dal campo». Ogni filtro ha il suo test di oggi.
 */
export function FilterBar({
  filter,
  practical,
  onChange,
}: {
  filter: MicroTestFilter;
  /** L'ultimo luogo scelto, per tornare ai pratici dove si era. */
  practical: Exclude<MicroTestFilter, "THEORY">;
  onChange: (filter: MicroTestFilter) => void;
}) {
  const isPractical = filter !== "THEORY";
  return (
    <div className="pf-mt-filters">
      <div
        className="pf-mt-kinds"
        role="radiogroup"
        aria-label="Tipo di micro-test"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!isPractical}
          onClick={() => onChange("THEORY")}
        >
          Teorici
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={isPractical}
          onClick={() => onChange(practical)}
        >
          Pratici
        </button>
      </div>
      {isPractical && (
        <div
          className="pf-mt-wheres"
          role="radiogroup"
          aria-label="Dove fai il micro-test"
        >
          {WHERE.map((w) => (
            <button
              key={w.filter}
              type="button"
              role="radio"
              aria-checked={filter === w.filter}
              onClick={() => onChange(w.filter)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={w.icon} />
              </svg>
              {w.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
