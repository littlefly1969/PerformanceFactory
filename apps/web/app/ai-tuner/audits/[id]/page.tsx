"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProductShell } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type AuditDetail = {
  id: string;
  athleteLabel: string;
  createdAt: string;
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  area: { id: string; name: string } | null;
  cycleVersion: number | null;
  inputJson: unknown;
  outputJson: unknown;
  currentAreaConfig: {
    id: string;
    initialContext: string;
    responseFormatPrompt: string;
  } | null;
};

export default function AuditDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [audit, setAudit] = useState<AuditDetail | null>(null);
  const [initialContext, setInitialContext] = useState("");
  const [responseFormatPrompt, setResponseFormatPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goldenLabel, setGoldenLabel] = useState("");

  useEffect(() => {
    if (!id) return;
    secureFetch(`${API_BASE}/ai-tuning/audits/${id}`).then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as AuditDetail;
        setAudit(data);
        setInitialContext(data.currentAreaConfig?.initialContext ?? "");
        setResponseFormatPrompt(
          data.currentAreaConfig?.responseFormatPrompt ?? "",
        );
      }
    });
  }, [id]);

  if (!audit) {
    return (
      <ProductShell eyebrow="AI TUNING" title="Audit">
        <p>Caricamento…</p>
      </ProductShell>
    );
  }

  const startReplay = async () => {
    setRunning(true);
    setError(null);
    const baseline = {
      initialContext: audit.currentAreaConfig?.initialContext ?? "",
      responseFormatPrompt: audit.currentAreaConfig?.responseFormatPrompt ?? "",
    };
    const body = {
      auditId: audit.id,
      initialContextOverride:
        initialContext !== baseline.initialContext ? initialContext : undefined,
      responseFormatPromptOverride:
        responseFormatPrompt !== baseline.responseFormatPrompt
          ? responseFormatPrompt
          : undefined,
    };
    const res = await secureFetch(`${API_BASE}/ai-tuning/replays`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      setError(text || "Replay non riuscito");
      setRunning(false);
      return;
    }
    const data = (await res.json()) as { replay: { id: string } };
    router.push(`/ai-tuner/replays/${data.replay.id}`);
  };

  const saveAsGolden = async () => {
    if (!goldenLabel.trim()) return;
    const res = await secureFetch(
      `${API_BASE}/ai-tuning/golden-contexts/from-audit/${audit.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: goldenLabel.trim() }),
      },
    );
    if (res.ok) {
      setGoldenLabel("");
      alert("Golden context creato");
    } else {
      alert("Errore creazione golden");
    }
  };

  return (
    <ProductShell
      eyebrow="AI TUNING"
      title={`Audit ${audit.athleteLabel}`}
      description={`Area ${audit.area?.name ?? "—"} · ciclo v${audit.cycleVersion ?? "—"} · ${audit.provider} · ${audit.model}`}
    >
      <div className="pf-stack" style={{ gap: 18 }}>
        {(() => {
          const inputJson = audit.inputJson as
            | {
                prompt?: {
                  system?: unknown;
                  user?: unknown;
                  responseJsonSchema?: unknown;
                };
              }
            | null;
          const prompt = inputJson?.prompt;
          if (!prompt) {
            return (
              <section className="pf-card">
                <h3>Prompt originale</h3>
                <p className="pf-meta">
                  Audit storico senza prompt strutturato in input.
                </p>
              </section>
            );
          }
          const systemText =
            typeof prompt.system === "string"
              ? prompt.system
              : JSON.stringify(prompt.system, null, 2);
          const userText =
            typeof prompt.user === "string"
              ? prompt.user
              : JSON.stringify(prompt.user, null, 2);
          return (
            <section className="pf-card">
              <h3>Prompt originale</h3>
              <p className="pf-meta">
                Quello che è effettivamente arrivato al modello (system +
                contesto utente).
              </p>
              <details open>
                <summary>
                  <strong>System</strong>
                </summary>
                <pre
                  style={{
                    maxHeight: 220,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    background: "var(--pf-surface-muted, #f5f5f5)",
                    padding: 8,
                    borderRadius: 4,
                  }}
                >
                  {systemText}
                </pre>
              </details>
              <details>
                <summary>
                  <strong>User (task + constraints + context atleta)</strong>
                </summary>
                <pre
                  style={{
                    maxHeight: 400,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    background: "var(--pf-surface-muted, #f5f5f5)",
                    padding: 8,
                    borderRadius: 4,
                  }}
                >
                  {userText}
                </pre>
              </details>
              {prompt.responseJsonSchema != null && (
                <details>
                  <summary>
                    <strong>Schema risposta richiesta</strong>
                  </summary>
                  <pre
                    style={{
                      maxHeight: 240,
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      fontSize: 12,
                      background: "var(--pf-surface-muted, #f5f5f5)",
                      padding: 8,
                      borderRadius: 4,
                    }}
                  >
                    {JSON.stringify(prompt.responseJsonSchema, null, 2)}
                  </pre>
                </details>
              )}
            </section>
          );
        })()}

        <section className="pf-card">
          <h3>Output originale</h3>
          <pre
            style={{
              maxHeight: 240,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              fontSize: 12,
            }}
          >
            {JSON.stringify(audit.outputJson, null, 2)}
          </pre>
        </section>

        <section className="pf-card">
          <h3>Esegui replay con prompt diversi</h3>
          <p className="pf-meta">
            Modifica i prompt qui sotto e lancia il replay. Lasciali invariati
            per rifare la stessa chiamata.
          </p>
          <label className="pf-field">
            Initial context (system prompt)
            <textarea
              className="pf-input"
              rows={8}
              value={initialContext}
              onChange={(e) => setInitialContext(e.target.value)}
            />
          </label>
          <label className="pf-field">
            Response format prompt
            <textarea
              className="pf-input"
              rows={6}
              value={responseFormatPrompt}
              onChange={(e) => setResponseFormatPrompt(e.target.value)}
            />
          </label>
          {error && <div className="pf-alert warning">{error}</div>}
          <button
            type="button"
            className="pf-button"
            disabled={running}
            onClick={startReplay}
          >
            {running ? "In corso…" : "Lancia replay"}
          </button>
        </section>

        <section className="pf-card">
          <h3>Salva come Golden Context</h3>
          <p className="pf-meta">
            Memorizza il contesto di questo audit per riusarlo nelle valutazioni
            sistematiche.
          </p>
          <div className="pf-row" style={{ gap: 12 }}>
            <input
              className="pf-input"
              placeholder="Etichetta del golden (es. Atleta-amatoriale-corsa)"
              value={goldenLabel}
              onChange={(e) => setGoldenLabel(e.target.value)}
            />
            <button
              type="button"
              className="pf-button-secondary"
              onClick={saveAsGolden}
              disabled={!goldenLabel.trim()}
            >
              Salva
            </button>
          </div>
        </section>
      </div>
    </ProductShell>
  );
}
