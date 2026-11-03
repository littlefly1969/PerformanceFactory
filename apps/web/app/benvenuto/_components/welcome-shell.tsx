import Link from "next/link";
import type { ReactNode } from "react";
import "./welcome.css";

/**
 * Sequenza di benvenuto dopo la creazione account, come nella demo PF10:
 * foto, classifica FIT, Spider, regalo e app, su fondo scuro.
 */
export const WELCOME_STEPS = 5;

/**
 * `back` porta al passo precedente (o, fuori dal benvenuto, all'account);
 * `skipLabel` cambia «Salta», per esempio in «Più tardi» sull'ultimo passo.
 */
export function WelcomeShell({
  step,
  back,
  skipHref,
  skipLabel = "Salta",
  children,
  footer,
}: {
  step?: number;
  back?: string;
  skipHref?: string;
  skipLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="pf-welcome">
      <div className="pf-welcome-device">
        <header className="pf-welcome-header">
          {back && (
            <Link className="pf-welcome-back" href={back} aria-label="Indietro">
              ←
            </Link>
          )}
          {step !== undefined && (
            <div
              className="pf-welcome-progress"
              role="progressbar"
              aria-label="Benvenuto"
              aria-valuenow={step}
              aria-valuemin={1}
              aria-valuemax={WELCOME_STEPS}
            >
              {Array.from({ length: WELCOME_STEPS }, (_, i) => (
                <span
                  key={i}
                  className={
                    i + 1 === step ? "is-current" : i < step ? "is-done" : ""
                  }
                />
              ))}
            </div>
          )}
          {skipHref && (
            <Link className="pf-welcome-skip" href={skipHref}>
              {skipLabel}
            </Link>
          )}
        </header>
        <section className="pf-welcome-body">{children}</section>
        {footer && <footer className="pf-welcome-footer">{footer}</footer>}
      </div>
    </main>
  );
}

export function WelcomeIntro({
  step,
  kicker,
  title,
  children,
}: {
  step?: number;
  kicker: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <span className="pf-welcome-kicker">
        {step === undefined
          ? kicker
          : `${String(step).padStart(2, "0")} · ${kicker}`}
      </span>
      <h1>{title}</h1>
      <p className="pf-welcome-lead">{children}</p>
    </>
  );
}
