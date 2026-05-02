"use client";

import Link from "next/link";
import { useState } from "react";
import { LanguageToggle } from "@/app/components/language-provider";
import { API_BASE, secureFetch } from "@/app/lib/api";

export default function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [aiConsent, setAiConsent] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const onRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setRegistering(true);

    const response = await secureFetch(`${API_BASE}/auth/register-athlete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        password,
        aiConsent,
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

    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setAiConsent(true);
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
            <small>Registrazione atleta</small>
          </span>
        </Link>
        <div>
          <p className="pf-eyebrow">Nuovo utente</p>
          <h1>Richiedi accesso atleta.</h1>
          <p>
            L account resta sospeso finche un amministratore non lo abilita e
            assegna i coach per area.
          </p>
        </div>
      </section>

      <section className="pf-login-panel">
        <div className="pf-login-tools">
          <LanguageToggle />
        </div>
        <div>
          <p className="pf-eyebrow">Registrazione</p>
          <h2>Dati nuovo atleta</h2>
          <p className="pf-muted">
            Inserisci le informazioni di base. Dopo la richiesta potrai tornare
            al login.
          </p>
        </div>

        <form className="pf-stack" onSubmit={onRegister}>
          <div className="pf-two-col">
            <label className="pf-field">
              Nome
              <input
                className="pf-input"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
              />
            </label>
            <label className="pf-field">
              Cognome
              <input
                className="pf-input"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
              />
            </label>
          </div>
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
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label className="pf-checkbox">
            <input
              type="checkbox"
              checked={aiConsent}
              onChange={(event) => setAiConsent(event.target.checked)}
            />
            Consento l uso dell AI per generare proposte e questionari
            revisionati dai coach.
          </label>
          <div className="pf-actions">
            <button className="pf-button" type="submit" disabled={registering}>
              {registering ? "Creazione..." : "Crea nuovo utente"}
            </button>
            <Link className="pf-button-secondary" href="/login">
              Torna al login
            </Link>
          </div>
        </form>

        {message && <div className="pf-alert warning">{message}</div>}
      </section>
    </main>
  );
}
