"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, clearAccessToken, secureFetch } from "@/app/lib/api";

type NavItem = {
  href: string;
  label: string;
  children?: NavItem[];
};

type ProductShellProps = {
  eyebrow?: string;
  title: string;
  titleMeta?: ReactNode;
  description?: string;
  nav?: NavItem[];
  actions?: ReactNode;
  backAction?: {
    label?: string;
    onClick: () => void;
  };
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
      label: "Attivita",
      children: [
        { href: "/user/plan", label: "Attivita aperte" },
        { href: "/user/plan/history", label: "Storico lavori per area" },
      ],
    },
    {
      href: "/user/questions",
      label: "Check-in",
      children: [
        { href: "/user/questions", label: "Check-in aperti" },
        { href: "/user/questions/history", label: "Storico check-in" },
      ],
    },
  ],
  PROFESSIONAL: [
    { href: "/professional", label: "Atleti" },
    { href: "/professional/approvals", label: "Approvazioni" },
  ],
  ADMIN: [
    { href: "/admin/cycles", label: "Operazioni" },
    { href: "/admin/consents", label: "Privacy" },
  ],
  AI_TUNER: [
    { href: "/ai-tuner/discovery", label: "Domande iniziali" },
    { href: "/ai-tuner/anamnesi", label: "Anamnesi" },
    { href: "/ai-tuner/prompts", label: "Prompt" },
    {
      href: "/ai-tuner/test-cases",
      label: "Test su casi",
      children: [
        { href: "/ai-tuner/test-cases?mode=users", label: "Utenti" },
        { href: "/ai-tuner/test-cases?mode=standard", label: "Storico test" },
        { href: "/ai-tuner/test-cases?mode=real", label: "Casi reali" },
      ],
    },
    { href: "/ai-tuner/version-comparison", label: "Confronto versioni" },
    { href: "/ai-tuner/monitoring", label: "Monitoraggio AI" },
  ],
};

const roleHome: Record<string, string> = {
  USER: "/user",
  PROFESSIONAL: "/professional",
  ADMIN: "/admin/cycles",
  AI_TUNER: "/ai-tuner/prompts",
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
      path.startsWith("/admin/consents")
    );
  }
  if (role === "AI_TUNER") {
    return (
      path === "/consents" ||
      path === "/ai-tuner" ||
      path.startsWith("/ai-tuner/")
    );
  }
  return true;
};

const isNavActive = (path: string, href: string) => {
  if (href === "/ai-tuner/test-cases") {
    return (
      path === href ||
      path.startsWith("/ai-tuner/test-cases/") ||
      path.startsWith("/ai-tuner/audits") ||
      path.startsWith("/ai-tuner/golden-contexts")
    );
  }
  if (href === "/ai-tuner/version-comparison") {
    return (
      path === href ||
      path.startsWith("/ai-tuner/version-comparison/") ||
      path.startsWith("/ai-tuner/evaluations")
    );
  }
  if (href === "/ai-tuner/monitoring") {
    return (
      path === href ||
      path.startsWith("/ai-tuner/monitoring/") ||
      path.startsWith("/ai-tuner/replays") ||
      path.startsWith("/ai-tuner/cost")
    );
  }
  return (
    path === href ||
    (href === "/user" && path.startsWith("/user/areas/")) ||
    (href !== "/user" && href !== "/professional" && path.startsWith(`${href}/`))
  );
};

const getLogicalBackHref = (path: string, search: string) => {
  const params = new URLSearchParams(search);

  if (path === "/ai-tuner/test-cases") {
    if (params.get("caseId")) {
      return "/ai-tuner/test-cases?mode=standard";
    }
    if (params.get("mode")) {
      return "/ai-tuner/test-cases";
    }
    return null;
  }
  if (path === "/ai-tuner/golden-contexts") {
    return "/ai-tuner/test-cases?mode=standard";
  }
  if (path.startsWith("/ai-tuner/audits/")) {
    return "/ai-tuner/test-cases?mode=real";
  }
  if (path === "/ai-tuner/audits") {
    return "/ai-tuner/test-cases?mode=real";
  }
  if (path.startsWith("/ai-tuner/replays/")) {
    return "/ai-tuner/replays";
  }
  if (path === "/ai-tuner/replays" || path === "/ai-tuner/cost") {
    return "/ai-tuner/monitoring";
  }
  if (path.startsWith("/ai-tuner/evaluations/")) {
    return "/ai-tuner/evaluations";
  }
  if (path === "/ai-tuner/evaluations") {
    return "/ai-tuner/version-comparison";
  }

  if (path.startsWith("/user/areas/") || path === "/user/performance") {
    return "/user";
  }
  if (path === "/user/training" || path === "/user/plan/history") {
    return "/user/plan";
  }
  if (path === "/user/questions/history") {
    return "/user/questions";
  }
  if (path === "/user/plan" || path === "/user/questions") {
    return search ? "/user" : null;
  }

  if (path === "/professional/approvals" || path.startsWith("/professional/users/")) {
    return "/professional";
  }

  if (path === "/admin/consents") {
    return "/admin/cycles";
  }

  return null;
};

