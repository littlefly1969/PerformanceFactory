"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import "../../start/pf4.css";
import "./subscriber.css";
import "./subscriber-session.css";

const icons = {
  home: "M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4z",
  calendar: "M5 7h14v13H5zM5 11h14M9 4v4M15 4v4",
  profile:
    "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20c1.2-3.5 3.8-5 7-5s5.8 1.5 7 5",
};
const destinations = [
  ["/user", "Home", icons.home],
  ["/user/training", "Calendario", icons.calendar],
  ["/user/profile", "Profilo", icons.profile],
] as const;

export function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

/** Barra flottante in basso, come nei mockup dell'area abbonato. */
export function SubscriberNav() {
  const path = usePathname();
  return (
    <nav className="pfs-nav" aria-label="Navigazione atleta">
      {destinations.map(([href, title, icon]) => {
        const active = href === "/user" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={title}
            aria-current={active ? "page" : undefined}
          >
            <Icon path={icon} />
          </Link>
        );
      })}
    </nav>
  );
}

export function SubscriberShell({
  children,
  back,
  kicker,
  action,
  brand,
  nav = false,
  footer,
  tone = "light",
  error,
  loading,
  reload,
}: {
  children?: ReactNode;
  back?: string;
  kicker?: string;
  action?: ReactNode;
  /** Intestazione con il marchio, per la home. */
  brand?: ReactNode;
  nav?: boolean;
  footer?: ReactNode;
  tone?: "light" | "dark";
  error?: string;
  loading?: boolean;
  reload?: () => void;
}) {
  return (
    <main className={`pf4 pfs pfs-${tone}`}>
      <div className="pfs-frame">
        {brand ? (
          <header className="pfs-top pfs-top-brand">{brand}</header>
        ) : (
          (back || kicker || action) && (
            <header className="pfs-top">
              {back && (
                <Link href={back} className="pfs-back" aria-label="Indietro">
                  ←
                </Link>
              )}
              {kicker && <span className="pfs-top-kicker">{kicker}</span>}
              {action && <div className="pfs-top-action">{action}</div>}
            </header>
          )
        )}
        <div className="pfs-content">
          {error && (
            <div className="pfs-alert" role="alert">
              {error}
              {reload && (
                <button className="pfs-link" onClick={reload}>
                  Riprova
                </button>
              )}
            </div>
          )}
          {loading && !error && (
            <p className="pfs-muted" role="status">
              Prepariamo la tua vista…
            </p>
          )}
          {children}
        </div>
        {footer && <div className="pfs-footer">{footer}</div>}
        {nav && <SubscriberNav />}
      </div>
    </main>
  );
}
