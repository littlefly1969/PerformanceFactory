"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import "../../start/pf4.css";
import "../../journey/journey.css";
import "./athlete.css";
const destinations = [
  ["/user", "Home", "⌂"],
  ["/user/training", "Training", "◷"],
  ["/user/abilities", "Abilità", "◇"],
  ["/user/performance", "Progress", "↗"],
  ["/user/profile", "Profilo", "○"],
];
export function AthleteShell({
  children,
  label,
  error,
  loading,
  reload,
}: {
  children?: ReactNode;
  label: string;
  error?: string;
  loading?: boolean;
  reload?: () => void;
}) {
  const path = usePathname();
  return (
    <main className="pf4 pf4-athlete">
      <div className="pf4-athlete-frame">
        <header className="pf4-athlete-header">
          <Link href="/user" aria-label="Performance Factory Home">
            <b>PF↗</b>
            <span>Performance Factory</span>
          </Link>
          <Link href="/user/profile" aria-label="Il tuo profilo">
            ○
          </Link>
        </header>
        <div className="pf4-athlete-content">
          <div className="pf4-athlete-label">{label}</div>
          {error && (
            <div className="pf4-error" role="alert">
              {error}
              <button className="pf4-cta" onClick={reload}>
                Riprova
              </button>
            </div>
          )}
          {loading && !error && <p role="status">Prepariamo la tua vista…</p>}
          {children}
        </div>
        <nav className="pf4-athlete-nav" aria-label="Navigazione atleta">
          {destinations.map(([href, title, icon]) => {
            const active =
              href === "/user" ? path === href : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
              >
                <span aria-hidden="true">{icon}</span>
                {title}
              </Link>
            );
          })}
        </nav>
      </div>
    </main>
  );
}
