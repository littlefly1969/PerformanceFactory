"use client";
import { HexOrb } from "../_account/account-home";

/** Lettere delle risposte, come nella demo. */
export const LETTERS = "ABCDE";

/** Pulsante a pillola della veste scura: lime pieno o con il bordo. */
export function Pill({
  children,
  tone = "lime",
  ...props
}: {
  children: React.ReactNode;
  tone?: "lime" | "outline";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`pf-mt-pill is-${tone}`} {...props}>
      <span>{children}</span>
      {tone === "lime" && <span aria-hidden="true">→</span>}
    </button>
  );
}

/** Attesa con l'esagono: l'AI prepara il test o valuta le risposte. */
export function Working({
  title,
  error,
  onRetry,
}: {
  title: string;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <section className="pf-mt pf-mt-working" role="status">
      <HexOrb size={96} tone="lime" />
      <h2 className="pf-mt-hero-title">{title}</h2>
      {error && (
        <>
          <p className="pf-mt-error" role="alert">
            {error}
          </p>
          {onRetry && <Pill onClick={onRetry}>Riprova</Pill>}
        </>
      )}
    </section>
  );
}
