"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import {
  API_BASE,
  redirectIfOnboardingRequired,
  secureFetch,
} from "@/app/lib/api";

type AnswerOption = { id: string; label: string };
type Question = {
  id: string;
  text: string;
  orderIndex: number;
  options: AnswerOption[];
  answers?: Array<{
    answerOptionId?: string | null;
  }>;
};

type QuestionSet = {
  id: string;
  status: string;
  createdAt: string;
  questions: Question[];
};

type Area = { id: string; name: string };

const formatStatus = (status: string) =>
  ({
    ACTIVE: "attivo",
    COMPLETED: "completato",
    CLOSED: "inviato",
    PENDING: "in attesa",
    PUBLISHED: "inviato",
  })[status] ?? status.replace(/_/g, " ").toLowerCase();

export default function UserQuestionsHistoryPage() {
  const [areas, setAree] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [history, setHistory] = useState<QuestionSet[]>([]);
  const [historyCounts, setHistoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [authHint, setAuthHint] = useState<string | null>(null);

  const loadHistory = useCallback(async (selectedAreaId: string) => {
    setAreaId(selectedAreaId);
    setLoading(true);
    setAuthHint(null);
    setHistory([]);

    const response = await secureFetch(
      `${API_BASE}/user/questions/history?areaId=${encodeURIComponent(selectedAreaId)}`,
      { credentials: "include" },
    );

    if (!response.ok) {
      if (response.status === 401) {
        setAuthHint("Accedi per vedere lo storico check-in.");
      }
      setLoading(false);
      return;
    }

    setHistory((await response.json()) as QuestionSet[]);
    setLoading(false);
  }, []);

  const loadAree = useCallback(async () => {
    const response = await secureFetch(`${API_BASE}/areas`, {
      credentials: "include",
    });
    if (!response.ok) {
      return;
    }

    const loadedAree = (await response.json()) as Area[];
    setAree(loadedAree);
    const countEntries = await Promise.all(
      loadedAree.map(async (area) => {
        const historyResponse = await secureFetch(
          `${API_BASE}/user/questions/history?areaId=${encodeURIComponent(area.id)}`,
          { credentials: "include" },
        );
        const areaHistory = historyResponse.ok
          ? ((await historyResponse.json()) as QuestionSet[])
          : [];
        return [area.id, areaHistory.length] as const;
      }),
    );
    setHistoryCounts(Object.fromEntries(countEntries));
    const requestedAreaId =
      typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("areaId");
    const firstAreaId =
      (requestedAreaId && loadedAree.some((area) => area.id === requestedAreaId)
        ? requestedAreaId
        : "") ||
      loadedAree[0]?.id ||
      "";
    if (firstAreaId) {
      await loadHistory(firstAreaId);
    }
  }, [loadHistory]);

  useEffect(() => {
    void (async () => {
      if (!(await redirectIfOnboardingRequired())) {
        await loadAree();
      }
    })();
  }, [loadAree]);

  return (
    <ProductShell
      eyebrow="Ambiente atleta"
      title="Storico check-in"
      description="Scegli un'area per rivedere i check-in precedenti."
      actions={
        <button
          className="pf-button-secondary"
          type="button"
          onClick={() => loadAree()}
        >
          Aggiorna
        </button>
      }
    >
      {authHint && <div className="pf-alert warning">{authHint}</div>}

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Aree</h2>
          </div>
        </div>
        <div className="pf-area-grid">
          {areas.map((area) => (
            <button
              key={area.id}
              className={`pf-area-card ${area.id === areaId ? "selected" : ""}`}
              type="button"
              onClick={() => loadHistory(area.id)}
            >
              <span>
                <strong>{area.name}</strong>
              </span>
              <StatusBadge tone={historyCounts[area.id] ? "accent" : "neutral"}>
                {historyCounts[area.id] ? `${historyCounts[area.id]} disponibili` : "Vuoto"}
              </StatusBadge>
            </button>
          ))}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Storico</h2>
            <p className="pf-muted">Check-in completati dell'area selezionata.</p>
          </div>
        </div>

        <div className="pf-stack">
          {history.map((set) => (
            <article key={set.id} className="pf-card">
              <div className="pf-card-top pf-question-history-card-top">
                <h3>{new Date(set.createdAt).toLocaleDateString("it-IT")}</h3>
                <StatusBadge tone="accent">
                  {formatStatus(set.status)}
                </StatusBadge>
              </div>
              <div className="pf-stack pf-question-history-list">
                {set.questions.map((question) => {
                  const answer = question.answers?.[0];
                  const answerLabel = question.options.find(
                    (option) => option.id === answer?.answerOptionId,
                  )?.label;
                  return (
                    <div key={question.id} className="pf-work-row pf-question-history-row">
                      <span className="pf-question-history-content">
                        <strong>{question.orderIndex}. {question.text}</strong>
                        <small>{answerLabel ?? "Nessuna risposta registrata"}</small>
                      </span>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
          {!loading && areaId && history.length === 0 && (
            <EmptyState
              title="Nessuno storico"
              description="Lo storico apparira dopo la pubblicazione dei check-in."
            />
          )}
          {loading && (
            <EmptyState
              title="Caricamento storico"
              description="Sto caricando i check-in precedenti dell'area selezionata."
            />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
