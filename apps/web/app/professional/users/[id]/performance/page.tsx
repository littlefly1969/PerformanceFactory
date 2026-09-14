"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
type Piano = {
  id: string;
  areaId: string;
  version: number;
  status: string;
  createdAt: string;
  sourceSnapshotId?: string | null;
  items: PlanItem[];
};
type QuestionSet = {
  id: string;
  planReleaseId?: string | null;
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
  return parsed.toLocaleDateString("it-IT", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};
const cleanStato = (status: string) =>
  ({
    ACTIVE: "attivo",
    COMPLETED: "completato",
    CLOSED: "chiuso",
    PENDING: "in attesa",
    PUBLISHED: "pubblicato",
  })[status] ?? status.replace(/_/g, " ").toLowerCase();

export default function ProfessionalUserPerformancePage() {
  const params = useParams();
  const userId = typeof params?.id === "string" ? params.id : "";
  const [current, setCurrent] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [planHistory, setPianoHistory] = useState<Piano[]>([]);
  const [questionHistory, setQuestionHistory] = useState<QuestionSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const radarAree = useMemo(
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

  const areaNameById = useMemo(() => {
    const entries = new Map<string, string>();
    for (const snapshot of history) {
      for (const area of snapshot.areas) {
        entries.set(area.areaId, area.area?.name ?? "Area");
      }
    }
    for (const area of current?.areas ?? []) {
      entries.set(area.areaId, area.area?.name ?? "Area");
    }
    return entries;
  }, [current, history]);

  const historicalCycles = useMemo(() => {
    const questionsByPlan = new Map<string, QuestionSet[]>();
    const standaloneQuestions: QuestionSet[] = [];

    for (const questionSet of questionHistory) {
      if (questionSet.planReleaseId) {
        const entries = questionsByPlan.get(questionSet.planReleaseId) ?? [];
        entries.push(questionSet);
        questionsByPlan.set(questionSet.planReleaseId, entries);
      } else {
        standaloneQuestions.push(questionSet);
      }
    }

    const planCycles = planHistory.map((plan) => ({
      id: plan.id,
      areaId: plan.areaId,
      areaName: areaNameById.get(plan.areaId) ?? "Area",
      createdAt: plan.createdAt,
      plan,
      questionSets: questionsByPlan.get(plan.id) ?? [],
    }));

    const questionOnlyCycles = standaloneQuestions.map((questionSet) => ({
      id: questionSet.id,
      areaId: questionSet.areaId ?? "",
      areaName: questionSet.areaId
        ? (areaNameById.get(questionSet.areaId) ?? "Area")
        : "Area",
      createdAt: questionSet.createdAt,
      plan: null,
      questionSets: [questionSet],
    }));

    return [...planCycles, ...questionOnlyCycles].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [areaNameById, planHistory, questionHistory]);

  const loadProfilo = useCallback(async () => {
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
          ? "Non sei autorizzato a vedere il profilo di questo atleta."
          : "Impossibile caricare il profilo performance.",
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
        const [plansRes, domandeRes] = await Promise.all([
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
          plans: plansRes.ok ? ((await plansRes.json()) as Piano[]) : [],
          questions: domandeRes.ok
            ? ((await domandeRes.json()) as QuestionSet[])
            : [],
        };
      }),
    );
    setPianoHistory(areaHistories.flatMap((entry) => entry.plans));
    setQuestionHistory(areaHistories.flatMap((entry) => entry.questions));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadProfilo();
  }, [loadProfilo]);

  return (
    <ProductShell
      eyebrow="Ambiente professionista"
      title="Profilo performance atleta"
      description="Storico performance in sola lettura per un atleta collegato."
      actions={
        <div className="pf-header-actions">
          <Link className="pf-button-secondary" href="/professional">
            Torna agli atleti
          </Link>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadProfilo()}
          >
            Aggiorna
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
          label: "Aree visibili",
          value: loading ? "..." : (current?.areas.length ?? "-"),
          tone: "success",
        },
        {
          label: "Snapshot",
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
              <h2>Snapshot corrente</h2>
              <p className="pf-muted">
                I valori R/P mostrano il perimetro visibile per il tuo incarico.
              </p>
            </div>
            {current && (
              <StatusBadge tone="success">
                {formatDate(current.createdAt)}
              </StatusBadge>
            )}
          </div>
          <RadarChart areas={radarAree} />
        </article>

        <aside className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Valori area</h2>
              <p className="pf-muted">Punteggi reali e potenziali correnti.</p>
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
                title="Nessuno snapshot"
                description="L'atleta non ha ancora uno snapshot performance pubblicato."
              />
            )}
          </div>
        </aside>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Progressione performance</h2>
            <p className="pf-muted">
              Timeline sintetica degli snapshot generati alla chiusura dei cicli.
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
              title="Nessuno storico"
              description="Gli snapshot appaiono dopo ogni ciclo chiuso."
            />
          )}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Storico cicli</h2>
            <p className="pf-muted">
              Lavori assegnati e questionari collegati, raccolti per ciclo.
            </p>
          </div>
        </div>
        <div className="pf-stack">
          {historicalCycles.map((cycle) => (
            <article key={cycle.id} className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>{cycle.areaName}</h3>
                  <p className="pf-muted">
                    {formatDate(cycle.createdAt)}
                    {cycle.plan ? ` - versione ${cycle.plan.version}` : ""}
                  </p>
                </div>
                <StatusBadge
                  tone={cycle.plan?.status === "ACTIVE" ? "accent" : "neutral"}
                >
                  {cycle.plan ? cleanStato(cycle.plan.status) : "questionario"}
                </StatusBadge>
              </div>

              <div className="pf-stack">
                {cycle.plan && (
                  <section className="pf-panel-section">
                    <div className="pf-section-title">Lavori</div>
                    <div className="pf-stack">
                      {cycle.plan.items.map((item) => (
                        <div key={item.id} className="pf-work-row">
                          <span>
                            <strong>{item.title}</strong>
                            <small>
                              {cleanStato(item.status)}
                              {item.completedAt
                                ? ` - completato ${formatDate(item.completedAt)}`
                                : ""}
                              {item.completionRating
                                ? ` - voto ${item.completionRating}`
                                : ""}
                            </small>
                          </span>
                          <p className="pf-muted">{item.body}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="pf-panel-section">
                  <div className="pf-section-title">Questionario</div>
                  <div className="pf-stack">
                    {cycle.questionSets.flatMap((set) =>
                      set.questions.map((question) => {
                        const answer = question.answers?.[0];
                        const answerLabel = question.options.find(
                          (option) => option.id === answer?.answerOptionId,
                        )?.label;
                        return (
                          <div key={question.id} className="pf-work-row">
                            <span>
                              <strong>
                                {question.orderIndex}. {question.text}
                              </strong>
                              <small>
                                {answerLabel ?? "Nessuna risposta registrata"}
                              </small>
                            </span>
                          </div>
                        );
                      }),
                    )}
                    {!cycle.questionSets.length && (
                      <p className="pf-muted">Nessun questionario collegato.</p>
                    )}
                  </div>
                </section>
              </div>
            </article>
          ))}
          {!loading && historicalCycles.length === 0 && (
            <EmptyState
              title="Nessuno storico cicli"
              description="I cicli pubblicati appariranno qui con lavori e questionari collegati."
            />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
