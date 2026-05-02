"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import { RadarChart } from "@/app/components/radar-chart";
import { API_BASE, secureFetch } from "@/app/lib/api";

type SnapshotArea = {
  areaId: string;
  realR: number;
  potentialP: number;
  area?: { id: string; name: string };
};

type Snapshot = {
  id: string;
  userId: string;
  rankingGlobal: number;
  reason: string;
  createdAt: string;
  areas: SnapshotArea[];
};
type PlanItem = {
  id: string;
  status: string;
  title: string;
  body: string;
  completedAt?: string | null;
  completionRating?: number | null;
};
type Plan = {
  id: string;
  areaId: string;
  version: number;
  status: string;
  createdAt: string;
  items: PlanItem[];
};
type QuestionSet = {
  id: string;
  status: string;
  createdAt: string;
  areaId?: string;
  questions: Array<{
    id: string;
    text: string;
    orderIndex: number;
    options: Array<{ id: string; label: string }>;
    answers?: Array<{ answerOptionId?: string | null; scoreAwarded?: number | null }>;
  }>;
};

const formatDate = (value?: string) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};
const cleanStatus = (status: string) => status.replace(/_/g, " ").toLowerCase();

export default function ProfessionalUserPerformancePage() {
  const params = useParams();
  const userId = typeof params?.id === "string" ? params.id : "";
  const [current, setCurrent] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [planHistory, setPlanHistory] = useState<Plan[]>([]);
  const [questionHistory, setQuestionHistory] = useState<QuestionSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const radarAreas = useMemo(
    () =>
      current?.areas.map((area) => ({
        id: area.areaId,
        label: area.area?.name ?? "Area",
        real: area.realR,
        potential: area.potentialP,
      })) ?? [],
    [current],
  );

  const sortedHistory = useMemo(
    () =>
      history
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [history],
  );

  const loadProfile = async () => {
    if (!userId) {
      return;
    }

    setLoading(true);
    setMessage(null);

    const query = `?userId=${encodeURIComponent(userId)}`;
    const [currentRes, historyRes] = await Promise.all([
      secureFetch(`${API_BASE}/performance/profile/current${query}`, {
        credentials: "include",
      }),
      secureFetch(`${API_BASE}/performance/profile/history${query}`, {
        credentials: "include",
      }),
    ]);

    if (!currentRes.ok || !historyRes.ok) {
      setMessage(
        currentRes.status === 403 || historyRes.status === 403
          ? "You are not allowed to view this athlete profile."
          : "Unable to load performance profile.",
      );
      setLoading(false);
      return;
    }

    const nextCurrent = (await currentRes.json()) as Snapshot;
    const nextHistory = (await historyRes.json()) as Snapshot[];
    setCurrent(nextCurrent);
    setHistory(nextHistory);
    const areaHistories = await Promise.all(
      nextCurrent.areas.map(async (area) => {
        const [plansRes, questionsRes] = await Promise.all([
          secureFetch(
            `${API_BASE}/plans/history${query}&areaId=${encodeURIComponent(area.areaId)}`,
            { credentials: "include" },
          ),
          secureFetch(
            `${API_BASE}/questions/history${query}&areaId=${encodeURIComponent(area.areaId)}`,
            { credentials: "include" },
          ),
        ]);
        return {
          plans: plansRes.ok ? ((await plansRes.json()) as Plan[]) : [],
          questions: questionsRes.ok
            ? ((await questionsRes.json()) as QuestionSet[])
            : [],
        };
      }),
    );
    setPlanHistory(areaHistories.flatMap((entry) => entry.plans));
    setQuestionHistory(areaHistories.flatMap((entry) => entry.questions));
    setLoading(false);
  };

  useEffect(() => {
    void loadProfile();
  }, [userId]);

  return (
    <ProductShell
      eyebrow="Professional workspace"
      title="Athlete performance profile"
      description="Read-only performance history for a linked athlete, filtered by your assigned areas."
      actions={
        <div className="pf-header-actions">
          <Link className="pf-button-secondary" href="/professional">
            Back to athletes
          </Link>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadProfile()}
          >
            Refresh
          </button>
        </div>
      }
      stats={[
        {
          label: "Ranking",
          value: loading ? "..." : (current?.rankingGlobal ?? "-"),
          tone: "accent",
        },
        {
          label: "Visible areas",
          value: loading ? "..." : (current?.areas.length ?? "-"),
          tone: "success",
        },
        {
          label: "Snapshots",
          value: loading ? "..." : history.length,
          tone: "warning",
        },
      ]}
    >
      {message && <div className="pf-alert warning">{message}</div>}

      <section className="pf-dashboard-grid">
        <article className="pf-panel pf-focus-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Current snapshot</h2>
              <p className="pf-muted">
                R/P values are visible only for the areas assigned to you.
              </p>
            </div>
            {current && (
              <StatusBadge tone="success">
                {formatDate(current.createdAt)}
              </StatusBadge>
            )}
          </div>
          <RadarChart areas={radarAreas} />
        </article>

        <aside className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Area values</h2>
              <p className="pf-muted">Current real and potential scores.</p>
            </div>
          </div>
          <div className="pf-stack">
            {current?.areas.map((area) => (
              <div key={area.areaId} className="pf-metric-row">
                <span>{area.area?.name ?? "Area"}</span>
                <strong>
                  {area.realR.toFixed(0)}/{area.potentialP.toFixed(0)}
                </strong>
              </div>
            ))}
            {!loading && !current && (
              <EmptyState
                title="No snapshot"
                description="The athlete has no published performance snapshot yet."
              />
            )}
          </div>
        </aside>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Snapshot history</h2>
            <p className="pf-muted">
              Historical ranking and generation reason.
            </p>
          </div>
        </div>
        <div className="pf-table">
          {sortedHistory.map((snapshot) => (
            <article key={snapshot.id} className="pf-work-row">
              <div>
                <strong>Ranking {snapshot.rankingGlobal}</strong>
                <p className="pf-muted">{snapshot.reason}</p>
              </div>
              <span className="pf-muted">{formatDate(snapshot.createdAt)}</span>
              <StatusBadge tone="neutral">
                {snapshot.id.slice(0, 8)}
              </StatusBadge>
            </article>
          ))}
          {!loading && sortedHistory.length === 0 && (
            <EmptyState
              title="No history"
              description="Snapshots appear after each closed cycle."
            />
          )}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Storico lavori</h2>
            <p className="pf-muted">
              Esercizi attivi, completati e chiusi visibili per le aree assegnate.
            </p>
          </div>
        </div>
        <div className="pf-stack">
          {planHistory.map((plan) => (
            <article key={plan.id} className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>Versione {plan.version}</h3>
                  <p className="pf-muted">{formatDate(plan.createdAt)}</p>
                </div>
                <StatusBadge tone={plan.status === "ACTIVE" ? "accent" : "neutral"}>
                  {cleanStatus(plan.status)}
                </StatusBadge>
              </div>
              <div className="pf-stack">
                {plan.items.map((item) => (
                  <div key={item.id} className="pf-work-row">
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {cleanStatus(item.status)}
                        {item.completedAt ? ` · completed ${formatDate(item.completedAt)}` : ""}
                        {item.completionRating ? ` · rating ${item.completionRating}` : ""}
                      </small>
                    </span>
                    <p className="pf-muted">{item.body}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
          {!loading && planHistory.length === 0 && (
            <EmptyState title="No plan history" description="Published plan history will appear here." />
          )}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Storico questionari</h2>
            <p className="pf-muted">
              Domande e risposte storiche visibili per le aree assegnate.
            </p>
          </div>
        </div>
        <div className="pf-stack">
          {questionHistory.map((set) => (
            <article key={set.id} className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>{formatDate(set.createdAt)}</h3>
                  <p className="pf-muted">{set.questions.length} questions</p>
                </div>
                <StatusBadge tone={set.status === "CLOSED" ? "success" : "warning"}>
                  {cleanStatus(set.status)}
                </StatusBadge>
              </div>
              <div className="pf-stack">
                {set.questions.map((question) => {
                  const answer = question.answers?.[0];
                  const answerLabel = question.options.find(
                    (option) => option.id === answer?.answerOptionId,
                  )?.label;
                  return (
                    <div key={question.id} className="pf-work-row">
                      <span>
                        <strong>{question.orderIndex}. {question.text}</strong>
                        <small>{answerLabel ?? "No answer recorded"}</small>
                      </span>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
          {!loading && questionHistory.length === 0 && (
            <EmptyState title="No questionnaire history" description="Questionnaire history will appear here." />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
