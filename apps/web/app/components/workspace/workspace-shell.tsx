"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { PFMark } from "../pf-mark";

type Item = { href: string; label: string; children?: Item[] };
const ADMIN_GROUPS = [
  { label: "Monitoraggio", paths: ["/admin/dashboard", "/admin/ai-logs"] },
  {
    label: "Operatività",
    paths: [
      "/admin/cycles",
      "/admin/anomalies",
      "/admin/free-lessons",
      "/admin/partners",
    ],
  },
  {
    label: "Percorso e contenuti",
    paths: [
      "/admin/discovery",
      "/admin/assessment",
      "/admin/calibration",
      "/admin/videos",
    ],
  },
  {
    label: "Configurazione",
    paths: ["/admin/consents", "/admin/feature-flags", "/admin/ranking"],
  },
];

export function WorkspaceShell({
  role,
  pathname,
  nav,
  email,
  loggingOut,
  onLogout,
  title,
  eyebrow,
  description,
  titleMeta,
  actions,
  stats,
  children,
  onBack,
  backLabel,
}: {
  role: "ADMIN" | "PROFESSIONAL";
  pathname: string;
  nav: Item[];
  email?: string;
  loggingOut: boolean;
  onLogout: () => void;
  title: string;
  eyebrow: string;
  description?: string;
  titleMeta?: ReactNode;
  actions?: ReactNode;
  stats?: Array<{ label: string; value: ReactNode; tone?: string }>;
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const groups =
    role === "ADMIN"
      ? [
          ...ADMIN_GROUPS.map((g) => ({
            label: g.label,
            items: nav.filter((n) => g.paths.includes(n.href)),
          })),
          {
            label: "Altre sezioni",
            items: nav.filter(
              (n) => !ADMIN_GROUPS.some((g) => g.paths.includes(n.href)),
            ),
          },
        ]
      : [{ label: "Il tuo lavoro", items: nav }];
  const current = nav.find(
    (n) =>
      pathname === n.href ||
      (n.href !== "/professional" && pathname.startsWith(n.href + "/")),
  );
  return (
    <div className="ws-shell">
      <a className="ws-skip" href="#workspace-content">
        Vai al contenuto
      </a>
      <aside className={`ws-sidebar${menuOpen ? " is-open" : ""}`}>
        <Link
          className="ws-brand"
          href={role === "ADMIN" ? "/admin/cycles" : "/professional"}
        >
          <span>
            <PFMark size={26} />
          </span>
          <div>
            Performance Factory
            <small>{role === "ADMIN" ? "Amministrazione" : "Area coach"}</small>
          </div>
        </Link>
        <nav id="workspace-navigation" aria-label="Navigazione ambiente">
          {groups
            .filter((g) => g.items.length)
            .map((group) => (
              <section key={group.label}>
                <p className="ws-nav-label">{group.label}</p>
                {group.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/professional" &&
                      pathname.startsWith(item.href + "/"));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                    >
                      <span className="ws-nav-dot" aria-hidden="true" />
                      {item.label}
                    </Link>
                  );
                })}
              </section>
            ))}
        </nav>
        <div className="ws-account">
          <span>{email ?? "Caricamento account…"}</span>
          <button type="button" onClick={onLogout} disabled={loggingOut}>
            {loggingOut ? "Uscita…" : "Esci"}
          </button>
        </div>
      </aside>
      <div className="ws-workspace">
        <header className="ws-topbar">
          <button
            type="button"
            className="ws-menu-toggle ws-control"
            aria-expanded={menuOpen}
            aria-controls="workspace-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? "Chiudi menu" : "Menu"}
          </button>
          <div className="ws-breadcrumb">
            <span>{role === "ADMIN" ? "Amministrazione" : "Coach"}</span>
            <span aria-hidden="true">/</span>
            <strong>{current?.label ?? title}</strong>
          </div>
          <span className="ws-environment">Area riservata</span>
        </header>
        <main id="workspace-content" className="ws-content" tabIndex={-1}>
          <header className="ws-page-header">
            <div>
              {onBack && (
                <button type="button" className="ws-back" onClick={onBack}>
                  ← {backLabel ?? "Torna indietro"}
                </button>
              )}
              <p className="pf-eyebrow">{eyebrow}</p>
              <div className="pf-title-row">
                <h1>{title}</h1>
                {titleMeta}
              </div>
              {description && <p className="pf-subtitle">{description}</p>}
            </div>
            {actions && <div className="pf-header-actions">{actions}</div>}
          </header>
          {!!stats?.length && (
            <section className="ws-stats" aria-label="Riepilogo pagina">
              {stats.map((s) => (
                <article key={s.label} className={`ws-stat ${s.tone ?? ""}`}>
                  <span>{s.label}</span>
                  <strong>{s.value}</strong>
                </article>
              ))}
            </section>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
