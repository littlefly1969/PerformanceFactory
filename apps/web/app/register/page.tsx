"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { API_BASE, secureFetch } from "@/app/lib/api";

export default function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [aiAssistantAccepted, setAiAssistantAccepted] = useState(false);
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
        privacyAccepted,
        aiAssistantAccepted,
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
    setPrivacyAccepted(false);
    setAiAssistantAccepted(false);
    setRegistering(false);
    setMessage(
      "Nuovo atleta creato. Un amministratore deve abilitarlo e collegargli i coach prima dell accesso.",
    );
  };

  return (
    <main className="pf-auth-screen">
      <section className="pf-auth-brand-panel" aria-labelledby="pf-register-heading">
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
          <h1 id="pf-register-heading" className="pf-auth-headline">
            Valuta, monitora e migliora la tua performance
          </h1>
          <p className="pf-auth-copy">
            Richiedi il tuo accesso atleta. L'account verra abilitato
            dall'admin prima di entrare nell'ambiente Performance Factory.
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
          <div className="pf-auth-card pf-auth-card-register">
            <div className="pf-auth-card-header">
              <p className="pf-eyebrow">Nuovo percorso</p>
              <h2>Crea nuovo utente</h2>
              <p>
                Inserisci le informazioni di base. Dopo la richiesta potrai
                tornare al login.
              </p>
            </div>

            <form className="pf-stack pf-auth-register-form" onSubmit={onRegister}>
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
                  checked={privacyAccepted}
                  onChange={(event) => setPrivacyAccepted(event.target.checked)}
                />
                Ho letto l'informativa privacy e accetto il trattamento dei dati
                necessario per usare Performance Factory.
              </label>
              <label className="pf-checkbox">
                <input
                  type="checkbox"
                  checked={aiAssistantAccepted}
                  onChange={(event) =>
                    setAiAssistantAccepted(event.target.checked)
                  }
                />
                Acconsento esplicitamente all'uso dell'assistente AI, sapendo
                che non sostituisce professionisti sanitari o sportivi e che le
                proposte devono essere valutate con prudenza.
              </label>
              <button
                className="pf-button"
                type="submit"
                disabled={registering || !privacyAccepted || !aiAssistantAccepted}
              >
                {registering ? "Creazione..." : "Crea nuovo utente"}
              </button>
            </form>

            <div className="pf-login-options">
              <span>Hai gia un account?</span>
              <Link className="pf-auth-text-link" href="/login">
                Torna al login
              </Link>
            </div>

            {message && <div className="pf-alert warning">{message}</div>}
          </div>
        </div>
      </section>
    </main>
  );
}
