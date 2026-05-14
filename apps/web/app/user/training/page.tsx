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
  specialization?: {
    label: string;
    sport: { label: string };
  };
  items?: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    status: string;
    completedAt?: string | null;
    completionNotes?: string | null;
    completionRating?: number | null;
  }>;
  questionSets?: Array<{
    id: string;
    status: string;
    questions: Array<{
      id: string;
      text: string;
      orderIndex: number;
      options: Array<{ id: string; label: string; score: number }>;
    }>;
  }>;
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
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [ratingById, setRatingById] = useState<Record<string, string>>({});
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>(
    {},
  );
  const [answersSubmitted, setAnswersSubmitted] = useState(false);

  const items = useMemo(
    () =>
      training?.items?.length
        ? training.items
        : (training?.outputJson?.planItems ?? []),
    [training],
  );
  const activeItems = useMemo(
    () =>
      training?.items?.filter((item) => item.status === "ACTIVE") ?? [],
    [training],
  );
  const completedItems = useMemo(
    () =>
      training?.items?.filter((item) => item.status === "COMPLETED") ?? [],
    [training],
  );
  const questionSet = training?.questionSets?.[0] ?? null;
  const questions = useMemo(
    () =>
      training?.questionSets?.[0]?.questions?.length
        ? training.questionSets[0].questions
        : (training?.outputJson?.questions ?? []),
    [training],
  );

  const loadTraining = async () => {
    setLoading(true);
    setMessage(null);
    setNotesById({});
    setRatingById({});
    setSelectedAnswers({});
    setAnswersSubmitted(false);
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

  const completeTrainingItem = async (itemId: string) => {
    setMessage(null);
    const completionNotes = notesById[itemId]?.trim();
    const ratingRaw = ratingById[itemId]?.trim();
    const payload: { completionNotes?: string; completionRating?: number } = {};

    if (completionNotes) {
      payload.completionNotes = completionNotes;
    }
    if (ratingRaw) {
      const parsed = Number(ratingRaw);
      if (Number.isFinite(parsed)) {
        payload.completionRating = Math.trunc(parsed);
      }
    }

    const response = await secureFetch(
      `${API_BASE}/user/training-plan-items/${itemId}/complete`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      setMessage(
        response.status === 409
          ? "Questo esercizio e gia stato completato."
          : "Completamento esercizio non riuscito.",
      );
      return;
    }

    setMessage("Esercizio completato.");
    await loadTraining();
  };

  const submitTrainingAnswers = async () => {
    if (!questionSet) {
      return;
    }
    setMessage(null);

    const answers = questionSet.questions.map((question) => ({
      questionId: question.id,
      answerOptionId: selectedAnswers[question.id],
    }));

    if (answers.some((answer) => !answer.answerOptionId)) {
      setMessage("Rispondi a tutte le domande di monitoraggio prima dell'invio.");
      return;
    }

    const response = await secureFetch(`${API_BASE}/answers/training/batch`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionSetId: questionSet.id, answers }),
    });

    if (!response.ok) {
      setMessage("Le risposte di monitoraggio non possono essere inviate. Potrebbero esistere gia.");
      return;
    }

    setAnswersSubmitted(true);
    setMessage("Monitoraggio inviato. Questionario allenamento chiuso.");
    await loadTraining();
  };

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
          label: "Esercizi da fare",
          value: loading ? "..." : activeItems.length,
          tone: "accent",
        },
        {
          label: "Stato",
          value: training ? statusLabel(training.status) : "-",
          tone: training ? "success" : "neutral",
        },
        {
          label: "Completati",
          value: completedItems.length,
          tone: "success",
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
                {training.specialization
                  ? ` - ${training.specialization.sport.label} / ${training.specialization.label}`
                  : ""}
              </p>
            </div>
            <StatusBadge tone="success">{statusLabel(training.status)}</StatusBadge>
          </div>
          <p>{training.summaryText}</p>
          <div className="pf-stack">
            {items.map((item, index) => {
              const itemId =
                "id" in item && typeof item.id === "string" ? item.id : null;
              const itemStatus =
                "status" in item && typeof item.status === "string"
                  ? item.status
                  : "";
              const actionable = Boolean(itemId) && itemStatus === "ACTIVE";
              const completed = itemStatus === "COMPLETED";
              const completedAt =
                "completedAt" in item &&
                (typeof item.completedAt === "string" || item.completedAt === null)
                  ? item.completedAt
                  : null;
              const completionRating =
                "completionRating" in item &&
                typeof item.completionRating === "number"
                  ? item.completionRating
                  : null;
              return (
              <article key={`${item.title ?? "item"}:${index}`} className="pf-card pf-active-plan-card">
                <div className="pf-card-top pf-active-plan-header">
                  <div>
                    <p className="pf-eyebrow">{item.type ?? "Allenamento"}</p>
                    <h3>{item.title ?? `Blocco ${index + 1}`}</h3>
                  </div>
                  {itemStatus && (
                    <StatusBadge tone={completed ? "success" : "accent"}>
                      {statusLabel(itemStatus)}
                    </StatusBadge>
                  )}
                </div>
                <p className="pf-active-plan-body">{item.body}</p>
                {completed && (
                  <p className="pf-muted">
                    Completato {formatDate(completedAt)}
                    {completionRating ? ` - voto ${completionRating}/10` : ""}
                  </p>
                )}
                {actionable && (
                  <>
                    <div className="pf-grid pf-active-plan-form">
                      <label className="pf-field">
                        Note di completamento
                        <textarea
                          className="pf-textarea"
                          rows={3}
                          value={notesById[itemId ?? ""] ?? ""}
                          onChange={(event) =>
                            setNotesById((prev) => ({
                              ...prev,
                              [itemId ?? ""]: event.target.value,
                            }))
                          }
                          placeholder="Cosa hai completato?"
                        />
                      </label>
                      <label className="pf-field">
                        Voto
                        <input
                          className="pf-input"
                          type="number"
                          min={1}
                          max={10}
                          value={ratingById[itemId ?? ""] ?? ""}
                          onChange={(event) =>
                            setRatingById((prev) => ({
                              ...prev,
                              [itemId ?? ""]: event.target.value,
                            }))
                          }
                          placeholder="1-10"
                        />
                      </label>
                    </div>
                    <div className="pf-active-plan-actions">
                      <button
                        className="pf-button"
                        type="button"
                        onClick={() => itemId && completeTrainingItem(itemId)}
                      >
                        Segna come completato
                      </button>
                    </div>
                  </>
                )}
              </article>
              );
            })}
          </div>
          {questions.length > 0 && (
            <div className="pf-stack">
              <h2>Monitoraggio</h2>
              {questions.map((question, index) => {
                const questionId =
                  "id" in question && typeof question.id === "string"
                    ? question.id
                    : null;
                const options =
                  "options" in question && Array.isArray(question.options)
                    ? question.options
                    : [];
                return (
                <article key={`${question.text ?? "question"}:${index}`} className="pf-card">
                  <div className="pf-card-top">
                    <div>
                      <h3>
                        {question.orderIndex ?? index + 1}. {question.text}
                      </h3>
                    </div>
                    {questionId && selectedAnswers[questionId] && (
                      <StatusBadge tone="success">Risposta</StatusBadge>
                    )}
                  </div>
                  {questionId && options.length ? (
                    <div className="pf-grid">
                      {options.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={
                            selectedAnswers[questionId] === option.id
                              ? "pf-button"
                              : "pf-button-secondary"
                          }
                          onClick={() =>
                            setSelectedAnswers((prev) => ({
                              ...prev,
                              [questionId]: option.id,
                            }))
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
                );
              })}
              {questionSet && (
                <div className="pf-actions">
                  <button
                    className="pf-button"
                    type="button"
                    onClick={submitTrainingAnswers}
                    disabled={answersSubmitted}
                  >
                    {answersSubmitted ? "Monitoraggio inviato" : "Invia monitoraggio"}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </ProductShell>
  );
}
