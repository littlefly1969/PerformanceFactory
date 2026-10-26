import type { ReactNode } from "react";
import { LogoutButton } from "../components/logout-button";
import "./pf4.css";
import "./pf4-desktop.css";
import "../journey/journey.css";
import "./funnel.css";
import "./funnel-registration.css";

/** Il marchio PF, nel colore del testo che lo circonda. */
export function PFMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      aria-label="Performance Factory"
      role="img"
      viewBox="0 0 50.762 42.004"
      width={size}
      height={(size * 42.004) / 50.762}
    >
      <path
        d="M6.21 42 9.518 25.148H36.27c.782 0 1.454-.553 1.606-1.32l2.407-12.274c.136-.704-.403-1.356-1.119-1.356H0L1.174 4.221A5.23 5.23 0 0 1 6.31 0h34.272c6.405 0 11.22 5.84 9.987 12.119L47.63 27.094a10.247 10.247 0 0 1-10.042 8.255H17.91l-1.307 6.655Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PF4Shell({
  children,
  label = "Performance Factory",
  progress = 0,
  total = 0,
  onBack,
  showLogout = false,
  funnel,
}: {
  children: ReactNode;
  label?: string;
  progress?: number;
  total?: number;
  onBack?: () => void;
  showLogout?: boolean;
  /** Funnel pre-account: marchio al centro, contatore a destra, tono scuro o chiaro. */
  funnel?: { tone: "dark" | "light"; counter?: string };
}) {
  return (
    <main className={funnel ? `pf4 pf4-funnel pf4-tone-${funnel.tone}` : "pf4"}>
      <div className="pf4-device">
        <aside className="pf4-desktop-rail" aria-label="Performance Factory">
          <div className="pf4-rail-brand">
            <span aria-hidden="true">
              PF<span>↗</span>
            </span>
            <span>
              Performance
              <br />
              Factory
            </span>
          </div>
          <div className="pf4-rail-copy">
            <span className="pf4-rail-eyebrow">Il tuo punto di partenza</span>
            <h2>
              Il tuo sport.
              <br />
              La tua prossima
              <br />
              <em>versione.</em>
            </h2>
            <p>
              Un percorso costruito a partire da te, una risposta alla volta.
            </p>
          </div>
          <div className="pf4-rail-bottom">
            <span className="pf4-rail-mark" aria-hidden="true">
              ↗
            </span>
            <span>
              Conosci il tuo presente.
              <br />
              Dai una direzione al tuo prossimo passo.
            </span>
          </div>
        </aside>
        <div className="pf4-stage">
          <header
            className={`pf4-header${showLogout ? " pf4-header-with-logout" : ""}`}
          >
            {onBack ? (
              <button type="button" aria-label="Indietro" onClick={onBack}>
                ←
              </button>
            ) : (
              <span />
            )}
            {funnel ? (
              <span className="pf4-header-mark">
                <PFMark />
              </span>
            ) : (
              <span>{label}</span>
            )}
            {showLogout ? (
              <LogoutButton className="pf4-logout" />
            ) : funnel?.counter ? (
              <span className="pf4-counter">{funnel.counter}</span>
            ) : (
              <span />
            )}
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
      </div>
    </main>
  );
}