export function ProductShell({
  eyebrow = "PerformanceFactory",
  title,
  titleMeta,
  description,
  nav,
  actions,
  backAction,
  stats,
  children,
}: ProductShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [openNavHref, setOpenNavHref] = useState<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const navCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logicalBackHref = getLogicalBackHref(
    pathname,
    typeof window === "undefined" ? "" : window.location.search,
  );

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

  useEffect(() => {
    setOpenNavHref(null);
  }, [pathname]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        setOpenNavHref(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenNavHref(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      if (navCloseTimeoutRef.current) {
        clearTimeout(navCloseTimeoutRef.current);
      }
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const openNavMenu = (href: string) => {
    if (navCloseTimeoutRef.current) {
      clearTimeout(navCloseTimeoutRef.current);
      navCloseTimeoutRef.current = null;
    }
    setOpenNavHref(href);
  };

  const scheduleNavMenuClose = () => {
    if (navCloseTimeoutRef.current) {
      clearTimeout(navCloseTimeoutRef.current);
    }
    navCloseTimeoutRef.current = setTimeout(() => {
      setOpenNavHref(null);
      navCloseTimeoutRef.current = null;
    }, 220);
  };

  const goBack = useCallback(() => {
    if (backAction) {
      backAction.onClick();
      return;
    }
    if (logicalBackHref) {
      router.push(logicalBackHref);
    }
  }, [backAction, logicalBackHref, router]);

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
    <main className={`pf-shell ${me?.role === "AI_TUNER" ? "pf-ai-tuner-shell" : ""}`}>
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
            <nav ref={navRef} className="pf-nav" aria-label="Navigazione ambiente">
              {resolvedNav.map((item) =>
                item.children?.length ? (
                  <details
                    key={item.href}
                    className={`pf-nav-dropdown ${isNavActive(pathname, item.href) ? "active" : ""}`}
                    open={openNavHref === item.href}
                    onMouseEnter={() => openNavMenu(item.href)}
                    onMouseLeave={scheduleNavMenuClose}
                    onFocus={() => openNavMenu(item.href)}
                    onToggle={(event) => {
                      if (event.currentTarget.open) {
                        setOpenNavHref(item.href);
                      } else if (openNavHref === item.href) {
                        setOpenNavHref(null);
                      }
                    }}
                  >
                    <summary
                      onClick={(event) => {
                        event.preventDefault();
                        setOpenNavHref(null);
                        router.push(item.href);
                      }}
                    >
                      {item.label}
                    </summary>
                    {openNavHref === item.href && (
                      <div
                        className="pf-nav-menu"
                        onMouseEnter={() => openNavMenu(item.href)}
                        onMouseLeave={scheduleNavMenuClose}
                      >
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          className=""
                          href={child.href}
                          onClick={() => setOpenNavHref(null)}
                        >
                          {child.label}
                        </Link>
                      ))}
                      </div>
                    )}
                  </details>
                ) : (
                  <Link
                    key={item.href}
                    className={isNavActive(pathname, item.href) ? "active" : ""}
                    href={item.href}
                    onClick={() => setOpenNavHref(null)}
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
        {(logicalBackHref || backAction) && (
          <button
            type="button"
            className="pf-back-button"
            onClick={goBack}
            aria-label="Torna indietro"
          >
            <span aria-hidden="true">&larr;</span>
            <span>{backAction?.label ?? "Torna indietro"}</span>
          </button>
        )}
        <header className="pf-header">
          <div>
            <p className="pf-eyebrow">{eyebrow}</p>
            <div className="pf-title-row">
              <h1>{title}</h1>
              {titleMeta && <div className="pf-title-meta">{titleMeta}</div>}
            </div>
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
