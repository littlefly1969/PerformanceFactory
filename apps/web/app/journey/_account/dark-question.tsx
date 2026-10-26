import { useEffect, useRef, type ReactNode } from "react";
import { PF4Shell } from "../../start/pf4-shell";
import "./dark-question.css";

/**
 * Domanda nella veste del funnel: area e testo sul fondo scuro, risposte sul
 * foglio chiaro. La usano l'assessment e i round di calibrazione.
 */
export function DarkQuestion({
  kicker,
  title,
  note,
  progress,
  total,
  onBack,
  children,
  footer,
}: {
  kicker: string;
  title: string;
  note?: string;
  progress: number;
  total: number;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [title]);
  return (
    <PF4Shell
      funnel={{ tone: "dark" }}
      progress={progress}
      total={total}
      onBack={onBack}
    >
      <div className="pf4-dark-hero">
        <span className="pf4-kicker">{kicker}</span>
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        {note && <p>{note}</p>}
      </div>
      <div className="pf4-sheet">
        <section className="pf4-body pf4-question">{children}</section>
        {footer}
      </div>
    </PF4Shell>
  );
}

/** Risposte a scelta singola sul foglio chiaro, con il cerchio a destra. */
export function SingleOptions({
  options,
  selected,
  busy,
  onSelect,
}: {
  options: { value: string | number; label: string }[];
  selected: unknown;
  busy: boolean;
  onSelect: (value: string | number) => void;
}) {
  return (
    <div className="pf4-options">
      {options.map((o) => {
        const pressed = String(selected) === String(o.value);
        return (
          <button
            type="button"
            key={String(o.value)}
            disabled={busy}
            aria-pressed={pressed}
            className={`pf4-option ${pressed ? "is-selected" : ""}`}
            onClick={() => onSelect(o.value)}
          >
            <span>{o.label}</span>
            <span className="pf4-dot" />
          </button>
        );
      })}
    </div>
  );
}
