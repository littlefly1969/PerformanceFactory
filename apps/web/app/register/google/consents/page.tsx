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

type PendingGoogleRegistration = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

export default function GoogleConsentsPage() {
  const [pending, setPending] = useState<PendingGoogleRegistration | null>(null);
  const [documents, setDocuments] = useState<ConsentDocument[]>([]);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [aiAssistantAccepted, setAiAssistantAccepted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [pendingRes, documentsRes] = await Promise.all([
        secureFetch(`${API_BASE}/auth/google/register/pending`, {
          credentials: "include",
        }),
        secureFetch(`${API_BASE}/consents/documents`),
      ]);
      if (!pendingRes.ok || !documentsRes.ok) {
        window.location.href = "/register";
        return;
      }
      setPending((await pendingRes.json()) as PendingGoogleRegistration);
      setDocuments((await documentsRes.json()) as ConsentDocument[]);
    };
    void load();
  }, []);

  const complete = async () => {
    if (!privacyAccepted || !aiAssistantAccepted) {
      setMessage("Devi accettare entrambi i consensi per continuare.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/auth/google/register/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        privacyAccepted,
        aiAssistantAccepted,
        acceptedDocuments: documents.map((document) => ({
          type: document.type,
          version: document.version,
          documentHash: document.documentHash,
        })),
      }),
    });
    setSaving(false);
    if (!response.ok) {
      try {
        const data = (await response.json()) as { message?: string };
        setMessage(data.message ?? "Registrazione Google non completata.");
      } catch {
        setMessage("Registrazione Google non completata.");
      }
      return;
    }
    setMessage(
      "Registrazione Google completata. Un amministratore deve abilitare l'account prima dell'accesso.",
    );
  };

  return (
    <main className="pf-auth-screen">
      <section className="pf-auth-brand-panel" aria-labelledby="pf-google-consents-heading">
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
          <h1 id="pf-google-consents-heading" className="pf-auth-headline">
            Completa la registrazione Google
          </h1>
          <p className="pf-auth-copy">
            Prima di creare l'account devi leggere e accettare i documenti
            obbligatori nella versione corrente.
          </p>
        </div>
      </section>

      <section className="pf-auth-panel">
        <div className="pf-auth-panel-inner">
          <div className="pf-auth-card pf-auth-card-register">
            <div className="pf-auth-card-header">
              <p className="pf-eyebrow">Consensi obbligatori</p>
              <h2>{pending?.email ?? "Account Google"}</h2>
              <p>Identita Google verificata. Mancano privacy e consenso AI.</p>
            </div>

            <div className="pf-stack">
              <div className="pf-consent-documents">
                {documents.map((document) => (
                  <details className="pf-consent-document" key={document.type} open>
                    <summary>
                      <span>{document.title}</span>
                      <span className="pf-badge accent">{document.version}</span>
                    </summary>
                    <div>
                      <p className="pf-muted">{document.summary}</p>
                      {document.body.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                  </details>
                ))}
              </div>

              <label className="pf-checkbox">
                <input
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(event) => setPrivacyAccepted(event.target.checked)}
                />
                Ho letto integralmente l'informativa privacy nella versione corrente.
              </label>
              <label className="pf-checkbox">
                <input
                  type="checkbox"
                  checked={aiAssistantAccepted}
                  onChange={(event) =>
                    setAiAssistantAccepted(event.target.checked)
                  }
                />
                Acconsento esplicitamente all'utilizzo dell'assistente AI nella
                versione corrente.
              </label>
              <button
                className="pf-button"
                type="button"
                disabled={
                  saving ||
                  !privacyAccepted ||
                  !aiAssistantAccepted ||
                  documents.length === 0
                }
                onClick={complete}
              >
                {saving ? "Salvataggio..." : "Accetta e completa"}
              </button>
              <Link className="pf-auth-text-link" href="/login">
                Torna al login
              </Link>
              {message && <div className="pf-alert warning">{message}</div>}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
