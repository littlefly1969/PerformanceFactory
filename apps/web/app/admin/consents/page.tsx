"use client";

import { useEffect, useState } from "react";
import {
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type ConsentDocument = {
  type: "PRIVACY" | "AI_ASSISTANT" | string;
  version: string;
  title: string;
  summary: string;
  body: string[];
  documentHash: string;
};

const emptyDraft = {
  type: "PRIVACY",
  version: "",
  title: "",
  summary: "",
  bodyText: "",
  publish: true,
};

export default function AdminConsentsPage() {
  const [documents, setDocuments] = useState<ConsentDocument[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/consent-documents`, {
      credentials: "include",
    });
    if (!response.ok) {
      setMessage("Non e stato possibile caricare i documenti consenso.");
      return;
    }
    setDocuments((await response.json()) as ConsentDocument[]);
  };

  useEffect(() => {
    void load();
  }, []);

  const edit = (document: ConsentDocument) => {
    setDraft({
      type: document.type,
      version: document.version,
      title: document.title,
      summary: document.summary,
      bodyText: document.body.join("\n\n"),
      publish: true,
    });
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/consent-documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        type: draft.type,
        version: draft.version,
        title: draft.title,
        summary: draft.summary,
        body: draft.bodyText
          .split(/\n\s*\n/)
          .map((item) => item.trim())
          .filter(Boolean),
        publish: draft.publish,
      }),
    });
    setSaving(false);
    if (!response.ok) {
      try {
        const data = (await response.json()) as { message?: string };
        setMessage(data.message ?? "Salvataggio non riuscito.");
      } catch {
        setMessage("Salvataggio non riuscito.");
      }
      return;
    }
    setMessage("Documento pubblicato. Gli utenti dovranno accettare la nuova versione.");
    setDraft(emptyDraft);
    await load();
  };

  return (
    <ProductShell
      eyebrow="Amministrazione privacy"
      title="Documenti consenso"
      description="Gestisci versioni, testo completo e hash dei documenti obbligatori per privacy e assistente AI."
      actions={
        <button className="pf-button-secondary" type="button" onClick={load}>
          Aggiorna
        </button>
      }
      stats={documents.map((document) => ({
        label: document.type,
        value: document.version,
        tone: "accent",
      }))}
    >
      {message && <div className="pf-alert warning">{message}</div>}

      <section className="pf-dashboard-grid">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Versioni attive</h2>
              <p className="pf-muted">
                L'hash viene calcolato server-side su tipo, versione, titolo,
                sommario e corpo del documento.
              </p>
            </div>
          </div>
          <div className="pf-stack">
            {documents.map((document) => (
              <article className="pf-card" key={document.type}>
                <div className="pf-card-top">
                  <div>
                    <h3>{document.title}</h3>
                    <p className="pf-muted">{document.summary}</p>
                  </div>
                  <StatusBadge tone="success">{document.version}</StatusBadge>
                </div>
                <p className="pf-muted">Hash: {document.documentHash}</p>
                <ul className="pf-muted">
                  {document.body.map((paragraph) => (
                    <li key={paragraph}>{paragraph}</li>
                  ))}
                </ul>
                <button
                  className="pf-button-secondary"
                  type="button"
                  onClick={() => edit(document)}
                >
                  Usa come base
                </button>
              </article>
            ))}
          </div>
        </article>

        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Nuova versione</h2>
              <p className="pf-muted">
                Per rendere bloccante una modifica usa una nuova versione.
              </p>
            </div>
          </div>
          <div className="pf-stack">
            <label className="pf-field">
              Tipo
              <select
                className="pf-input"
                value={draft.type}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
              >
                <option value="PRIVACY">Privacy</option>
                <option value="AI_ASSISTANT">Assistente AI</option>
              </select>
            </label>
            <label className="pf-field">
              Versione
              <input
                className="pf-input"
                value={draft.version}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    version: event.target.value,
                  }))
                }
                placeholder="privacy-v2-2026-05-05"
              />
            </label>
            <label className="pf-field">
              Titolo
              <input
                className="pf-input"
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label className="pf-field">
              Sommario
              <textarea
                className="pf-textarea"
                value={draft.summary}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    summary: event.target.value,
                  }))
                }
              />
            </label>
            <label className="pf-field">
              Testo completo
              <textarea
                className="pf-textarea"
                rows={14}
                value={draft.bodyText}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    bodyText: event.target.value,
                  }))
                }
              />
            </label>
            <label className="pf-checkbox">
              <input
                type="checkbox"
                checked={draft.publish}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    publish: event.target.checked,
                  }))
                }
              />
              Pubblica come versione attiva
            </label>
            <button
              className="pf-button"
              type="button"
              disabled={saving}
              onClick={save}
            >
              {saving ? "Salvataggio..." : "Salva documento"}
            </button>
          </div>
        </article>
      </section>
    </ProductShell>
  );
}
