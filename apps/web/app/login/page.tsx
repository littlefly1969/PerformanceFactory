"use client";

import Link from "next/link";
import { useState } from "react";
import { LanguageToggle } from "@/app/components/language-provider";
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

const groupedAccounts = demoAccounts.reduce(
  (groups, account) => {
    groups[account.group] = [...(groups[account.group] ?? []), account];
    return groups;
  },
  {} as Record<string, typeof demoAccounts>,
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registerFirstName, setRegisterFirstName] = useState("");
  const [registerLastName, setRegisterLastName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerAiConsent, setRegisterAiConsent] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);

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
      setMessage("Credentials are not valid or the API is not reachable.");
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

    const response = await secureFetch(`${API_BASE}/auth/register-athlete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: registerFirstName,
        lastName: registerLastName,
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

    setRegisterFirstName("");
    setRegisterLastName("");
    setRegisterEmail("");
    setRegisterPassword("");
    setRegisterAiConsent(true);
    setRegistering(false);
    setMessage(
      "Nuovo atleta creato. Un amministratore deve abilitarlo e collegargli i coach prima dell accesso.",
    );
  };

  return (
    <main className="pf-login-page">
      <section className="pf-login-hero">
        <Link className="pf-brand" href="/">
          <span className="pf-brand-mark">PF</span>
          <span>
            <strong>PerformanceFactory</strong>
            <small>AI performance workflow</small>
          </span>
        </Link>
        <div>
          <p className="pf-eyebrow">Secure workspace</p>
          <h1>Entra nel flusso corretto per il tuo ruolo.</h1>
          <p>
            Atleti, professionisti e admin vedono solo le azioni che servono
            davvero: onboarding, review, generazione AI e pubblicazione dei
            cicli restano separati e tracciati.
          </p>
        </div>
        <div className="pf-login-proof">
          <span>AI su richiesta admin</span>
          <span>Approvazione professionista</span>
          <span>Pubblicazione controllata</span>
        </div>
      </section>

      <section className="pf-login-panel">
        <div className="pf-login-tools">
          <LanguageToggle />
        </div>
        <div>
          <p className="pf-eyebrow">Sign in</p>
          <h2>Accedi alla tua area</h2>
          <p className="pf-muted">
            Usa le credenziali reali oppure una scorciatoia seed per provare il
            flusso.
          </p>
        </div>

        <form className="pf-stack" onSubmit={onSubmit}>
          <label className="pf-field">
            Email
            <input
              className="pf-input"
              type="email"
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="pf-button" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="pf-seed-panel">
          <div>
            <p className="pf-eyebrow">Nuovo utente</p>
            <h2>Richiedi accesso atleta</h2>
            <p className="pf-muted">
              L account resta sospeso finche un amministratore non lo abilita e
              assegna i coach per area.
            </p>
          </div>
          <form className="pf-stack" onSubmit={onRegister}>
            <div className="pf-two-col">
              <label className="pf-field">
                Nome
                <input
                  className="pf-input"
                  value={registerFirstName}
                  onChange={(event) => setRegisterFirstName(event.target.value)}
                  required
                />
              </label>
              <label className="pf-field">
                Cognome
                <input
                  className="pf-input"
                  value={registerLastName}
                  onChange={(event) => setRegisterLastName(event.target.value)}
                  required
                />
              </label>
            </div>
            <label className="pf-field">
              Email
              <input
                className="pf-input"
                type="email"
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
                value={registerPassword}
                onChange={(event) => setRegisterPassword(event.target.value)}
                required
              />
            </label>
            <label className="pf-checkbox">
              <input
                type="checkbox"
                checked={registerAiConsent}
                onChange={(event) => setRegisterAiConsent(event.target.checked)}
              />
              Consento l uso dell AI per generare proposte e questionari
              revisionati dai coach.
            </label>
            <button
              className="pf-button-secondary"
              type="submit"
              disabled={registering}
            >
              {registering ? "Creazione..." : "Crea nuovo utente"}
            </button>
          </form>
        </div>

        <div className="pf-seed-panel">
          {Object.entries(groupedAccounts).map(([group, accounts]) => (
            <div key={group} className="pf-seed-group">
              <strong>{group}</strong>
              <div className="pf-role-grid">
                {accounts.map((account) => (
                  <button
                    key={account.email}
                    className="pf-button-secondary"
                    type="button"
                    onClick={() => fill(account)}
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {message && <div className="pf-alert warning">{message}</div>}
      </section>
    </main>
  );
}
