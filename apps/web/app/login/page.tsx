"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
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
    label: "Atleta",
    email: "user@example.com",
    password: "password123",
  },
  {
    group: "Professionisti",
    label: "Generale",
    email: "pro@example.com",
    password: "password123",
  },
  {
    group: "Professionisti",
    label: "Tecnico-tattico",
    email: "prof_TT@example.it",
    password: "password123",
  },
  {
    group: "Professionisti",
    label: "Preparazione atletica",
    email: "prof_AP@example.it",
    password: "password123",
  },
  {
    group: "Professionisti",
    label: "Equipaggiamento",
    email: "prof_EQ@example.it",
    password: "password123",
  },
  {
    group: "Professionisti",
    label: "Fisioterapia",
    email: "prof_PT@example.it",
    password: "password123",
  },
  {
    group: "Professionisti",
    label: "Nutrizione",
    email: "prof_NU@example.it",
    password: "password123",
  },
  {
    group: "Professionisti",
    label: "Allenamento mentale",
    email: "prof_MT@example.it",
    password: "password123",
  },
  {
    group: "Allenatori",
    label: "Ciclismo",
    email: "coach_cycling@example.it",
    password: "password123",
  },
  {
    group: "Allenatori",
    label: "Corsa",
    email: "coach_running@example.it",
    password: "password123",
  },
  {
    group: "AI Tuner",
    label: "AI Tuner",
    email: "tuner@example.com",
    password: "password123",
  },
];

const demoAccessAccounts = [
  {
    label: "Amministratore demo",
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
  {
    label: "AI Tuner demo",
    account: demoAccounts.find(
      (account) => account.email === "tuner@example.com",
    )!,
  },
];

const coachDemoAccounts = demoAccounts
  .filter((account) => account.group === "Allenatori")
  .map((account) => ({
    label: `${account.label} allenatore`,
    account,
  }));

const professionalDemoAccounts = demoAccounts
  .filter((account) => account.group === "Professionisti")
  .map((account) => ({
    label: `${account.label} professionista`,
    account,
  }));

const pendingAdminActivationMessage =
  "L'amministratore sta valutando la tua richiesta e ti accettera.";
const rejectedApplicationMessage =
  "Candidatura rifiutata. Puoi riproporre una nuova richiesta di registrazione.";

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="pf-google-icon"
      viewBox="0 0 18 18"
    >
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

export default function LoginPage() {
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

  const fill = (account: (typeof demoAccounts)[number]) => {
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
        if (data.message === "Account in attesa di attivazione amministratore") {
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
    setMessage(`Accesso effettuato come ${user.email ?? "utente"} (${user.role ?? "ruolo"})`);
    setLoading(false);

    const destination =
      user.consentRequired
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
              ? "/ai-tuner"
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

            <div className="pf-auth-divider">oppure</div>

            <button
              className="pf-google-button"
              type="button"
              onClick={startGoogleLogin}
            >
              <GoogleIcon />
              <span>Continua con Google</span>
            </button>

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
                <span>Professionisti area</span>
                <div className="pf-demo-actions coach">
                  {professionalDemoAccounts.map(({ label, account }) => (
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
                <span>Allenatori sport</span>
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
