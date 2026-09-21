"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { googleRegistrationHref } from "../start/google-registration";
import { API_BASE, secureFetch, storeAccessToken } from "@/app/lib/api";

const pendingAdminActivationMessage =
  "L'amministratore sta valutando la tua richiesta e ti accettera.";
const rejectedApplicationMessage =
  "Candidatura rifiutata. Puoi riproporre una nuova richiesta di registrazione.";

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="pf-google-icon" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.69 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export type AssistedAccount = {
  group: string;
  label: string;
  email: string;
  password: string;
};
export function LoginForm({ accounts = [] }: { accounts?: AssistedAccount[] }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const error = searchParams.get("error");
    if (error) {
      setMessage(error);
    }
  }, []);

  const fill = (account: AssistedAccount) => {
    setEmail(account.email);
    setPassword(account.password);
  };

  const startGoogleLogin = () => {
    const returnTo = `${window.location.origin}/`;
    window.location.href = `${API_BASE}/auth/google/login?returnTo=${encodeURIComponent(returnTo)}`;
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
      let errorMessage = "Credenziali non valide oppure API non raggiungibile.";
      try {
        const data = (await response.json()) as { message?: string };
        if (
          data.message === "Account in attesa di attivazione amministratore"
        ) {
          errorMessage = pendingAdminActivationMessage;
        } else if (
          data.message ===
          "Candidatura rifiutata. Puoi riproporre una nuova richiesta di registrazione."
        ) {
          errorMessage = rejectedApplicationMessage;
        }
      } catch {
        // Mantiene l'errore standard quando l'API non restituisce JSON.
      }
      setMessage(errorMessage);
      setLoading(false);
      return;
    }

    const user = (await response.json()) as {
      email?: string;
      role?: string;
      accessToken?: string;
      consentRequired?: boolean;
      onboardingRequired?: boolean;
    };
    storeAccessToken(user.accessToken);
    setMessage(
      `Accesso effettuato come ${user.email ?? "utente"} (${user.role ?? "ruolo"})`,
    );
    setLoading(false);

    if (user.role === "USER") {
      const journey = await secureFetch(`${API_BASE}/auth/journey`);
      if (journey.ok) {
        const state = (await journey.json()) as { nextStep?: string };
        window.location.href =
          state.nextStep === "COMPLETE" ? "/user" : "/journey";
        return;
      }
    }
    const destination = user.consentRequired
      ? "/consents"
      : user.role === "USER"
        ? user.onboardingRequired
          ? "/onboarding"
          : "/user"
        : user.role === "PROFESSIONAL"
          ? "/professional"
          : user.role === "ADMIN"
            ? "/admin/cycles"
            : user.role === "AI_TUNER"
              ? "/ai-tuner/prompts"
              : "/";
    window.location.href = destination;
  };

  return (
    <main className="pf-auth-screen">
      <section
        className="pf-auth-brand-panel"
        aria-labelledby="pf-auth-heading"
      >
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
            costruire un allenamento personalizzato.
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
              <h2>
                {accounts.length ? "Accesso assistito" : "Accedi alla tua area"}
              </h2>
              <p>
                {accounts.length
                  ? "Scegli un profilo per compilare le credenziali, poi premi Accedi."
                  : "Inserisci le tue credenziali per continuare."}
              </p>
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
                <Link className="pf-auth-text-link" href="/start">
                  Crea nuovo utente
                </Link>
              </div>
              <button className="pf-button" type="submit" disabled={loading}>
                {loading ? "Accesso in corso..." : "Accedi"}
              </button>
            </form>

            <div className="pf-auth-divider">oppure</div>

            <button
              className="pf-google-button"
              type="button"
              onClick={startGoogleLogin}
            >
              <GoogleIcon />
              <span>Continua con Google</span>
            </button>

            <a className="pf-auth-text-link" href={googleRegistrationHref}>
              Registrati con Google
            </a>

            {message && <div className="pf-alert warning">{message}</div>}
          </div>

          {accounts.length > 0 && (
            <div className="pf-auth-demo-card">
              <p className="pf-eyebrow">Profili per test interno</p>
              <div className="pf-demo-groups">
                {[...new Set(accounts.map((a) => a.group))].map((group) => (
                  <div className="pf-demo-group" key={group}>
                    <span>{group}</span>
                    <div className="pf-demo-actions coach">
                      {accounts
                        .filter((a) => a.group === group)
                        .map((account) => (
                          <button
                            key={account.email}
                            className="pf-button-secondary"
                            type="button"
                            disabled={loading}
                            onClick={() => fill(account)}
                          >
                            {account.label}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
