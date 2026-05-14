"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type AiSummary = { id: string; summaryText: string; createdAt: string };
type UserRef = { id: string; email: string };
type PlanItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  area?: { id: string; name: string };
  planRelease: {
    id: string;
    version: number;
    user: UserRef;
    aiContextSummaries: AiSummary[];
  };
};
type QuestionApproval = {
  id: string;
  status: string;
  areaId: string;
  questionSetId: string;
  area?: { id: string; name: string };
  questionSet: {
    id: string;
    user: UserRef;
    planRelease?: {
      id: string;
      version: number;
      aiContextSummaries: AiSummary[];
    };
    questions: Array<{
      id: string;
      text: string;
      orderIndex: number;
      options: Array<{ id: string; label: string; score: number }>;
    }>;
  };
};
type TrainingPlanItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  trainingPlanRelease: {
    id: string;
    version: number;
    user: UserRef;
    specialization: {
      id: string;
      label: string;
      sport: { label: string };
    };
  };
};
type TrainingQuestionApproval = {
  id: string;
  status: string;
  trainingQuestionSetId: string;
  questionSet: {
    id: string;
    user: UserRef;
    specialization: {
      id: string;
      label: string;
      sport: { label: string };
    };
    trainingPlanRelease: {
      id: string;
      version: number;
      summaryText: string;
    };
    questions: Array<{
      id: string;
      text: string;
      orderIndex: number;
      options: Array<{ id: string; label: string; score: number }>;
    }>;
  };
};
type InboxResponse = {
  planItems: PlanItem[];
  questionApprovals: QuestionApproval[];
  trainingPlanItems: TrainingPlanItem[];
  trainingQuestionApprovals: TrainingQuestionApproval[];
};

const readError = async (response: Response) => {
  try {
    const data = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };
    return Array.isArray(data.message)
      ? data.message.join(", ")
      : (data.message ?? data.error ?? `HTTP ${response.status}`);
  } catch {
    return `HTTP ${response.status}`;
  }
};

const formatDate = (value?: string) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "-"
    : parsed.toLocaleDateString("it-IT", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
};

