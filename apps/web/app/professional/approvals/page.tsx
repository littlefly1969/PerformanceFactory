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
type InboxResponse = {
  planItems: PlanItem[];
  questionApprovals: QuestionApproval[];
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
    : parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
};

export default function ProfessionalApprovalsPage() {
  const [inbox, setInbox] = useState<InboxResponse>({
    planItems: [],
    questionApprovals: [],
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
      { user: UserRef; questions: QuestionApproval[]; plans: PlanItem[] }
    >();
    for (const approval of inbox.questionApprovals) {
      const user = approval.questionSet.user;
      const entry = map.get(user.id) ?? { user, questions: [], plans: [] };
      entry.questions.push(approval);
      map.set(user.id, entry);
    }
    for (const item of inbox.planItems) {
      const user = item.planRelease.user;
      const entry = map.get(user.id) ?? { user, questions: [], plans: [] };
      entry.plans.push(item);
      map.set(user.id, entry);
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        b.questions.length +
        b.plans.length -
        (a.questions.length + a.plans.length),
    );
  }, [inbox]);

  const totalPending = inbox.questionApprovals.length + inbox.planItems.length;

  const loadInbox = async () => {
    setLoading(true);
    setAuthHint(null);
    setMessage(null);

    const response = await secureFetch(`${API_BASE}/professional/approvals`, {
      credentials: "include",
    });
    if (!response.ok) {
      if (response.status === 401) {
        setAuthHint("Sign in with a professional account.");
      } else if (response.status === 403) {
        setAuthHint("This workspace is reserved for professionals.");
      } else {
        setMessage(`Unable to load approvals: ${await readError(response)}`);
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
      setMessage(`Question approval failed: ${await readError(response)}`);
      setBusy(approvalId, false);
      return;
    }
    await loadInbox();
    setBusy(approvalId, false);
  };

  const rejectQuestionSet = async (
    questionSetId: string,
    approvalId: string,
  ) => {
    const reason = rejectReasons[approvalId]?.trim();
    if (!reason) {
      setMessage("A rejection reason is required.");
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
      setMessage(`Question rejection failed: ${await readError(response)}`);
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
      setMessage(`Plan item approval failed: ${await readError(response)}`);
      setBusy(planItemId, false);
      return;
    }
    await loadInbox();
    setBusy(planItemId, false);
  };

  const rejectPlanItem = async (planItemId: string) => {
    const reason = rejectReasons[planItemId]?.trim();
    if (!reason) {
      setMessage("A rejection reason is required.");
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
      setMessage(`Plan item rejection failed: ${await readError(response)}`);
      setBusy(planItemId, false);
      return;
    }
    await loadInbox();
    setBusy(planItemId, false);
  };

  return (
    <ProductShell
      eyebrow="Professional workspace"
      title="Athlete review board"
      description="Review every athlete with pending questionnaires and plan items in one place, then approve or reject without hunting through separate lists."
      actions={
        <div className="pf-header-actions">
          <Link className="pf-button-secondary" href="/professional">
            Athlete summary
          </Link>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadInbox()}
          >
            Refresh
          </button>
        </div>
      }
      stats={[
        {
          label: "Athletes with work",
          value: loading ? "..." : groups.length,
          tone: "accent",
        },
        {
          label: "Questionnaires",
          value: loading ? "..." : inbox.questionApprovals.length,
          tone: "warning",
        },
        {
          label: "Plan items",
          value: loading ? "..." : inbox.planItems.length,
          tone: "success",
        },
      ]}
    >
      {authHint && <div className="pf-alert warning">{authHint}</div>}
      {message && <div className="pf-alert">{message}</div>}

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Approval work by athlete</h2>
            <p className="pf-muted">
              Each block shows exactly what is blocking admin publication.
            </p>
          </div>
          <StatusBadge tone={totalPending ? "warning" : "success"}>
            {totalPending} pending
          </StatusBadge>
        </div>

        <div className="pf-stack">
          {groups.map((group) => (
            <article key={group.user.id} className="pf-card pf-review-card">
              <div className="pf-card-top">
                <div>
                  <h3>{group.user.email}</h3>
                  <p className="pf-muted">
                    {group.questions.length} questionnaire ·{" "}
                    {group.plans.length} plan item
                  </p>
                </div>
                <div className="pf-actions">
                  <Link
                    className="pf-button-secondary"
                    href={`/professional/users/${group.user.id}/performance`}
                  >
                    Profile
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
                        <h4>{approval.area?.name ?? "Area"} questionnaire</h4>
                        <p className="pf-muted">
                          Cycle v
                          {approval.questionSet.planRelease?.version ?? "-"} ·{" "}
                          {summary
                            ? formatDate(summary.createdAt)
                            : "AI proposal"}
                        </p>
                      </div>
                      <StatusBadge tone="warning">Pending</StatusBadge>
                    </div>
                    {summary && (
                      <p className="pf-muted">
                        AI summary: {summary.summaryText}
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
                              .join(" · ")}
                          </span>
                        </div>
                      ))}
                    </div>
                    <label className="pf-field">
                      Rejection reason
                      <input
                        className="pf-input"
                        value={rejectReasons[approval.id] ?? ""}
                        onChange={(event) =>
                          setRejectReasons((prev) => ({
                            ...prev,
                            [approval.id]: event.target.value,
                          }))
                        }
                        placeholder="Required only if rejecting"
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
                        Reject questionnaire
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
                        Approve questionnaire
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
                          {item.area?.name ?? "Area"} · Cycle v
                          {item.planRelease.version}
                        </p>
                      </div>
                      <StatusBadge tone="warning">Proposed</StatusBadge>
                    </div>
                    <p>{item.body}</p>
                    {summary && (
                      <p className="pf-muted">
                        AI summary: {summary.summaryText}
                      </p>
                    )}
                    <label className="pf-field">
                      Rejection reason
                      <input
                        className="pf-input"
                        value={rejectReasons[item.id] ?? ""}
                        onChange={(event) =>
                          setRejectReasons((prev) => ({
                            ...prev,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="Required only if rejecting"
                      />
                    </label>
                    <div className="pf-actions">
                      <button
                        className="pf-button-danger"
                        type="button"
                        disabled={busyIds[item.id]}
                        onClick={() => rejectPlanItem(item.id)}
                      >
                        Reject plan item
                      </button>
                      <button
                        className="pf-button"
                        type="button"
                        disabled={busyIds[item.id]}
                        onClick={() => approvePlanItem(item.id)}
                      >
                        Approve plan item
                      </button>
                    </div>
                  </div>
                );
              })}
            </article>
          ))}

          {!loading && groups.length === 0 && (
            <EmptyState
              title="No approval work"
              description="No linked athlete has questionnaires or plan items awaiting your review."
            />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
