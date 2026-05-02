"use client";

import Link from "next/link";
import Image from "next/image";
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
    account: demoAccounts.find((account) => account.email === "admin@example.com")!,
  },
  {
    label: "Atleta demo",
    account: demoAccounts.find((account) => account.email === "user@example.com")!,
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
  const [registerFullName, setRegisterFullName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const registerAiConsent = true;
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");

  const fill = (account: (typeof demoAccounts)[number]) => {
    setAuthMode("login");
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

  const onRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setRegistering(true);

    const fullNameParts = registerFullName.trim().split(/\s+/).filter(Boolean);
    const firstName = fullNameParts[0] ?? "";
    const lastName = fullNameParts.slice(1).join(" ");

    if (!firstName || !lastName) {
      setMessage("Inserisci nome e cognome.");
      setRegistering(false);
      return;
    }

    const response = await secureFetch(`${API_BASE}/auth/register-athlete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email: registerEmail,
        password: registerPassword,
        aiConsent: registerAiConsent,
      }),
    });

    if (!response.ok) {
      setMessage(
        response.status === 400
          ? "Registrazione non valida o email gia presente."
          : "Registrazione non disponibile.",
      );
      setRegistering(false);
      return;
    }

    setRegisterFullName("");
    setRegisterEmail("");
    setRegisterPassword("");
    setRegistering(false);
    setAuthMode("login");
    setMessage(
      "Nuovo atleta creato. Un amministratore deve abilitarlo e collegargli i coach prima dell accesso.",
    );
  };

  return (
    <main className="pf-auth-screen">
      <section className="pf-auth-brand-panel" aria-labelledby="pf-auth-heading">
        <div className="pf-auth-brand-content">
          <Link className="pf-auth-brand-lockup" href="/" aria-label="Performance Factory">
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

          <ul className="pf-auth-benefits" aria-label="Vantaggi Performance Factory">
            <li>Valutazione iniziale</li>
            <li>Percorso su misura</li>
            <li>Progressi sempre visibili</li>
          </ul>
        </div>
      </section>

      <section className="pf-auth-panel">
        <div className="pf-auth-panel-inner">
          <div className="pf-auth-card">
            <div className="pf-auth-tabs" aria-label="Selezione autenticazione">
              <button
                className={authMode === "register" ? "active" : ""}
                type="button"
                onClick={() => setAuthMode("register")}
              >
                REGISTRATI
              </button>
              <button
                className={authMode === "login" ? "active" : ""}
                type="button"
                onClick={() => setAuthMode("login")}
              >
                ACCEDI
              </button>
            </div>

            <div className="pf-auth-card-header">
              <p className="pf-eyebrow">
                {authMode === "register" ? "Nuovo percorso" : "Bentornato"}
              </p>
              <h2>
                {authMode === "register"
                  ? "Crea il tuo account"
                  : "Accedi alla tua area"}
              </h2>
              <p>
                {authMode === "register"
                  ? "Inizia da qui. Completerai il tuo profilo dopo il primo accesso."
                  : "Inserisci le tue credenziali per continuare."}
              </p>
            </div>

            <div className="pf-auth-socials" aria-label="Accesso social">
              <span>Continua con</span>
              <div>
                <button type="button" aria-label="Continua con Apple">
                  Continua con Apple
                </button>
                <button type="button" aria-label="Continua con Google">
                  Continua con Google
                </button>
              </div>
            </div>

            <div className="pf-auth-divider">
              <span>oppure usa la tua email</span>
            </div>

            {authMode === "register" ? (
              <form className="pf-stack" onSubmit={onRegister}>
                <label className="pf-field">
                  Nome e cognome
                  <input
                    className="pf-input"
                    autoComplete="name"
                    value={registerFullName}
                    onChange={(event) => setRegisterFullName(event.target.value)}
                    required
                  />
                </label>
                <label className="pf-field">
                  Email
                  <input
                    className="pf-input"
                    type="email"
                    autoComplete="email"
                    value={registerEmail}
                    onChange={(event) => setRegisterEmail(event.target.value)}
                    required
                  />
                </label>
                <label className="pf-field">
                  Password
                  <input
                    className="pf-input"
                    type="password"
                    minLength={8}
                    autoComplete="new-password"
                    value={registerPassword}
                    onChange={(event) => setRegisterPassword(event.target.value)}
                    required
                  />
                </label>
                <button
                  className="pf-button"
                  type="submit"
                  disabled={registering}
                >
                  {registering ? "Creazione..." : "Crea account"}
                </button>
                <p className="pf-auth-legal">
                  Creando il tuo account, accetti i Termini e l'Informativa privacy.
                </p>
              </form>
            ) : (
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
                  <button className="pf-auth-text-link" type="button">
                    Hai dimenticato la password?
                  </button>
                </div>
                <button className="pf-button" type="submit" disabled={loading}>
                  {loading ? "Accesso in corso..." : "Accedi"}
                </button>
              </form>
            )}

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
