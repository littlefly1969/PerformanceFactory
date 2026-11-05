import type { ReactNode } from "react";
import { LogoutButton } from "../components/logout-button";
import "./pf4.css";
import "./pf4-desktop.css";
import "../journey/journey.css";
import "./funnel.css";
import "./funnel-registration.css";
import "./funnel-demo.css";
import "./funnel-demo-court.css";
import "./funnel-demo-screens.css";

import { PFMark } from "../components/pf-mark";
export { PFMark } from "../components/pf-mark";

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
                <PFMark size={22} />
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
