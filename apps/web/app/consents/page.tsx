"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductShell, StatusBadge } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type ConsentDocument = {
  type: "PRIVACY" | "AI_ASSISTANT" | string;
  version: string;
  title: string;
  summary: string;
  body: string[];
  documentHash: string;
};

type ConsentStatus = {
  required: boolean;
  missingConsents: string[];
  documents: ConsentDocument[];
};

type CurrentUser = {
  role?: string;
  onboardingRequired?: boolean;
};

const roleHome: Record<string, string> = {
  USER: "/user",
  PROFESSIONAL: "/professional",
  ADMIN: "/admin/cycles",
};

export default function ConsentsPage() {
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [aiAssistantAccepted, setAiAssistantAccepted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const missing = useMemo(
    () => new Set(status?.missingConsents ?? []),
    [status?.missingConsents],
  );
  
  const redirectAfterConsent = (current: CurrentUser | null = me) => {
    if (current?.role === "USER" && current.onboardingRequired) {
      window.location.href = "/onboarding";
      return;
    }
    window.location.href = roleHome[current?.role ?? ""] ?? "/";
  };
  
  const load = async () => {
    setMessage(null);
    const [meRes, statusRes] = await Promise.all([
      secureFetch(`${API_BASE}/auth/me`, { credentials: "include" }),
      secureFetch(`${API_BASE}/consents/required`, { credentials: "include" }),
    ]);
    if (!meRes.ok || !statusRes.ok) {
      window.location.href = "/login";
      return;
    }
    const nextMe = (await meRes.json()) as CurrentUser;
    const nextStatus = (await statusRes.json()) as ConsentStatus;
    setMe(nextMe);
    setStatus(nextStatus);
    if (!nextStatus.required) {
      redirectAfterConsent(nextMe);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const accept = async () => {
    if (!privacyAccepted || !aiAssistantAccepted) {
      setMessage("Devi accettare entrambi i consensi per continuare.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/consents/required`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        privacyAccepted,
        aiAssistantAccepted,
        acceptedDocuments: status?.documents.map((document) => ({
          type: document.type,
          version: document.version,
          documentHash: document.documentHash,
        })),
      }),
    });
    if (!response.ok) {
      try {
        const data = (await response.json()) as { message?: string };
        setMessage(data.message ?? "Non e stato possibile salvare i consensi.");
      } catch {
        setMessage("Non e stato possibile salvare i consensi.");
      }
      setSaving(false);
      return;
    }
    setSaving(false);
    redirectAfterConsent();
  };

  return (
    <ProductShell
      eyebrow="Consensi obbligatori"
      title="Privacy e assistente AI"
      description="Prima di usare Performance Factory devi accettare in modo esplicito l'informativa privacy e l'utilizzo dell'assistente AI."
      nav={[]}
      stats={[
        {
          label: "Privacy",
          value: missing.has("PRIVACY") ? "Richiesta" : "Accettata",
          tone: missing.has("PRIVACY") ? "warning" : "success",
        },
        {
          label: "AI",
          value: missing.has("AI_ASSISTANT") ? "Richiesta" : "Accettata",
          tone: missing.has("AI_ASSISTANT") ? "warning" : "success",
        },
      ]}
    >
      {message && <div className="pf-alert warning">{message}</div>}

      <section className="pf-dashboard-grid single">
        <article className="pf-panel">
          <div className="pf-stack">
            {(status?.documents ?? []).map((document) => (
              <article className="pf-card" key={document.type}>
                <div className="pf-card-top">
                  <div>
                    <h3>{document.title}</h3>
                    <p className="pf-muted">{document.summary}</p>
                  </div>
                  <StatusBadge
                    tone={missing.has(document.type) ? "warning" : "success"}
                  >
                    {document.version}
                  </StatusBadge>
                </div>
                <div className="pf-consent-text">
                  {document.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {document.type === "PRIVACY" && (
                  <label className="pf-checkbox">
                    <input
                      type="checkbox"
                      checked={privacyAccepted}
                      onChange={(event) =>
                        setPrivacyAccepted(event.target.checked)
                      }
                    />
                    Accetto l'informativa privacy e il trattamento dei dati
                    necessario all'uso della piattaforma.
                  </label>
                )}
                {document.type === "AI_ASSISTANT" && (
                  <label className="pf-checkbox">
                    <input
                      type="checkbox"
                      checked={aiAssistantAccepted}
                      onChange={(event) =>
                        setAiAssistantAccepted(event.target.checked)
                      }
                    />
                    Acconsento esplicitamente all'utilizzo dell'assistente AI e
                    comprendo i suoi limiti.
                  </label>
                )}
              </article>
            ))}

            <article className="pf-card">
              <div className="pf-stack">
                <button
                  className="pf-button"
                  type="button"
                  disabled={
                    saving ||
                    !privacyAccepted ||
                    !aiAssistantAccepted ||
                    !status?.documents.length
                  }
                  onClick={accept}
                >
                  {saving ? "Salvataggio..." : "Accetta e continua"}
                </button>
              </div>
            </article>
          </div>
        </article>
      </section>
    </ProductShell>
  );
}
