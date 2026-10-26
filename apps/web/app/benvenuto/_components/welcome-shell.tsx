import Link from "next/link";
import type { ReactNode } from "react";
import "./welcome.css";

/** Sequenza di benvenuto dopo la creazione account: 4 passi su fondo scuro. */
export const WELCOME_STEPS = 4;

export function WelcomeShell({
  step,
  skipHref,
  children,
  footer,
}: {
  step: number;
  skipHref?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="pf-welcome">
      <div className="pf-welcome-device">
        <header className="pf-welcome-header">
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
          {skipHref && (
            <Link className="pf-welcome-skip" href={skipHref}>
              Salta
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
  step: number;
  kicker: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <span className="pf-welcome-kicker">
        {String(step).padStart(2, "0")} · {kicker}
      </span>
      <h1>{title}</h1>
      <p className="pf-welcome-lead">{children}</p>
    </>
  );
}
