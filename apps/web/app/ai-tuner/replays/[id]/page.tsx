"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ProductShell } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Detail = {
  id: string;
  sourceAudit: {
    id: string;
    athleteLabel: string;
    provider: string;
    model: string;
    outputJson: unknown;
    inputJson: unknown;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    area: { id: string; name: string } | null;
  };
  replay: {
    provider: string;
    model: string;
    status: string;
    input: unknown;
    output: unknown;
    errorMessage: string | null;
    durationMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    correlationId: string | null;
    initialContextOverride: string | null;
    responseFormatOverride: string | null;
  };
  feedback: {
    chosenSide: string;
    relevanceArea: number | null;
    planConcreteness: number | null;
    questionRelevance: number | null;
    tone: number | null;
    overall: number | null;
    notes: string | null;
  } | null;
};

const RUBRIC_FIELDS: Array<{
  key: "relevanceArea" | "planConcreteness" | "questionRelevance" | "tone" | "overall";
  label: string;
  help: string;
}> = [
  {
    key: "relevanceArea",
    label: "Rilevanza per l'area",
    help: "Il piano e le domande sono coerenti con l'area target?",
  },
  {
    key: "planConcreteness",
    label: "Concretezza del piano",
    help: "Le attività sono azionabili, misurabili, progressive?",
  },
  {
    key: "questionRelevance",
    label: "Rilevanza domande",
    help: "Le domande misurano davvero il lavoro proposto?",
  },
  {
    key: "tone",
    label: "Tono e linguaggio",
    help: "Adeguato, motivazionale, non clinico?",
  },
  {
    key: "overall",
    label: "Giudizio globale",
    help: "Tutto considerato, quanto è buono questo output?",
  },
];

