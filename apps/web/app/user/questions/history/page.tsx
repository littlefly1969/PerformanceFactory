"use client";

import { useEffect, useState } from "react";
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
    CLOSED: "chiuso",
    PENDING: "in attesa",
    PUBLISHED: "pubblicato",
  })[status] ?? status.replace(/_/g, " ").toLowerCase();

export default function UserQuestionsHistoryPage() {
  const [areas, setAree] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [history, setHistory] = useState<QuestionSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [authHint, setAuthHint] = useState<string | null>(null);

  const loadHistory = async (selectedAreaId: string) => {
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
        setAuthHint("Accedi per vedere lo storico questionari.");
      }
      setLoading(false);
      return;
    }

    setHistory((await response.json()) as QuestionSet[]);
    setLoading(false);
  };

  const loadAree = async () => {
    const response = await secureFetch(`${API_BASE}/areas`, {
      credentials: "include",
    });
    if (!response.ok) {
      return;
    }

    const loadedAree = (await response.json()) as Area[];
    setAree(loadedAree);
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
  };

  useEffect(() => {
    void (async () => {
      if (!(await redirectIfOnboardingRequired())) {
        await loadAree();
      }
    })();
  }, []);

  return (
    <ProductShell
      eyebrow="Ambiente atleta"
      title="Storico questionari"
      description="Scegli un'area per rivedere i questionari precedenti."
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
            <p className="pf-muted">Apri lo storico dell'area che vuoi consultare.</p>
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
                <small>Storico questionari</small>
              </span>
              <StatusBadge tone={area.id === areaId ? "accent" : "neutral"}>
                Apri
              </StatusBadge>
            </button>
          ))}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Storico</h2>
            <p className="pf-muted">Questionari completati o chiusi dell'area selezionata.</p>
          </div>
        </div>

        <div className="pf-stack">
          {history.map((set) => (
            <article key={set.id} className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>{new Date(set.createdAt).toLocaleDateString("it-IT")}</h3>
                  <p className="pf-muted">{set.questions.length} domande</p>
                </div>
                <StatusBadge tone={set.status === "CLOSED" ? "success" : "warning"}>
                  {formatStatus(set.status)}
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
          {!loading && areaId && history.length === 0 && (
            <EmptyState
              title="Nessuno storico"
              description="Lo storico apparira dopo la pubblicazione dei questionari."
            />
          )}
          {loading && (
            <EmptyState
              title="Caricamento storico"
              description="Sto caricando i questionari precedenti dell'area selezionata."
            />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
