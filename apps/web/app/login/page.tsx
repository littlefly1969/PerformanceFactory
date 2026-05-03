"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { API_BASE, secureFetch, storeAccessToken } from "@/app/lib/api";

const demoAccounts = [
  {
    group: "Admin",
    label: "Admin",
    email: "admin@example.com",
    password: "password123",
  },
  {
    group: "Atleta",
    label: "Athlete",
    email: "user@example.com",
    password: "password123",
  },
  {
    group: "Professionisti",
    label: "General",
    email: "pro@example.com",
    password: "password123",
  },
  {
    group: "Professionisti",
    label: "Tactical",
    email: "prof_TT@example.it",
    password: "password123",
  },
  {
    group: "Professionisti",
    label: "Athletic",
    email: "prof_AP@example.it",
    password: "password123",
  },
  {
    group: "Professionisti",
    label: "Equipment",
    email: "prof_EQ@example.it",
    password: "password123",
  },
  {
    group: "Professionisti",
    label: "Psychology",
    email: "prof_PT@example.it",
    password: "password123",
  },
  {
    group: "Professionisti",
    label: "Nutrition",
    email: "prof_NU@example.it",
    password: "password123",
  },
  {
    group: "Professionisti",
    label: "Mental",
    email: "prof_MT@example.it",
    password: "password123",
  },
];

const demoAccessAccounts = [
  {
    label: "Admin demo",
    account: demoAccounts.find(
      (account) => account.email === "admin@example.com",
    )!,
  },
  {
    label: "Atleta demo",
    account: demoAccounts.find(
      (account) => account.email === "user@example.com",
    )!,
  },
];

const coachDemoAccounts = demoAccounts
  .filter((account) => account.group === "Professionisti")
  .map((account) => ({
    label: `${account.label} coach`,
    account,
  }));

const pendingAdminActivationMessage =
  "L'admin sta valutando la tua richiesta e ti accettera.";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fill = (account: (typeof demoAccounts)[number]) => {
    setEmail(account.email);
    setPassword(account.password);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setLoading(true);

    const response = await secureFetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      let errorMessage = "Credentials are not valid or the API is not reachable.";
      try {
        const data = (await response.json()) as { message?: string };
        if (data.message === "Account pending admin activation") {
          errorMessage = pendingAdminActivationMessage;
        }
      } catch {
        // Keep the default login error when the API does not return JSON.
      }
      setMessage(errorMessage);
      setLoading(false);
      return;
    }

    const user = (await response.json()) as {
      email?: string;
      role?: string;
      accessToken?: string;
      onboardingRequired?: boolean;
    };
    storeAccessToken(user.accessToken);
    setMessage(`Signed in as ${user.email ?? "user"} (${user.role ?? "role"})`);
    setLoading(false);

    const destination =
      user.role === "USER"
        ? user.onboardingRequired
          ? "/onboarding"
          : "/user"
        : user.role === "PROFESSIONAL"
          ? "/professional"
          : user.role === "ADMIN"
            ? "/admin/cycles"
            : "/";
    window.location.href = destination;
  };

  return (
    <main className="pf-auth-screen">
      <section className="pf-auth-brand-panel" aria-labelledby="pf-auth-heading">
        <div className="pf-auth-brand-content">
          <Link
            className="pf-auth-brand-lockup"
            href="/"
            aria-label="Performance Factory"
          >
            <Image
              className="pf-auth-brand-logo"
              src="/brand/performance-factory-horizontal-clean.png"
              alt="Performance Factory"
              width={900}
              height={211}
              priority
            />
          </Link>

          <p className="pf-auth-eyebrow">PERFORMANCE FACTORY</p>
          <h1 id="pf-auth-heading" className="pf-auth-headline">
            Valuta, monitora e migliora la tua performance
          </h1>
          <p className="pf-auth-copy">
            Un unico spazio per iniziare il tuo percorso, seguire i progressi e
            costruire un piano personalizzato.
          </p>

          <ul
            className="pf-auth-benefits"
            aria-label="Vantaggi Performance Factory"
          >
            <li>Valutazione iniziale</li>
            <li>Percorso su misura</li>
            <li>Progressi sempre visibili</li>
          </ul>
        </div>
      </section>

      <section className="pf-auth-panel">
        <div className="pf-auth-panel-inner">
          <div className="pf-auth-card">
            <div className="pf-auth-card-header">
              <p className="pf-eyebrow">Bentornato</p>
              <h2>Accedi alla tua area</h2>
              <p>Inserisci le tue credenziali per continuare.</p>
            </div>

            <form className="pf-stack" onSubmit={onSubmit}>
              <label className="pf-field">
                Email
                <input
                  className="pf-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="pf-field">
                Password
                <input
                  className="pf-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <div className="pf-login-options">
                <label className="pf-remember">
                  <input type="checkbox" />
                  Ricordami
                </label>
                <Link className="pf-auth-text-link" href="/register">
                  Crea nuovo utente
                </Link>
              </div>
              <button className="pf-button" type="submit" disabled={loading}>
                {loading ? "Accesso in corso..." : "Accedi"}
              </button>
            </form>

            {message && <div className="pf-alert warning">{message}</div>}
          </div>

          <div className="pf-auth-demo-card">
            <div>
              <p className="pf-eyebrow">Accesso demo</p>
              <p>Solo per test interno</p>
            </div>
            <div className="pf-demo-groups">
              <div className="pf-demo-group">
                <span>Base</span>
                <div className="pf-demo-actions">
                  {demoAccessAccounts.map(({ label, account }) => (
                    <button
                      key={account.email}
                      className="pf-button-secondary"
                      type="button"
                      onClick={() => fill(account)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pf-demo-group">
                <span>Coach aree</span>
                <div className="pf-demo-actions coach">
                  {coachDemoAccounts.map(({ label, account }) => (
                    <button
                      key={account.email}
                      className="pf-button-secondary"
                      type="button"
                      onClick={() => fill(account)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
