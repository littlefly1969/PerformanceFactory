"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { API_BASE, secureFetch } from "@/app/lib/api";

type ConsentDocument = {
  type: "PRIVACY" | "AI_ASSISTANT" | string;
  version: string;
  title: string;
  summary: string;
  body: string[];
  documentHash: string;
};

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

export default function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [aiAssistantAccepted, setAiAssistantAccepted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [documents, setDocuments] = useState<ConsentDocument[]>([]);

  useEffect(() => {
    const loadDocuments = async () => {
      const response = await secureFetch(`${API_BASE}/consents/documents`);
      if (response.ok) {
        setDocuments((await response.json()) as ConsentDocument[]);
      }
    };
    void loadDocuments();
  }, []);

  const startGoogleRegister = () => {
    const returnTo = `${window.location.origin}/`;
    window.location.href = `${API_BASE}/auth/google/register?returnTo=${encodeURIComponent(returnTo)}`;
  };

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
        acceptedDocuments: documents.map((document) => ({
          type: document.type,
          version: document.version,
          documentHash: document.documentHash,
        })),
      }),
    });

    if (!response.ok) {
      try {
        const data = (await response.json()) as { message?: string };
        setMessage(data.message ?? "Registrazione non disponibile.");
      } catch {
        setMessage(
          response.status === 400
            ? "Registrazione non valida o email gia presente."
            : "Registrazione non disponibile.",
        );
      }
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
              {documents.map((document) => (
                <article className="pf-card" key={document.type}>
                  <div className="pf-card-top">
                    <div>
                      <h3>{document.title}</h3>
                      <p className="pf-muted">{document.summary}</p>
                    </div>
                    <span className="pf-badge accent">{document.version}</span>
                  </div>
                  <ul className="pf-muted">
                    {document.body.map((paragraph) => (
                      <li key={paragraph}>{paragraph}</li>
                    ))}
                  </ul>
                </article>
              ))}
              <label className="pf-checkbox">
                <input
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(event) => setPrivacyAccepted(event.target.checked)}
                />
                Ho letto integralmente l'informativa privacy nella versione
                corrente e accetto il trattamento dei dati necessario per usare
                Performance Factory.
              </label>
              <label className="pf-checkbox">
                <input
                  type="checkbox"
                  checked={aiAssistantAccepted}
                  onChange={(event) =>
                    setAiAssistantAccepted(event.target.checked)
                  }
                />
                Acconsento esplicitamente all'uso dell'assistente AI nella
                versione corrente, sapendo che non sostituisce professionisti
                sanitari o sportivi e che le proposte devono essere valutate con
                prudenza.
              </label>
              <button
                className="pf-button"
                type="submit"
                disabled={
                  registering ||
                  !privacyAccepted ||
                  !aiAssistantAccepted ||
                  documents.length === 0
                }
              >
                {registering ? "Creazione..." : "Crea nuovo utente"}
              </button>
            </form>

            <div className="pf-auth-divider">oppure</div>

            <button
              className="pf-google-button"
              type="button"
              onClick={startGoogleRegister}
            >
              <GoogleIcon />
              <span>Registrati con Google</span>
            </button>

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
