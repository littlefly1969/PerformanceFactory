"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { API_BASE, clearAccessToken, secureFetch } from "@/app/lib/api";

type NavItem = {
  href: string;
  label: string;
  children?: NavItem[];
};

type ProductShellProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  nav?: NavItem[];
  actions?: ReactNode;
  stats?: Array<{
    label: string;
    value: ReactNode;
    tone?: "accent" | "success" | "warning" | "danger" | "neutral";
  }>;
  children: ReactNode;
};

type CurrentUser = {
  email?: string;
  role?: "USER" | "PROFESSIONAL" | "ADMIN" | string;
  onboardingRequired?: boolean;
  consentRequired?: boolean;
  missingConsents?: string[];
};

const roleNav: Record<string, NavItem[]> = {
  USER: [
    { href: "/user", label: "La tua performance" },
    {
      href: "/user/plan",
      label: "Allenamenti",
      children: [
        { href: "/user/plan", label: "Allenamenti attivi" },
        { href: "/user/plan/history", label: "Storico allenamenti" },
      ],
    },
    {
      href: "/user/questions",
      label: "Questionari",
      children: [
        { href: "/user/questions", label: "Questionari aperti" },
        { href: "/user/questions/history", label: "Storico questionari" },
      ],
    },
  ],
  PROFESSIONAL: [
    { href: "/professional", label: "Atleti" },
    { href: "/professional/approvals", label: "Approvazioni" },
  ],
  ADMIN: [
    { href: "/admin/cycles", label: "Operazioni" },
    { href: "/admin/ai-config", label: "Configurazione AI" },
    { href: "/admin/consents", label: "Privacy" },
  ],
};

const roleHome: Record<string, string> = {
  USER: "/user",
  PROFESSIONAL: "/professional",
  ADMIN: "/admin/cycles",
};

const pathMatchesRole = (path: string, role?: string) => {
  if (!role) {
    return true;
  }
  if (role === "USER") {
    return (
      path === "/consents" ||
      path === "/onboarding" ||
      path === "/user" ||
      path.startsWith("/user/")
    );
  }
  if (role === "PROFESSIONAL") {
    return (
      path === "/consents" ||
      path === "/professional" ||
      path.startsWith("/professional/")
    );
  }
  if (role === "ADMIN") {
    return (
      path === "/consents" ||
      path === "/admin/cycles" ||
      path.startsWith("/admin/ai-config") ||
      path.startsWith("/admin/consents")
    );
  }
  return true;
};

const isNavActive = (path: string, href: string) =>
  path === href ||
  (href === "/user" && path.startsWith("/user/areas/")) ||
  (href !== "/user" && href !== "/professional" && path.startsWith(`${href}/`));

export function ProductShell({
  eyebrow = "PerformanceFactory",
  title,
  description,
  nav,
  actions,
  stats,
  children,
}: ProductShellProps) {
  const pathname = usePathname();
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadMe = async () => {
      const response = await secureFetch(`${API_BASE}/auth/me`, {
        credentials: "include",
      });

      if (!mounted) {
        return;
      }

      if (!response.ok) {
        window.location.href = "/login";
        return;
      }

      const data = (await response.json()) as CurrentUser;
      setMe(data);
      setAuthChecked(true);

      if (data.consentRequired) {
        if (pathname !== "/consents") {
          window.location.href = "/consents";
        }
        return;
      }

      if (
        data.role === "USER" &&
        data.onboardingRequired &&
        pathname !== "/onboarding"
      ) {
        window.location.href = "/onboarding";
        return;
      }

      if (!pathMatchesRole(pathname, data.role)) {
        window.location.href = roleHome[data.role ?? ""] ?? "/login";
      }
    };

    void loadMe();
    return () => {
      mounted = false;
    };
  }, [pathname]);

  const resolvedNav = useMemo(() => {
    if (nav) {
      return nav;
    }
    if (pathname === "/onboarding") {
      return [];
    }
    return roleNav[me?.role ?? ""] ?? [];
  }, [me?.role, nav, pathname]);

  const logout = async () => {
    setLoggingOut(true);
    await secureFetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    clearAccessToken();
    window.location.href = "/login";
  };

  return (
    <main className="pf-shell">
      <header className="pf-topbar">
        <Link className="pf-brand pf-brand-with-logo" href="/" aria-label="Performance Factory">
          <Image
            className="pf-brand-logo"
            src="/brand/performance-factory-horizontal-clean.png"
            alt="Performance Factory"
            width={900}
            height={211}
            priority
          />
        </Link>
        <div className="pf-topbar-right">
          {resolvedNav.length > 0 && (
            <nav className="pf-nav" aria-label="Navigazione ambiente">
              {resolvedNav.map((item) =>
                item.children?.length ? (
                  <details
                    key={item.href}
                    className={`pf-nav-dropdown ${isNavActive(pathname, item.href) ? "active" : ""}`}
                  >
                    <summary>{item.label}</summary>
                    <div className="pf-nav-menu">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          className={pathname === child.href ? "active" : ""}
                          href={child.href}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </details>
                ) : (
                  <Link
                    key={item.href}
                    className={isNavActive(pathname, item.href) ? "active" : ""}
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </nav>
          )}
          <div className="pf-userbar">
            <span>{authChecked ? (me?.email ?? "Account") : "Caricamento..."}</span>
            <button
              className="pf-button-secondary"
              type="button"
              onClick={logout}
              disabled={loggingOut}
            >
              {loggingOut ? "Uscita..." : "Esci"}
            </button>
          </div>
        </div>
      </header>

      <section className="pf-main">
        <header className="pf-header">
          <div>
            <p className="pf-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            {description && <p className="pf-subtitle">{description}</p>}
          </div>
          {actions && <div className="pf-header-actions">{actions}</div>}
        </header>

        {stats && stats.length > 0 && (
          <section className="pf-stats" aria-label="Riepilogo pagina">
            {stats.map((stat) => (
              <article
                key={stat.label}
                className={`pf-stat ${stat.tone ?? ""}`}
              >
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </article>
            ))}
          </section>
        )}

        {children}
      </section>
    </main>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="pf-empty">
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}) {
  return <span className={`pf-badge ${tone}`}>{children}</span>;
}
