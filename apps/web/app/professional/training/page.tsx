"use client";
import { useState } from "react";
import { ProductShell } from "../../components/product-shell";
import { athleteRequest, useAthlete } from "../../user/_components/use-athlete";
type Plan = {
  id: string;
  version: number;
  status: string;
  cycleStatus: string;
  approvalMode: string;
  summaryText: string;
  user: { firstName?: string; lastName?: string; email: string };
  items: {
    id: string;
    title: string;
    body: string;
    status: string;
    completionNotes?: string;
    completionRating?: number;
  }[];
};
export default function CoachTraining() {
  const { data, error, reload } = useAthlete<Plan[]>(
    "/training/lifecycle/coach/plans",
  );
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  async function approve(id: string) {
    if (busy) return;
    setBusy(id);
    setMessage("");
    try {
      await athleteRequest(`/training/lifecycle/releases/${id}/approve`, {});
      reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <ProductShell
      title="Allenamenti degli atleti"
      description="Consulta i piani, i completamenti e il feedback dei tuoi atleti."
    >
      {(error || message) && <p role="alert">{error || message}</p>}
      {!data && !error && <p>Caricamento…</p>}
      {data?.length === 0 && (
        <p>Nessun piano disponibile per gli atleti assegnati.</p>
      )}
      <div className="pf-stack">
        {data?.map((plan) => (
          <article key={plan.id} className="pf-card pf-stack">
            <h2>
              {[plan.user.firstName, plan.user.lastName]
                .filter(Boolean)
                .join(" ") || plan.user.email}{" "}
              · Ciclo {plan.version}
            </h2>
            <p>
              {plan.cycleStatus === "PUBLISHED"
                ? "Pubblicato"
                : plan.cycleStatus === "CLOSED"
                  ? "Chiuso"
                  : "In revisione"}{" "}
              · Approvazione{" "}
              {plan.approvalMode === "AUTO" ? "automatica" : "manuale"}
            </p>
            <p>{plan.summaryText}</p>
            {plan.items.map((item) => (
              <details key={item.id}>
                <summary>
                  {item.title} ·{" "}
                  {item.status === "COMPLETED"
                    ? "Completato"
                    : item.status === "SKIPPED"
                      ? "Saltato"
                      : "Da svolgere"}
                </summary>
                <p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p>
                {item.completionNotes && (
                  <p>Feedback: {item.completionNotes}</p>
                )}
                {item.completionRating && (
                  <p>Valutazione: {item.completionRating}/5</p>
                )}
              </details>
            ))}
            {plan.status === "PENDING_APPROVAL" &&
              plan.approvalMode === "MANUAL" && (
                <button
                  className="pf-button"
                  disabled={Boolean(busy)}
                  onClick={() => approve(plan.id)}
                >
                  {busy === plan.id
                    ? "Pubblicazione…"
                    : "Approva e pubblica il piano"}
                </button>
              )}
          </article>
        ))}
      </div>
    </ProductShell>
  );
}
