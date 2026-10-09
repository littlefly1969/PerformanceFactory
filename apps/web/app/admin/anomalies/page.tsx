"use client";

import { useCallback, useEffect, useState } from "react";
import { ProductShell } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Status = "OPEN" | "REVIEWED" | "ARCHIVED";
type Anomaly = {
  id: string;
  athlete: { email: string; name: string };
  evaluation: { sequence: number; source: string };
  kind: "CONTRADICTIONS" | "AUTOMATED_PATTERN" | "MICRO_TEST_MISMATCH";
  priority: "LOW" | "HIGH";
  evidence: string;
  status: Status;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

const URL = `${API_BASE}/admin/assessment-anomalies`;

const KIND: Record<Anomaly["kind"], string> = {
  CONTRADICTIONS: "Risposte contraddittorie",
  AUTOMATED_PATTERN: "Compilazione automatica o opportunistica",
  MICRO_TEST_MISMATCH: "Esiti dei micro-test incompatibili",
};
const STATUS: Record<Status, string> = {
  OPEN: "Aperta",
  REVIEWED: "Esaminata",
  ARCHIVED: "Archiviata",
};

const date = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Segnalazioni interne sull'assessment (PF-FS-PREPAYWALL §5.3, OP-08): solo
 * admin, mai mostrate all'atleta. Non sono una prova di condotta: una HIGH
 * aperta sospende solo l'eleggibilità alla lezione gratuita.
 */
export default function AdminAnomaliesPage() {
  const [items, setItems] = useState<Anomaly[]>();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await secureFetch(URL, { credentials: "include" });
    if (response.ok) setItems((await response.json()) as Anomaly[]);
    else setMessage("Segnalazioni non disponibili.");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (id: string, status: Status) => {
    setBusy(true);
    setMessage(null);
    const response = await secureFetch(`${URL}/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note: notes[id] || undefined }),
    });
    setBusy(false);
    if (!response.ok) {
      setMessage("Revisione non salvata.");
      return;
    }
    await load();
  };

  const open = items?.filter((a) => a.status === "OPEN").length ?? 0;
  return (
    <ProductShell
      eyebrow="Amministrazione percorso"
      title="Segnalazioni dell'assessment"
      description="Segnalazioni interne scritte dall'AI con le evidenze osservabili. Restano riservate: l'atleta continua il percorso con domande normali. Una segnalazione non è una prova e non esclude nessuno; una HIGH aperta sospende solo la lezione gratuita finché non la esamini."
      stats={[{ label: "Da esaminare", value: open, tone: "accent" }]}
    >
      {message && <div className="pf-alert warning">{message}</div>}
      {items && items.length === 0 && (
        <p className="pf-muted">Nessuna segnalazione.</p>
      )}
      <div className="pf-stack">
        {items?.map((a) => (
          <article className="pf-card" key={a.id} aria-label={a.athlete.email}>
            <p className="pf-muted">
              {STATUS[a.status]} · priorità{" "}
              {a.priority === "HIGH" ? "alta" : "bassa"} · {date(a.createdAt)} ·
              valutazione {a.evaluation.sequence}
            </p>
            <h3>{KIND[a.kind]}</h3>
            <p>
              {a.athlete.name || a.athlete.email}
              {a.athlete.name ? ` · ${a.athlete.email}` : ""}
            </p>
            <p>{a.evidence}</p>
            {a.reviewedBy && a.reviewedAt && (
              <p className="pf-muted">
                {STATUS[a.status]} da {a.reviewedBy} il {date(a.reviewedAt)}
                {a.reviewNote ? `: ${a.reviewNote}` : ""}
              </p>
            )}
            <label className="pf-field">
              <span>Nota di revisione</span>
              <input
                value={notes[a.id] ?? ""}
                maxLength={500}
                onChange={(event) =>
                  setNotes({ ...notes, [a.id]: event.target.value })
                }
              />
            </label>
            <div className="pf-actions">
              {a.status !== "REVIEWED" && (
                <button
                  className="pf-button"
                  disabled={busy}
                  onClick={() => void review(a.id, "REVIEWED")}
                >
                  Segna come esaminata
                </button>
              )}
              {a.status !== "ARCHIVED" && (
                <button
                  className="pf-button-secondary"
                  disabled={busy}
                  onClick={() => void review(a.id, "ARCHIVED")}
                >
                  Archivia
                </button>
              )}
              {a.status !== "OPEN" && (
                <button
                  className="pf-button-secondary"
                  disabled={busy}
                  onClick={() => void review(a.id, "OPEN")}
                >
                  Riapri
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </ProductShell>
  );
}
