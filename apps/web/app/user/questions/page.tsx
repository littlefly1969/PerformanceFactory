"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import {
  API_BASE,
  secureFetch,
  redirectIfOnboardingRequired,
} from "@/app/lib/api";

type AnswerOption = { id: string; label: string };
type Question = {
  id: string;
  areaId: string;
  text: string;
  orderIndex: number;
  area?: { id: string; name: string };
  options: AnswerOption[];
  answers?: Array<{
    id: string;
    answerOptionId?: string | null;
    scoreAwarded?: number | null;
    answeredAt: string;
  }>;
};
type QuestionSet = {
  id: string;
  status: string;
  createdAt: string;
  areaId?: string;
  questions: Question[];
};
type Snapshot = {
  id: string;
  rankingGlobal: number;
  createdAt: string;
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

export default function UserQuestionsPage() {
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [areas, setAree] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [questionSetsByArea, setQuestionSetsByArea] = useState<
    Record<string, QuestionSet | null>
  >({});
  const [questionHistory, setQuestionHistory] = useState<QuestionSet[]>([]);

  const totalQuestions = questionSet?.questions.length ?? 0;
  const answeredCount = Object.keys(selected).length;
  const progress = useMemo(() => {
    if (!totalQuestions) {
      return "0%";
    }
    return `${Math.round((answeredCount / totalQuestions) * 100)}%`;
  }, [answeredCount, totalQuestions]);

  const loadAree = async () => {
    const response = await secureFetch(`${API_BASE}/areas`, {
      credentials: "include",
    });
    if (response.ok) {
      const loadedAree = (await response.json()) as Area[];
      setAree(loadedAree);
      const entries = await Promise.all(
        loadedAree.map(async (area) => {
          const questionResponse = await secureFetch(
            `${API_BASE}/user/questions/current?areaId=${encodeURIComponent(area.id)}`,
            { credentials: "include" },
          );
          return [
            area.id,
            questionResponse.ok
              ? ((await questionResponse.json()) as QuestionSet)
              : null,
          ] as const;
        }),
      );
      const nextQuestionSets = Object.fromEntries(entries);
      setQuestionSetsByArea(nextQuestionSets);
      const firstOpen = entries.find(([, set]) => set?.questions.length);
      const requestedAreaId =
        typeof window === "undefined"
          ? ""
          : new URLSearchParams(window.location.search).get("areaId");
      setAreaId(
        (current) =>
          current ||
          (requestedAreaId && loadedAree.some((area) => area.id === requestedAreaId)
            ? requestedAreaId
            : "") ||
          firstOpen?.[0] ||
          loadedAree[0]?.id ||
          "",
      );
    }
  };

  const loadQuestionSet = async (selectedAreaId = areaId) => {
    setLoading(true);
    setAuthHint(null);
    setMessage(null);
    setSubmitted(false);
    setSnapshot(null);
    setSelected({});

    if (!selectedAreaId) {
      setQuestionSet(null);
      setMessage("Seleziona un'area per caricare il questionario.");
      setLoading(false);
      return;
    }

    const response = await secureFetch(
      `${API_BASE}/user/questions/current?areaId=${encodeURIComponent(selectedAreaId)}`,
      { credentials: "include" },
    );

    if (!response.ok) {
      setQuestionSet(null);
      if (response.status === 401) {
        setAuthHint("Accedi per rispondere al questionario.");
      } else if (response.status === 404) {
        setMessage("Non c'e un questionario pubblicato disponibile per questa area.");
      } else {
        setMessage("Impossibile caricare il questionario.");
      }
      setLoading(false);
      return;
    }

    setQuestionSet((await response.json()) as QuestionSet);
    const historyResponse = await secureFetch(
      `${API_BASE}/user/questions/history?areaId=${encodeURIComponent(selectedAreaId)}`,
      { credentials: "include" },
    );
    setQuestionHistory(
      historyResponse.ok ? ((await historyResponse.json()) as QuestionSet[]) : [],
    );
    setLoading(false);
  };

  useEffect(() => {
    void (async () => {
      if (!(await redirectIfOnboardingRequired())) {
        await loadAree();
      }
    })();
  }, []);

  useEffect(() => {
    if (areaId) {
      void loadQuestionSet(areaId);
    }
  }, [areaId]);

  const handleSubmit = async () => {
    if (!questionSet) {
      return;
    }
    setMessage(null);

    const answers = questionSet.questions.map((question) => ({
      questionId: question.id,
      answerOptionId: selected[question.id],
    }));

    if (answers.some((answer) => !answer.answerOptionId)) {
      setMessage("Rispondi a tutte le domande prima dell'invio.");
      return;
    }

    const response = await secureFetch(`${API_BASE}/answers/batch`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionSetId: questionSet.id, answers }),
    });

    if (!response.ok) {
      setMessage("Le risposte non possono essere inviate. Potrebbero esistere gia.");
      return;
    }

    const profileResponse = await secureFetch(
      `${API_BASE}/performance/profile/current`,
      {
        credentials: "include",
      },
    );
    if (profileResponse.ok) {
      setSnapshot((await profileResponse.json()) as Snapshot);
    }

    setSubmitted(true);
    setQuestionSet((current) =>
      current ? { ...current, status: "CLOSED" } : current,
    );
    setMessage("Risposte inviate. Questionario chiuso e profilo aggiornato.");
    await loadAree();
  };

  return (
    <ProductShell
      eyebrow="Ambiente atleta"
      title="Check-in per area"
      description="I questionari sono raggruppati per area. L'invio di tutte le risposte chiude il check-in e aggiorna automaticamente il profilo."
      actions={
        <button
          className="pf-button-secondary"
          type="button"
          onClick={() => loadAree()}
        >
          Aggiorna aree
        </button>
      }
      stats={[
        {
          label: "Risposte",
          value: `${answeredCount}/${totalQuestions}`,
          tone: "accent",
        },
        { label: "Avanzamento", value: progress, tone: "success" },
        { label: "Stato", value: questionSet?.status ?? "-", tone: "warning" },
      ]}
    >
      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Aree</h2>
            <p className="pf-muted">
              Le aree evidenziate hanno un questionario pubblicato in attesa
              di risposta.
            </p>
          </div>
        </div>
        <div className="pf-area-grid">
          {areas.map((area) => {
            const set = questionSetsByArea[area.id];
            const selectedArea = area.id === areaId;
            return (
              <button
                key={area.id}
                className={`pf-area-card ${selectedArea ? "selected" : ""} ${set ? "attention" : ""}`}
                type="button"
                onClick={() => setAreaId(area.id)}
              >
                <span>
                  <strong>{area.name}</strong>
                  <small>
                    {set
                      ? `${set.questions.length} domande pronte`
                      : "Nessun questionario"}
                  </small>
                </span>
                <StatusBadge tone={set ? "warning" : "neutral"}>
                  {set ? "Da rispondere" : "Vuoto"}
                </StatusBadge>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Check-in corrente</h2>
            <p className="pf-muted">
              Scegli l'opzione che descrive meglio la tua esecuzione attuale.
            </p>
          </div>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadQuestionSet()}
          >
            Aggiorna
          </button>
        </div>

        {authHint && <div className="pf-alert warning">{authHint}</div>}
        {message && <div className="pf-alert">{message}</div>}

        <div className="pf-stack">
          {questionSet?.questions.map((question) => (
            <article key={question.id} className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>
                    {question.orderIndex}. {question.text}
                  </h3>
                  <p className="pf-muted">{question.area?.name ?? "Area"}</p>
                </div>
                {selected[question.id] && (
                  <StatusBadge tone="success">Risposte</StatusBadge>
                )}
              </div>
              <div className="pf-grid">
                {question.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={
                      selected[question.id] === option.id
                        ? "pf-button"
                        : "pf-button-secondary"
                    }
                    onClick={() =>
                      setSelected((prev) => ({
                        ...prev,
                        [question.id]: option.id,
                      }))
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </article>
          ))}

          {!loading && !questionSet && (
            <EmptyState
              title={areaId ? "Nessun questionario disponibile" : "Seleziona un'area"}
              description={
                areaId
                  ? "Per questa area non e ancora stato pubblicato un questionario approvato dal professionista."
                  : "Scegli un'area per caricare il questionario corrente."
              }
            />
          )}
        </div>

        {questionSet && (
          <div className="pf-actions" style={{ marginTop: 18 }}>
            <button
              className="pf-button"
              type="button"
              onClick={handleSubmit}
              disabled={submitted}
            >
              {submitted ? "Inviato e chiuso" : "Invia e chiudi"}
            </button>
            {snapshot && (
              <StatusBadge tone="success">
                Ranking {snapshot.rankingGlobal}
              </StatusBadge>
            )}
          </div>
        )}
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Storico questionari</h2>
            <p className="pf-muted">
              Rivedi questionari aperti, completati e chiusi dell area selezionata.
            </p>
          </div>
        </div>
        <div className="pf-stack">
          {questionHistory.map((set) => (
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
          {!loading && questionHistory.length === 0 && (
            <EmptyState title="Nessuno storico" description="Lo storico apparira dopo la pubblicazione dei questionari." />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
