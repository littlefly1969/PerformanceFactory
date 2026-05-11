"use client";

import { useEffect, useMemo, useState } from "react";
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

type TrainingOutput = {
  summaryText?: string;
  planItems?: Array<{
    type?: string;
    title?: string;
    body?: string;
  }>;
  questions?: Array<{
    text?: string;
    orderIndex?: number;
  }>;
};

type TrainingPlan = {
  id: string;
  version: number;
  status: string;
  summaryText: string;
  outputJson: TrainingOutput;
  provider: string;
  model: string;
  createdAt: string;
  publishedAt?: string | null;
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "-"
    : parsed.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

const statusLabel = (status: string) =>
  ({
    ACTIVE: "attivo",
    CLOSED: "chiuso",
  })[status] ?? status.replace(/_/g, " ").toLowerCase();

export default function UserTrainingPage() {
  const [training, setTraining] = useState<TrainingPlan | null>(null);
  const [history, setHistory] = useState<TrainingPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const items = useMemo(
    () => training?.outputJson?.planItems ?? [],
    [training],
  );
  const questions = useMemo(
    () => training?.outputJson?.questions ?? [],
    [training],
  );

  const loadTraining = async () => {
    setLoading(true);
    setMessage(null);
    const [currentResponse, historyResponse] = await Promise.all([
      secureFetch(`${API_BASE}/user/training/current`, {
        credentials: "include",
      }),
      secureFetch(`${API_BASE}/user/training/history`, {
        credentials: "include",
      }),
    ]);

    if (currentResponse.ok) {
      setTraining((await currentResponse.json()) as TrainingPlan);
    } else {
      setTraining(null);
      if (currentResponse.status !== 404) {
        setMessage("Impossibile caricare l'allenamento specifico.");
      }
    }

    if (historyResponse.ok) {
      setHistory((await historyResponse.json()) as TrainingPlan[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void (async () => {
      if (!(await redirectIfOnboardingRequired())) {
        await loadTraining();
      }
    })();
  }, []);

  return (
    <ProductShell
      eyebrow="Allenamento"
      title="Allenamento specifico"
      description="Seduta o progressione generata sullo sport-specializzazione scelto, usando le aree abilitate come contesto."
      actions={
        <button
          className="pf-button-secondary"
          type="button"
          onClick={() => loadTraining()}
        >
          Aggiorna
        </button>
      }
      stats={[
        {
          label: "Versione",
          value: loading ? "..." : training?.version ?? "-",
          tone: "accent",
        },
        {
          label: "Stato",
          value: training ? statusLabel(training.status) : "-",
          tone: training ? "success" : "neutral",
        },
        {
          label: "Storico",
          value: history.length,
          tone: "neutral",
        },
      ]}
    >
      {message && <div className="pf-alert">{message}</div>}

      {!loading && !training && (
        <EmptyState
          title="Nessun allenamento generato"
          description="Quando l'amministratore genera l'allenamento autonomo, lo vedrai qui."
        />
      )}

      {training && (
        <section className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Allenamento corrente</h2>
              <p className="pf-muted">
                Generato il {formatDate(training.createdAt)} - {training.provider} /{" "}
                {training.model}
              </p>
            </div>
            <StatusBadge tone="success">{statusLabel(training.status)}</StatusBadge>
          </div>
          <p>{training.summaryText}</p>
          <div className="pf-stack">
            {items.map((item, index) => (
              <article key={`${item.title ?? "item"}:${index}`} className="pf-card">
                <div className="pf-card-top">
                  <div>
                    <p className="pf-eyebrow">{item.type ?? "Allenamento"}</p>
                    <h3>{item.title ?? `Blocco ${index + 1}`}</h3>
                  </div>
                </div>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
          {questions.length > 0 && (
            <div className="pf-stack">
              <h2>Monitoraggio</h2>
              {questions.map((question, index) => (
                <div key={`${question.text ?? "question"}:${index}`} className="pf-metric-row">
                  <span>{question.text}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </ProductShell>
  );
}
