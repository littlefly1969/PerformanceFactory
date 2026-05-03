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
type Piano = {
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

  const loadProfilo = async () => {
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
  };

  useEffect(() => {
    void loadProfilo();
  }, [userId]);

  return (
    <ProductShell
      eyebrow="Ambiente professionista"
      title="Profilo performance atleta"
      description="Storico performance in sola lettura per un atleta collegato, filtrato sulle aree assegnate."
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
                I valori R/P sono visibili solo per le aree assegnate a te.
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
            <h2>Storico snapshot</h2>
            <p className="pf-muted">
              Ranking storico e motivo della generazione.
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
                  {cleanStato(plan.status)}
                </StatusBadge>
              </div>
              <div className="pf-stack">
                {plan.items.map((item) => (
                  <div key={item.id} className="pf-work-row">
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {cleanStato(item.status)}
                        {item.completedAt ? ` - completato ${formatDate(item.completedAt)}` : ""}
                        {item.completionRating ? ` - voto ${item.completionRating}` : ""}
                      </small>
                    </span>
                    <p className="pf-muted">{item.body}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
          {!loading && planHistory.length === 0 && (
            <EmptyState title="Nessuno storico piani" description="Lo storico dei piani pubblicati apparira qui." />
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
                  <p className="pf-muted">{set.questions.length} domande</p>
                </div>
                <StatusBadge tone={set.status === "CLOSED" ? "success" : "warning"}>
                  {cleanStato(set.status)}
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
                        <small>{answerLabel ?? "Nessuna risposta registrata"}</small>
                      </span>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
          {!loading && questionHistory.length === 0 && (
            <EmptyState title="Nessuno storico questionari" description="Lo storico dei questionari apparira qui." />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
