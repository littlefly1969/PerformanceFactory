"use client";
import { GoogleRegistrationButton } from "./google-registration";
import { useRef, useState } from "react";
import { API_BASE } from "../lib/api";
import { clearAttribution, currentAttribution } from "../lib/attribution";
import type { DiscoveryDraft } from "./discovery-types";
import { DRAFT_KEY, journeyHref } from "./discovery-state";
import { clearQuizToken, withQuizToken } from "./quiz-draft";
import {
  ConsentText,
  SignupCheck,
  useConsentDocuments,
} from "./signup-consents";

/** «Mario De Rossi» → nome «Mario», cognome «De Rossi». */
export function splitFullName(full: string) {
  const [firstName = "", ...rest] = full.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

const accepts = (title: string) =>
  `Ho letto e accetto ${/^[aeiou]/i.test(title) ? "l’" : "il "}${title}`;

export function Registration({
  draft,
  googlePending = false,
  onBusyChange,
}: {
  draft: DiscoveryDraft;
  googlePending?: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const documents = useConsentDocuments();
  const locked = useRef(false);
  const check = (name: string) => ({
    name,
    checked: !!checks[name],
    onChange: (checked: boolean) => setChecks({ ...checks, [name]: checked }),
  });
  // Con i documenti caricati i consensi si danno qui; altrimenti dopo l'account.
  const consentsReady =
    !!documents && documents.every((d) => checks[d.documentHash]);
  const ready = !!checks.adultConfirmed && (!documents || consentsReady);
  return (
    <form
      className="pf4-body pf4-registration"
      onSubmit={async (event) => {
        event.preventDefault();
        if (locked.current) return;
        const data = new FormData(event.currentTarget);
        const name = splitFullName(String(data.get("fullName") ?? ""));
        if (!name.lastName) {
          setError("Scrivi nome e cognome");
          return;
        }
        if (data.get("password") !== data.get("confirmation")) {
          setError("Le password non coincidono");
          return;
        }
        locked.current = true;
        setBusy(true);
        onBusyChange(true);
        setError("");
        try {
          const response = await withQuizToken((quizToken) =>
            fetch(`${API_BASE}/auth/register-athlete`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...name,
                email: data.get("email"),
                password: data.get("password"),
                adultConfirmed: data.get("adultConfirmed") === "on",
                ...(documents && consentsReady
                  ? {
                      privacyAccepted: true,
                      aiAssistantAccepted: true,
                      marketingAccepted: !!checks.marketingAccepted,
                      acceptedDocuments: documents.map(
                        ({ type, version, documentHash }) => ({
                          type,
                          version,
                          documentHash,
                        }),
                      ),
                    }
                  : {}),
                discovery: draft,
                attribution: currentAttribution(),
                quizToken,
              }),
            }),
          );
          const result = await response.json();
          if (!response.ok)
            throw new Error(
              Array.isArray(result.message)
                ? result.message.join(". ")
                : result.message || "Registrazione non riuscita",
            );
          const href = journeyHref(result.journey?.nextStep);
          clearAttribution();
          clearQuizToken();
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
      <p className="pf4-kicker">Salviamo programma e progressi</p>
      <GoogleRegistrationButton
        draft={draft}
        pending={googlePending}
        disabled={busy}
        onError={setError}
      />
      <p className="pf4-divider">Oppure con e-mail</p>
      <div className="pf4-fields">
        <label>
          Nome e cognome
          <input
            name="fullName"
            autoComplete="name"
            maxLength={201}
            required
            placeholder="Mario Rossi"
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
      <div className="pf4-signup-checks">
        <SignupCheck {...check("adultConfirmed")} required>
          Ho almeno 18 anni
        </SignupCheck>
        {documents?.map((document) => (
          <SignupCheck
            key={document.documentHash}
            {...check(document.documentHash)}
            required
            details={<ConsentText document={document} />}
          >
            {accepts(document.title)}
          </SignupCheck>
        ))}
        {documents && (
          <SignupCheck {...check("marketingAccepted")} required={false}>
            Voglio ricevere novità, offerte e iniziative dei circoli partner.
            Puoi cambiare idea in qualsiasi momento dal profilo.
          </SignupCheck>
        )}
      </div>
      {!documents && (
        <p className="pf4-note">
          Dopo la registrazione potrai leggere e scegliere i consensi del tuo
          percorso.
        </p>
      )}
      {error && (
        <p role="alert" className="pf4-error">
          {error}
        </p>
      )}
      <button className="pf4-cta" disabled={busy || !ready}>
        {busy ? "Creazione account…" : "Crea account"}
      </button>
      <p className="pf4-login">
        Hai già un account? <a href="/login">Accedi</a>
      </p>
    </form>
  );
}