export default function ReplayDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<Detail | null>(null);
  const [chosenSide, setChosenSide] = useState<"ORIGINAL" | "REPLAY" | "TIE" | "">("");
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    secureFetch(`${API_BASE}/ai-tuning/replays/${id}`).then(async (res) => {
      if (!res.ok) return;
      const d = (await res.json()) as Detail;
      setData(d);
      if (d.feedback) {
        setChosenSide(
          d.feedback.chosenSide as "ORIGINAL" | "REPLAY" | "TIE",
        );
        setScores({
          relevanceArea: d.feedback.relevanceArea,
          planConcreteness: d.feedback.planConcreteness,
          questionRelevance: d.feedback.questionRelevance,
          tone: d.feedback.tone,
          overall: d.feedback.overall,
        });
        setNotes(d.feedback.notes ?? "");
      }
    });
  }, [id]);

  if (!data) {
    return (
      <ProductShell eyebrow="MONITORAGGIO AI" title="Dettaglio test">
        <p>Caricamento…</p>
      </ProductShell>
    );
  }

  const saveFeedback = async () => {
    if (!chosenSide) return;
    setSaving(true);
    const body = {
      chosenSide,
      ...scores,
      notes: notes || undefined,
    };
    const res = await secureFetch(
      `${API_BASE}/ai-tuning/replays/${data.id}/feedback`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    setSaving(false);
    if (res.ok) {
      setSavedAt(new Date().toLocaleTimeString("it-IT"));
    } else {
      alert("Errore salvataggio");
    }
  };

  return (
    <ProductShell
      eyebrow="MONITORAGGIO AI"
      title={`Test ${data.sourceAudit.athleteLabel}`}
      description={`Area ${data.sourceAudit.area?.name ?? "—"}`}
    >
      <div className="pf-stack" style={{ gap: 18 }}>
        {(() => {
          const extractPrompt = (raw: unknown) => {
            const root = (raw ?? null) as
              | {
                  prompt?: {
                    system?: unknown;
                    user?: unknown;
                    responseJsonSchema?: unknown;
                  };
                }
              | null;
            const p = root?.prompt;
            const sys =
              typeof p?.system === "string"
                ? p.system
                : JSON.stringify(p?.system ?? null, null, 2);
            const usr =
              typeof p?.user === "string"
                ? p.user
                : JSON.stringify(p?.user ?? null, null, 2);
            return { sys, usr, hasPrompt: Boolean(p) };
          };
          const orig = extractPrompt(data.sourceAudit.inputJson);
          const repl = extractPrompt(data.replay.input);
          const blockStyle = {
            maxHeight: 280,
            overflow: "auto",
            whiteSpace: "pre-wrap" as const,
            fontSize: 12,
            background: "var(--pf-surface-muted, #f5f5f5)",
            padding: 8,
            borderRadius: 4,
          };
          return (
            <section className="pf-card">
              <h3>Prompt usati</h3>
              <div className="pf-grid pf-grid-2" style={{ gap: 16 }}>
                <div>
                  <strong>ORIGINALE</strong>
                  {orig.hasPrompt ? (
                    <>
                      <details open>
                        <summary>System</summary>
                        <pre style={blockStyle}>{orig.sys}</pre>
                      </details>
                      <details>
                        <summary>User (task + contesto atleta)</summary>
                        <pre style={blockStyle}>{orig.usr}</pre>
                      </details>
                    </>
                  ) : (
                    <p className="pf-meta">Prompt originale non disponibile.</p>
                  )}
                </div>
                <div>
                  <strong>NUOVO TEST</strong>
                  {repl.hasPrompt ? (
                    <>
                      <details open>
                        <summary>System</summary>
                        <pre style={blockStyle}>{repl.sys}</pre>
                      </details>
                      <details>
                        <summary>User (task + contesto atleta)</summary>
                        <pre style={blockStyle}>{repl.usr}</pre>
                      </details>
                    </>
                  ) : (
                    <p className="pf-meta">
                      Test precedente: prompt non era ancora salvato.
                    </p>
                  )}
                </div>
              </div>
              <details style={{ marginTop: 12 }}>
                <summary>
                  <strong>Solo modifiche applicate</strong>
                </summary>
                <div className="pf-stack" style={{ gap: 8, marginTop: 8 }}>
                  <div>
                    <strong>Initial context override</strong>
                    {data.replay.initialContextOverride ? (
                      <pre style={blockStyle}>
                        {data.replay.initialContextOverride}
                      </pre>
                    ) : (
                      <p className="pf-meta">
                        nessuno (usato il valore corrente dell&apos;area)
                      </p>
                    )}
                  </div>
                  <div>
                    <strong>Response format override</strong>
                    {data.replay.responseFormatOverride ? (
                      <pre style={blockStyle}>
                        {data.replay.responseFormatOverride}
                      </pre>
                    ) : (
                      <p className="pf-meta">
                        nessuno (usato il valore corrente dell&apos;area)
                      </p>
                    )}
                  </div>
                </div>
              </details>
            </section>
          );
        })()}

        <div className="pf-grid pf-grid-2" style={{ gap: 16 }}>
          <section className="pf-card">
            <h3>Output ORIGINALE</h3>
            <p className="pf-meta">
              {data.sourceAudit.provider} · {data.sourceAudit.model} · token{" "}
              {data.sourceAudit.totalTokens ?? "—"}
            </p>
            <pre
              style={{
                maxHeight: 400,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                fontSize: 12,
              }}
            >
              {JSON.stringify(data.sourceAudit.outputJson, null, 2)}
            </pre>
          </section>
          <section className="pf-card">
            <h3>Output NUOVO TEST</h3>
            <p className="pf-meta">
              {data.replay.provider} · {data.replay.model} · token{" "}
              {data.replay.totalTokens ?? "—"} · {data.replay.durationMs ?? "—"} ms
            </p>
            {data.replay.status === "FAILED" ? (
              <div className="pf-alert warning">
                {data.replay.errorMessage}
              </div>
            ) : (
              <pre
                style={{
                  maxHeight: 400,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(data.replay.output, null, 2)}
              </pre>
            )}
          </section>
        </div>

        <section className="pf-card">
          <h3>Valutazione risultato</h3>
          <p className="pf-meta">
            Quale dei due output è migliore? Vota le dimensioni che ti
            interessano.
          </p>
          <div className="pf-form-actions">
            {(["ORIGINAL", "REPLAY", "TIE"] as const).map((side) => (
              <button
                key={side}
                type="button"
                className={
                  chosenSide === side ? "pf-button" : "pf-button-secondary"
                }
                onClick={() => setChosenSide(side)}
              >
                {side === "ORIGINAL"
                  ? "Originale"
                  : side === "REPLAY"
                    ? "Nuovo test"
                    : "Pari"}
              </button>
            ))}
          </div>
          <div className="pf-stack" style={{ gap: 12, marginTop: 16 }}>
            {RUBRIC_FIELDS.map((field) => (
              <div key={field.key}>
                <div className="pf-row" style={{ alignItems: "baseline" }}>
                  <strong>{field.label}</strong>
                  <span className="pf-meta">· {field.help}</span>
                </div>
                <div className="pf-row" style={{ gap: 8 }}>
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      className={
                        scores[field.key] === score
                          ? "pf-button"
                          : "pf-button-secondary"
                      }
                      onClick={() =>
                        setScores((prev) => ({ ...prev, [field.key]: score }))
                      }
                    >
                      {score}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="pf-button-secondary"
                    onClick={() =>
                      setScores((prev) => ({ ...prev, [field.key]: null }))
                    }
                  >
                    n/d
                  </button>
                </div>
              </div>
            ))}
            <label className="pf-field">
              Note libere
              <textarea
                className="pf-input"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>
          <div className="pf-form-actions">
            <button
              type="button"
              className="pf-button"
              disabled={!chosenSide || saving}
              onClick={saveFeedback}
            >
              {saving ? "Salvataggio…" : "Salva valutazione"}
            </button>
            {savedAt && <span className="pf-meta">Salvato alle {savedAt}</span>}
          </div>
        </section>
      </div>
    </ProductShell>
  );
}
