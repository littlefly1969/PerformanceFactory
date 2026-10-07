"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import "./login.css";
import { API_BASE, secureFetch, storeAccessToken } from "@/app/lib/api";
import { clearAttribution } from "@/app/lib/attribution";

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

export function LoginForm() {
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
    };
    storeAccessToken(user.accessToken);
    // Chi accede non è più un visitatore anonimo: niente attribuzione residua.
    clearAttribution();
    setMessage(
      `Accesso effettuato come ${user.email ?? "utente"} (${user.role ?? "ruolo"})`,
    );
    setLoading(false);

    window.location.href = "/";
  };

  return (
    <main className="pf-login">
      <section className="pf-login-content" aria-labelledby="login-title">
        <Link
          className="pf-login-back"
          href="/start"
          aria-label="Torna all’inizio"
        >
          ←
        </Link>
        <h1 id="login-title">Bentornato.</h1>
        <form onSubmit={onSubmit} className="pf-login-form">
          <label className="pf-login-field">
            <span>E-mail</span>
            <input
              type="email"
              autoComplete="username"
              placeholder="mario@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="pf-login-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="La tua password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button
            className="pf-login-google"
            type="button"
            onClick={startGoogleLogin}
            disabled={loading}
          >
            <GoogleIcon />
            <span>Accedi con Google</span>
          </button>
          {message && (
            <p className="pf-login-message" role="alert">
              {message}
            </p>
          )}
          <button
            className="pf-login-submit"
            type="submit"
            disabled={loading || !email.trim() || !password}
          >
            {loading ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>
        <p className="pf-login-register">
          Non hai un account? <Link href="/start">Fai il quiz</Link>
        </p>
      </section>
    </main>
  );
}