export default function ProfessionalApprovazioniPage() {
  const [inbox, setInbox] = useState<InboxResponse>({
    planItems: [],
    questionApprovals: [],
    trainingPlanItems: [],
    trainingQuestionApprovals: [],
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>(
    {},
  );
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        user: UserRef;
        questions: QuestionApproval[];
        plans: PlanItem[];
        trainingQuestions: TrainingQuestionApproval[];
        trainingPlans: TrainingPlanItem[];
      }
    >();
    for (const approval of inbox.questionApprovals) {
      const user = approval.questionSet.user;
      const entry = map.get(user.id) ?? {
        user,
        questions: [],
        plans: [],
        trainingQuestions: [],
        trainingPlans: [],
      };
      entry.questions.push(approval);
      map.set(user.id, entry);
    }
    for (const item of inbox.planItems) {
      const user = item.planRelease.user;
      const entry = map.get(user.id) ?? {
        user,
        questions: [],
        plans: [],
        trainingQuestions: [],
        trainingPlans: [],
      };
      entry.plans.push(item);
      map.set(user.id, entry);
    }
    for (const approval of inbox.trainingQuestionApprovals ?? []) {
      const user = approval.questionSet.user;
      const entry = map.get(user.id) ?? {
        user,
        questions: [],
        plans: [],
        trainingQuestions: [],
        trainingPlans: [],
      };
      entry.trainingQuestions.push(approval);
      map.set(user.id, entry);
    }
    for (const item of inbox.trainingPlanItems ?? []) {
      const user = item.trainingPlanRelease.user;
      const entry = map.get(user.id) ?? {
        user,
        questions: [],
        plans: [],
        trainingQuestions: [],
        trainingPlans: [],
      };
      entry.trainingPlans.push(item);
      map.set(user.id, entry);
    }
    return Array.from(map.values()).sort(
      (a, b) => {
        const totalA =
          a.questions.length +
          a.plans.length +
          a.trainingQuestions.length +
          a.trainingPlans.length;
        const totalB =
          b.questions.length +
          b.plans.length +
          b.trainingQuestions.length +
          b.trainingPlans.length;
        return totalB - totalA;
      },
    );
  }, [inbox]);

  const totalPending =
    inbox.questionApprovals.length +
    inbox.planItems.length +
    (inbox.trainingQuestionApprovals?.length ?? 0) +
    (inbox.trainingPlanItems?.length ?? 0);

  const loadInbox = async () => {
    setLoading(true);
    setAuthHint(null);
    setMessage(null);

    const response = await secureFetch(`${API_BASE}/professional/approvals`, {
      credentials: "include",
    });
    if (!response.ok) {
      if (response.status === 401) {
        setAuthHint("Accedi con un account professionista.");
      } else if (response.status === 403) {
        setAuthHint("Questo ambiente e riservato ai professionisti.");
      } else {
        setMessage(`Impossibile caricare le approvazioni: ${await readError(response)}`);
      }
      setLoading(false);
      return;
    }

    setInbox((await response.json()) as InboxResponse);
    setLoading(false);
  };

  useEffect(() => {
    void loadInbox();
  }, []);

  const setBusy = (id: string, value: boolean) => {
    setBusyIds((prev) => ({ ...prev, [id]: value }));
  };

  const approveQuestionSet = async (
    questionSetId: string,
    approvalId: string,
  ) => {
    setMessage(null);
    setBusy(approvalId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/questionsets/${questionSetId}/approve`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId }),
      },
    );
    if (!response.ok) {
      setMessage(`Approvazione questionario non riuscita: ${await readError(response)}`);
      setBusy(approvalId, false);
      return;
    }
    setMessage("Questionario approvato. Se tutte le revisioni sono completate, il ciclo viene pubblicato automaticamente.");
    await loadInbox();
    setBusy(approvalId, false);
  };

  const rejectQuestionSet = async (
    questionSetId: string,
    approvalId: string,
  ) => {
    const reason = rejectReasons[approvalId]?.trim();
    if (!reason) {
      setMessage("Il motivo del rifiuto e obbligatorio.");
      return;
    }
    setBusy(approvalId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/questionsets/${questionSetId}/reject`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: reason, approvalId }),
      },
    );
    if (!response.ok) {
      setMessage(`Rifiuto questionario non riuscito: ${await readError(response)}`);
      setBusy(approvalId, false);
      return;
    }
    await loadInbox();
    setBusy(approvalId, false);
  };

  const approvePlanItem = async (planItemId: string) => {
    setBusy(planItemId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/plan-items/${planItemId}/approve`,
      {
        method: "POST",
        credentials: "include",
      },
    );
    if (!response.ok) {
      setMessage(`Approvazione attivita allenamento non riuscita: ${await readError(response)}`);
      setBusy(planItemId, false);
      return;
    }
    setMessage("Attivita approvata. Se tutte le revisioni sono completate, il ciclo viene pubblicato automaticamente.");
    await loadInbox();
    setBusy(planItemId, false);
  };

  const rejectPlanItem = async (planItemId: string) => {
    const reason = rejectReasons[planItemId]?.trim();
    if (!reason) {
      setMessage("Il motivo del rifiuto e obbligatorio.");
      return;
    }
    setBusy(planItemId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/plan-items/${planItemId}/reject`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: reason }),
      },
    );
    if (!response.ok) {
      setMessage(`Rifiuto attivita allenamento non riuscito: ${await readError(response)}`);
      setBusy(planItemId, false);
      return;
    }
    await loadInbox();
    setBusy(planItemId, false);
  };

  const approveTrainingQuestionSet = async (
    questionSetId: string,
    approvalId: string,
  ) => {
    setBusy(approvalId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/training-questionsets/${questionSetId}/approve`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId }),
      },
    );
    if (!response.ok) {
      setMessage(`Approvazione questionario allenamento non riuscita: ${await readError(response)}`);
      setBusy(approvalId, false);
      return;
    }
    setMessage("Questionario allenamento approvato. Se tutte le revisioni sono completate, l'allenamento viene pubblicato automaticamente.");
    await loadInbox();
    setBusy(approvalId, false);
  };

  const rejectTrainingQuestionSet = async (
    questionSetId: string,
    approvalId: string,
  ) => {
    const reason = rejectReasons[approvalId]?.trim();
    if (!reason) {
      setMessage("Il motivo del rifiuto e obbligatorio.");
      return;
    }
    setBusy(approvalId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/training-questionsets/${questionSetId}/reject`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: reason, approvalId }),
      },
    );
    if (!response.ok) {
      setMessage(`Rifiuto questionario allenamento non riuscito: ${await readError(response)}`);
      setBusy(approvalId, false);
      return;
    }
    await loadInbox();
    setBusy(approvalId, false);
  };

  const approveTrainingPlanItem = async (planItemId: string) => {
    setBusy(planItemId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/training-plan-items/${planItemId}/approve`,
      { method: "POST", credentials: "include" },
    );
    if (!response.ok) {
      setMessage(`Approvazione esercizio allenamento non riuscita: ${await readError(response)}`);
      setBusy(planItemId, false);
      return;
    }
    setMessage("Esercizio allenamento approvato. Se tutte le revisioni sono completate, l'allenamento viene pubblicato automaticamente.");
    await loadInbox();
    setBusy(planItemId, false);
  };

  const rejectTrainingPlanItem = async (planItemId: string) => {
    const reason = rejectReasons[planItemId]?.trim();
    if (!reason) {
      setMessage("Il motivo del rifiuto e obbligatorio.");
      return;
    }
    setBusy(planItemId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/training-plan-items/${planItemId}/reject`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: reason }),
      },
    );
    if (!response.ok) {
      setMessage(`Rifiuto esercizio allenamento non riuscito: ${await readError(response)}`);
      setBusy(planItemId, false);
      return;
    }
    await loadInbox();
    setBusy(planItemId, false);
  };

  return (
    <ProductShell
      eyebrow="Ambiente professionista"
      title="Revisione atleti"
      description="Rivedi in un unico punto ogni atleta con questionari e attivita pendenti, poi approva o rifiuta senza cercare in liste separate."
      actions={
        <div className="pf-header-actions">
          <Link className="pf-button-secondary" href="/professional">
            Riepilogo atleti
          </Link>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadInbox()}
          >
            Aggiorna
          </button>
        </div>
      }
      stats={[
        {
          label: "Atleti con lavoro",
          value: loading ? "..." : groups.length,
          tone: "accent",
        },
        {
          label: "Questionari",
          value: loading ? "..." : inbox.questionApprovals.length,
          tone: "warning",
        },
        {
          label: "Attivita allenamento",
          value: loading
            ? "..."
            : inbox.planItems.length + (inbox.trainingPlanItems?.length ?? 0),
          tone: "success",
        },
      ]}
    >
      {authHint && <div className="pf-alert warning">{authHint}</div>}
      {message && <div className="pf-alert">{message}</div>}

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Approvazioni per atleta</h2>
            <p className="pf-muted">
              Ogni blocco mostra esattamente cosa blocca la pubblicazione dell'amministratore.
            </p>
          </div>
          <StatusBadge tone={totalPending ? "warning" : "success"}>
            {totalPending} in attesa
          </StatusBadge>
        </div>

        <div className="pf-stack">
          {groups.map((group) => (
            <article key={group.user.id} className="pf-card pf-review-card">
              <div className="pf-card-top">
                <div>
                  <h3>{group.user.email}</h3>
                  <p className="pf-muted">
                    {group.questions.length} questionari -{" "}
                    {group.plans.length} attivita area -{" "}
                    {group.trainingQuestions.length + group.trainingPlans.length}{" "}
                    revisioni allenatore
                  </p>
                </div>
                <div className="pf-actions">
                  <Link
                    className="pf-button-secondary"
                    href={`/professional/users/${group.user.id}/performance`}
                  >
                    Profilo
                  </Link>
                </div>
              </div>

              {group.questions.map((approval) => {
                const summary =
                  approval.questionSet.planRelease?.aiContextSummaries?.[0];
                return (
                  <div key={approval.id} className="pf-review-section">
                    <div className="pf-card-top">
                      <div>
                        <h4>{approval.area?.name ?? "Area"} questionario</h4>
                        <p className="pf-muted">
                          Ciclo v
                          {approval.questionSet.planRelease?.version ?? "-"} -{" "}
                          {summary
                            ? formatDate(summary.createdAt)
                            : "Proposta AI"}
                        </p>
                      </div>
                      <StatusBadge tone="warning">In attesa</StatusBadge>
                    </div>
                    {summary && (
                      <p className="pf-muted">
                        Sintesi AI: {summary.summaryText}
                      </p>
                    )}
                    <div className="pf-stack compact">
                      {approval.questionSet.questions.map((question) => (
                        <div key={question.id} className="pf-question-preview">
                          <strong>
                            {question.orderIndex}. {question.text}
                          </strong>
                          <span>
                            {question.options
                              .map((option) => option.label)
                              .join(" - ")}
                          </span>
                        </div>
                      ))}
                    </div>
                    <label className="pf-field">
                      Motivo del rifiuto
                      <input
                        className="pf-input"
                        value={rejectReasons[approval.id] ?? ""}
                        onChange={(event) =>
                          setRejectReasons((prev) => ({
                            ...prev,
                            [approval.id]: event.target.value,
                          }))
                        }
                        placeholder="Obbligatorio solo in caso di rifiuto"
                      />
                    </label>
                    <div className="pf-actions">
                      <button
                        className="pf-button-danger"
                        type="button"
                        disabled={busyIds[approval.id]}
                        onClick={() =>
                          rejectQuestionSet(approval.questionSetId, approval.id)
                        }
                      >
                        Rifiuta questionario
                      </button>
                      <button
                        className="pf-button"
                        type="button"
                        disabled={busyIds[approval.id]}
                        onClick={() =>
                          approveQuestionSet(
                            approval.questionSetId,
                            approval.id,
                          )
                        }
                      >
                        Approva questionario
                      </button>
                    </div>
                  </div>
                );
              })}

              {group.plans.map((item) => {
                const summary = item.planRelease.aiContextSummaries?.[0];
                return (
                  <div key={item.id} className="pf-review-section">
                    <div className="pf-card-top">
                      <div>
                        <h4>{item.title}</h4>
                        <p className="pf-muted">
                          {item.area?.name ?? "Area"} - Ciclo v
                          {item.planRelease.version}
                        </p>
                      </div>
                      <StatusBadge tone="warning">Proposto</StatusBadge>
                    </div>
                    <p>{item.body}</p>
                    {summary && (
                      <p className="pf-muted">
                        Sintesi AI: {summary.summaryText}
                      </p>
                    )}
                    <label className="pf-field">
                      Motivo del rifiuto
                      <input
                        className="pf-input"
                        value={rejectReasons[item.id] ?? ""}
                        onChange={(event) =>
                          setRejectReasons((prev) => ({
                            ...prev,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="Obbligatorio solo in caso di rifiuto"
                      />
                    </label>
                    <div className="pf-actions">
                      <button
                        className="pf-button-danger"
                        type="button"
                        disabled={busyIds[item.id]}
                        onClick={() => rejectPlanItem(item.id)}
                      >
                        Rifiuta attivita
                      </button>
                      <button
                        className="pf-button"
                        type="button"
                        disabled={busyIds[item.id]}
                        onClick={() => approvePlanItem(item.id)}
                      >
                        Approva attivita
                      </button>
                    </div>
                  </div>
                );
              })}

              {group.trainingQuestions.map((approval) => (
                <div key={approval.id} className="pf-review-section">
                  <div className="pf-card-top">
                    <div>
                      <h4>Questionario allenamento</h4>
                      <p className="pf-muted">
                        {approval.questionSet.specialization.sport.label} -{" "}
                        {approval.questionSet.specialization.label} - v
                        {approval.questionSet.trainingPlanRelease.version}
                      </p>
                    </div>
                    <StatusBadge tone="warning">In attesa</StatusBadge>
                  </div>
                  <p className="pf-muted">
                    Sintesi AI: {approval.questionSet.trainingPlanRelease.summaryText}
                  </p>
                  <div className="pf-stack compact">
                    {approval.questionSet.questions.map((question) => (
                      <div key={question.id} className="pf-question-preview">
                        <strong>
                          {question.orderIndex}. {question.text}
                        </strong>
                        <span>
                          {question.options
                            .map((option) => option.label)
                            .join(" - ")}
                        </span>
                      </div>
                    ))}
                  </div>
                  <label className="pf-field">
                    Motivo del rifiuto
                    <input
                      className="pf-input"
                      value={rejectReasons[approval.id] ?? ""}
                      onChange={(event) =>
                        setRejectReasons((prev) => ({
                          ...prev,
                          [approval.id]: event.target.value,
                        }))
                      }
                      placeholder="Obbligatorio solo in caso di rifiuto"
                    />
                  </label>
                  <div className="pf-actions">
                    <button
                      className="pf-button-danger"
                      type="button"
                      disabled={busyIds[approval.id]}
                      onClick={() =>
                        rejectTrainingQuestionSet(
                          approval.trainingQuestionSetId,
                          approval.id,
                        )
                      }
                    >
                      Rifiuta questionario
                    </button>
                    <button
                      className="pf-button"
                      type="button"
                      disabled={busyIds[approval.id]}
                      onClick={() =>
                        approveTrainingQuestionSet(
                          approval.trainingQuestionSetId,
                          approval.id,
                        )
                      }
                    >
                      Approva questionario
                    </button>
                  </div>
                </div>
              ))}

              {group.trainingPlans.map((item) => (
                <div key={item.id} className="pf-review-section">
                  <div className="pf-card-top">
                    <div>
                      <h4>{item.title}</h4>
                      <p className="pf-muted">
                        {item.trainingPlanRelease.specialization.sport.label} -{" "}
                        {item.trainingPlanRelease.specialization.label} - v
                        {item.trainingPlanRelease.version}
                      </p>
                    </div>
                    <StatusBadge tone="warning">Proposto</StatusBadge>
                  </div>
                  <p>{item.body}</p>
                  <label className="pf-field">
                    Motivo del rifiuto
                    <input
                      className="pf-input"
                      value={rejectReasons[item.id] ?? ""}
                      onChange={(event) =>
                        setRejectReasons((prev) => ({
                          ...prev,
                          [item.id]: event.target.value,
                        }))
                      }
                      placeholder="Obbligatorio solo in caso di rifiuto"
                    />
                  </label>
                  <div className="pf-actions">
                    <button
                      className="pf-button-danger"
                      type="button"
                      disabled={busyIds[item.id]}
                      onClick={() => rejectTrainingPlanItem(item.id)}
                    >
                      Rifiuta esercizio
                    </button>
                    <button
                      className="pf-button"
                      type="button"
                      disabled={busyIds[item.id]}
                      onClick={() => approveTrainingPlanItem(item.id)}
                    >
                      Approva esercizio
                    </button>
                  </div>
                </div>
              ))}
            </article>
          ))}

          {!loading && groups.length === 0 && (
            <EmptyState
              title="Nessuna approvazione"
              description="Nessun atleta collegato ha questionari o attivita in attesa di revisione."
            />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
