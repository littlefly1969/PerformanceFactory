import Link from "next/link";
import type { ReactNode } from "react";
import "../../start/pf4.css";
import "./account.css";
import "./account-pages.css";

export type AccountTab = "home" | "coach" | "profile";

const TABS: {
  tab: AccountTab;
  href: string;
  label: string;
  icon: ReactNode;
}[] = [
  {
    tab: "home",
    href: "/journey",
    label: "Home",
    icon: <path d="M4 11.5 12 5l8 6.5V20h-5.5v-5h-5v5H4Z" />,
  },
  {
    tab: "coach",
    href: "/journey/coach",
    label: "Coach",
    icon: (
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V16h0a2 2 0 0 1-2-2Z" />
    ),
  },
  {
    tab: "profile",
    href: "/journey/profilo",
    label: "Profilo",
    icon: (
      <>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
      </>
    ),
  },
];

/** Barra in basso dell'area atleta: Home, Coach (con il segnale) e Profilo. */
export function AccountNav({
  active,
  coachDot = false,
}: {
  active: AccountTab;
  coachDot?: boolean;
}) {
  return (
    <nav className="pf-acc-nav" aria-label="Navigazione atleta">
      {TABS.map(({ tab, href, label, icon }) => (
        <Link
          key={tab}
          href={href}
          aria-label={label}
          aria-current={tab === active ? "page" : undefined}
          className={tab === active ? "is-active" : undefined}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {icon}
          </svg>
          {tab === "coach" && coachDot && (
            <span
              className="pf-acc-nav-dot"
              aria-label="Micro-test in attesa"
            />
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Intestazione delle pagine di dettaglio: freccia indietro e titolo. */
export function AccountTopBar({
  title,
  back,
}: {
  title: string;
  back: string;
}) {
  return (
    <header className="pf-acc-top">
      <Link href={back} aria-label="Indietro">
        ←
      </Link>
      <span>{title}</span>
    </header>
  );
}

/**
 * Schermata chiara dell'area atleta, mobile first: contenuto, pulsante fisso
 * in basso nelle pagine di dettaglio, barra di navigazione nelle principali.
 */
export function AccountScreen({
  children,
  top,
  footer,
  nav,
  coachDot,
}: {
  children: ReactNode;
  top?: ReactNode;
  footer?: ReactNode;
  nav?: AccountTab;
  coachDot?: boolean;
}) {
  return (
    <main
      className={`pf-acc${nav ? " has-nav" : ""}${footer ? " has-footer" : ""}`}
    >
      <div className="pf-acc-frame">
        {top}
        {children}
      </div>
      {footer && <div className="pf-acc-footer">{footer}</div>}
      {nav && <AccountNav active={nav} coachDot={coachDot} />}
    </main>
  );
}

/** Pulsante a pillola con freccia: nero, lime o con bordo. */
export function PillButton({
  children,
  tone = "dark",
  arrow = true,
  ...props
}: {
  children: ReactNode;
  tone?: "dark" | "lime" | "outline";
  arrow?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`pf-acc-pill is-${tone}`} {...props}>
      <span>{children}</span>
      {arrow && <span aria-hidden="true">→</span>}
    </button>
  );
}

export function PillLink({
  children,
  href,
  tone = "dark",
  arrow = true,
}: {
  children: ReactNode;
  href: string;
  tone?: "dark" | "lime" | "outline";
  arrow?: boolean;
}) {
  return (
    <Link className={`pf-acc-pill is-${tone}`} href={href}>
      <span>{children}</span>
      {arrow && <span aria-hidden="true">→</span>}
    </Link>
  );
}
