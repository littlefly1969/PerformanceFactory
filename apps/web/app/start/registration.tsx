"use client";
import { useRef, useState } from "react";
import { API_BASE } from "../lib/api";
import type { DiscoveryDraft } from "./discovery-types";
import { DRAFT_KEY, journeyHref } from "./discovery-state";

export function Registration({
  draft,
  onBusyChange,
}: {
  draft: DiscoveryDraft;
  onBusyChange: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  return (
    <form
      className="pf4-body pf4-registration"
      onSubmit={async (event) => {
        event.preventDefault();
        if (locked.current) return;
        const data = new FormData(event.currentTarget);
        if (data.get("password") !== data.get("confirmation")) {
          setError("Le password non coincidono");
          return;
        }
        locked.current = true;
        setBusy(true);
        onBusyChange(true);
        setError("");
        try {
          const response = await fetch(`${API_BASE}/auth/register-athlete`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              firstName: data.get("firstName"),
              lastName: data.get("lastName"),
              email: data.get("email"),
              password: data.get("password"),
              discovery: draft,
            }),
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(
              Array.isArray(result.message)
                ? result.message.join(". ")
                : result.message || "Registrazione non riuscita",
            );
          const href = journeyHref(result.journey?.nextStep);
          try {
            sessionStorage.removeItem(DRAFT_KEY);
            sessionStorage.removeItem("pf.accessToken");
          } catch {
            /* Session cookie owns the authenticated journey. */
          }
          window.location.assign(href);
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Registrazione non riuscita. Riprova.",
          );
          locked.current = false;
          setBusy(false);
          onBusyChange(false);
        }
      }}
    >
      <h1>Crea il tuo account.</h1>
      <p className="pf4-kicker">Salviamo il tuo punto di partenza</p>
      <div className="pf4-fields">
        <label>
          Nome
          <input
            name="firstName"
            autoComplete="given-name"
            maxLength={100}
            required
            placeholder="Mario"
          />
        </label>
        <label>
          Cognome
          <input
            name="lastName"
            autoComplete="family-name"
            maxLength={100}
            required
            placeholder="Rossi"
          />
        </label>
        <label>
          E-mail
          <input
            type="email"
            name="email"
            autoComplete="email"
            maxLength={320}
            required
            placeholder="mario@email.com"
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={200}
            required
            placeholder="Almeno 8 caratteri"
          />
        </label>
        <label>
          Conferma password
          <input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={200}
            required
            placeholder="Ripeti la password"
          />
        </label>
      </div>
      <p className="pf4-note">
        Dopo la registrazione potrai leggere e scegliere i consensi del tuo
        percorso.
      </p>
      {error && (
        <p role="alert" className="pf4-error">
          {error}
        </p>
      )}
      <button className="pf4-cta" disabled={busy}>
        {busy ? "Creazione account…" : "Crea account"}
      </button>
      <p className="pf4-login">
        Hai già un account? <a href="/login">Accedi</a>
      </p>
    </form>
  );
}
