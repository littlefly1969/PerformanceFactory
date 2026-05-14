"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ProductShell } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Result = {
  id: string;
  goldenContextId: string;
  variantLabel: string;
  status: string;
  input: unknown;
  output: unknown;
  errorMessage: string | null;
  durationMs: number | null;
  totalTokens: number | null;
  relevanceArea: number | null;
  planConcreteness: number | null;
  questionRelevance: number | null;
  tone: number | null;
  overall: number | null;
  notes: string | null;
  goldenContext: { id: string; label: string; area: { name: string } };
};

type Run = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  goldenContextIds: string[];
  initialContextVariants: unknown;
  responseFormatVariants: unknown;
  results: Result[];
};

const RUBRIC_KEYS = [
  "relevanceArea",
  "planConcreteness",
  "questionRelevance",
  "tone",
  "overall",
] as const;

export default function EvaluationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [run, setRun] = useState<Run | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scores, setScores] = useState<
    Record<string, Partial<Record<(typeof RUBRIC_KEYS)[number], number | null>> & { notes?: string }>
  >({});

  const load = useCallback(async () => {
    if (!id) return;
    const res = await secureFetch(`${API_BASE}/ai-tuning/evaluations/${id}`);
    if (res.ok) {
      const data = (await res.json()) as Run;
      setRun(data);
    }
  }, [id]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => clearInterval(interval);
  }, [load]);

  if (!run) {
    return (
      <ProductShell eyebrow="AI TUNING" title="Run">
        <p>Caricamento…</p>
      </ProductShell>
    );
  }

  const variantLabels = Array.from(
    new Set(run.results.map((r) => r.variantLabel)),
  );
  const goldenLabels = Array.from(
    new Map(
      run.results.map((r) => [r.goldenContextId, r.goldenContext]),
    ).values(),
  );

  const saveScore = async (resultId: string) => {
    const body = {
      ...(scores[resultId] ?? {}),
    };
    const res = await secureFetch(
      `${API_BASE}/ai-tuning/evaluations/${run.id}/results/${resultId}/rate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) void load();
    else alert("Errore salvataggio rubric");
  };

  return (
    <ProductShell
      eyebrow="AI TUNING"
      title={`Run "${run.name}"`}
      description={`Status: ${run.status}${run.errorMessage ? ` · ${run.errorMessage}` : ""}`}
    >
      <div className="pf-stack" style={{ gap: 16 }}>
        <section className="pf-card">
          <h3>Matrice golden × variante</h3>
          <table className="pf-table">
            <thead>
              <tr>
                <th>Golden</th>
                {variantLabels.map((v) => (
                  <th key={v}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {goldenLabels.map((g) => (
                <tr key={g.id}>
                  <td>
                    <strong>{g.label}</strong>
                    <div className="pf-meta">{g.area.name}</div>
                  </td>
                  {variantLabels.map((v) => {
                    const res = run.results.find(
                      (r) =>
                        r.goldenContextId === g.id && r.variantLabel === v,
                    );
                    if (!res) return <td key={v}>—</td>;
                    return (
                      <td key={v}>
                        {res.status === "FAILED" ? (
                          <span className="pf-alert warning">FAILED</span>
                        ) : (
                          <>
                            <div>
                              {res.totalTokens != null
                                ? `${res.totalTokens} tok`
                                : "—"}
                              {" · "}
                              {res.durationMs != null
                                ? `${res.durationMs}ms`
                                : "—"}
                            </div>
                            <div>
                              {res.overall != null
                                ? `${res.overall}/5`
                                : "non valutato"}
                            </div>
                            <button
                              type="button"
                              className="pf-button-secondary"
                              onClick={() =>
                                setExpanded(expanded === res.id ? null : res.id)
                              }
                            >
                              {expanded === res.id ? "Nascondi" : "Apri"}
                            </button>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {expanded && (() => {
          const res = run.results.find((r) => r.id === expanded);
          if (!res) return null;
          const local = scores[res.id] ?? {
            relevanceArea: res.relevanceArea,
            planConcreteness: res.planConcreteness,
            questionRelevance: res.questionRelevance,
            tone: res.tone,
            overall: res.overall,
            notes: res.notes ?? "",
          };
          const setKey = (key: string, value: number | null | string) => {
            setScores((prev) => ({
              ...prev,
              [res.id]: { ...local, [key]: value },
            }));
          };
          return (
            <section className="pf-card">
              <h3>
                {res.goldenContext.label} · variante {res.variantLabel}
              </h3>
              {(() => {
                const root = (res.input ?? null) as
                  | {
                      prompt?: { system?: unknown; user?: unknown };
                    }
                  | null;
                const p = root?.prompt;
                if (!p) return null;
                const sys =
                  typeof p.system === "string"
                    ? p.system
                    : JSON.stringify(p.system ?? null, null, 2);
                const usr =
                  typeof p.user === "string"
                    ? p.user
                    : JSON.stringify(p.user ?? null, null, 2);
                return (
                  <>
                    <details>
                      <summary>
                        <strong>Prompt usato (system)</strong>
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
                        {sys}
                      </pre>
                    </details>
                    <details>
                      <summary>
                        <strong>Prompt usato (user / contesto)</strong>
                      </summary>
                      <pre
                        style={{
                          maxHeight: 320,
                          overflow: "auto",
                          whiteSpace: "pre-wrap",
                          fontSize: 12,
                          background: "var(--pf-surface-muted, #f5f5f5)",
                          padding: 8,
                          borderRadius: 4,
                        }}
                      >
                        {usr}
                      </pre>
                    </details>
                  </>
                );
              })()}
              <h4 style={{ marginTop: 12 }}>Output</h4>
              <pre
                style={{
                  maxHeight: 320,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(res.output, null, 2)}
              </pre>
              <div className="pf-stack" style={{ gap: 12 }}>
                {RUBRIC_KEYS.map((key) => (
                  <div key={key}>
                    <strong>{key}</strong>
                    <div className="pf-row" style={{ gap: 8 }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={
                            local[key] === s
                              ? "pf-button"
                              : "pf-button-secondary"
                          }
                          onClick={() => setKey(key, s)}
                        >
                          {s}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="pf-button-secondary"
                        onClick={() => setKey(key, null)}
                      >
                        n/d
                      </button>
                    </div>
                  </div>
                ))}
                <label className="pf-field">
                  Note
                  <textarea
                    className="pf-input"
                    rows={3}
                    value={local.notes ?? ""}
                    onChange={(e) => setKey("notes", e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="pf-button"
                  onClick={() => saveScore(res.id)}
                >
                  Salva valutazione
                </button>
              </div>
            </section>
          );
        })()}
      </div>
    </ProductShell>
  );
}
