import type { ReactNode } from "react";
import "./pf4.css";

export function PF4Shell({
  children,
  label = "Performance Factory",
  progress = 0,
  total = 0,
  onBack,
}: {
  children: ReactNode;
  label?: string;
  progress?: number;
  total?: number;
  onBack?: () => void;
}) {
  return (
    <main className="pf4">
      <div className="pf4-device">
        <header className="pf4-header">
          {onBack ? (
            <button type="button" aria-label="Indietro" onClick={onBack}>
              ←
            </button>
          ) : (
            <span />
          )}
          <span>{label}</span>
          <span />
        </header>
        {total > 0 && (
          <div
            className="pf4-progress"
            role="progressbar"
            aria-label="Avanzamento discovery"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={total}
          >
            {Array.from({ length: total }, (_, i) => (
              <span className={i < progress ? "is-complete" : ""} key={i} />
            ))}
          </div>
        )}
        {children}
      </div>
    </main>
  );
}
