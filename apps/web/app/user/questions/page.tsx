"use client";

import { useEffect, useRef, useState } from "react";
import {
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
type TrainingQuestion = {
  id: string;
  text: string;
  orderIndex: number;
  options: Array<{ id: string; label: string; score: number }>;
};
type TrainingPlan = {
  id: string;
  status: string;
  specialization?: {
    label: string;
    sport: { label: string };
  };
  questionSets?: Array<{
    id: string;
    status: string;
    questions: TrainingQuestion[];
  }>;
};
type Snapshot = {
  id: string;
  rankingGlobal: number;
  createdAt: string;
};
type Area = { id: string; name: string };

export default function UserQuestionsPage() {
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [training, setTraining] = useState<TrainingPlan | null>(null);
  const [trainingSelected, setTrainingSelected] = useState<Record<string, string>>(
    {},
  );
  const [trainingSubmitted, setTrainingSubmitted] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [areas, setAree] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [questionSetsByArea, setQuestionSetsByArea] = useState<
    Record<string, QuestionSet | null>
  >({});
  const questionRequestIdRef = useRef(0);

  const totalQuestions = questionSet?.questions.length ?? 0;
  const trainingQuestionSet =
    training?.questionSets?.find((set) => set.status !== "CLOSED") ?? null;
  const totalOpenQuestions =
    totalQuestions + (trainingQuestionSet?.questions.length ?? 0);

  const loadTrainingCheckIn = async () => {
    setTrainingSelected({});
    setTrainingSubmitted(false);
    const response = await secureFetch(`${API_BASE}/user/training/current`, {
      credentials: "include",
    });
    if (response.ok) {
      setTraining((await response.json()) as TrainingPlan);
      return;
    }
    setTraining(null);
  };

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
      const nextAreaId =
        areaId ||
        (requestedAreaId && loadedAree.some((area) => area.id === requestedAreaId)
          ? requestedAreaId
          : "") ||
        firstOpen?.[0] ||
        loadedAree[0]?.id ||
        "";
      setAreaId(nextAreaId);
      setQuestionSet(nextQuestionSets[nextAreaId] ?? null);
    }
  };

  const loadQuestionSet = async (selectedAreaId = areaId) => {
    const requestId = questionRequestIdRef.current + 1;
    questionRequestIdRef.current = requestId;
    setLoading(true);
    setAuthHint(null);
    setMessage(null);
    setSubmitted(false);
    setSnapshot(null);
    setSelected({});

    if (!selectedAreaId) {
      if (questionRequestIdRef.current !== requestId) {
        return;
      }
      setQuestionSet(null);
      setMessage("Seleziona un'area per caricare il check-in.");
      setLoading(false);
      return;
    }

    const response = await secureFetch(
      `${API_BASE}/user/questions/current?areaId=${encodeURIComponent(selectedAreaId)}`,
      { credentials: "include" },
    );

    if (questionRequestIdRef.current !== requestId) {
      return;
    }

    if (!response.ok) {
      setQuestionSet(null);
      if (response.status === 401) {
        setAuthHint("Accedi per rispondere al check-in.");
      } else if (response.status >= 500) {
        setMessage("Impossibile caricare il check-in.");
      }
      setLoading(false);
      return;
    }

    const nextQuestionSet = (await response.json()) as QuestionSet;
    if (questionRequestIdRef.current !== requestId) {
      return;
    }
    setQuestionSet(nextQuestionSet);
    setLoading(false);
  };

  useEffect(() => {
    void (async () => {
      if (!(await redirectIfOnboardingRequired())) {
        await Promise.all([loadAree(), loadTrainingCheckIn()]);
      }
    })();
  }, []);

  useEffect(() => {
    if (areaId) {
      if (Object.prototype.hasOwnProperty.call(questionSetsByArea, areaId)) {
        questionRequestIdRef.current += 1;
        setAuthHint(null);
        setMessage(null);
        setSubmitted(false);
        setSnapshot(null);
        setSelected({});
        setQuestionSet(questionSetsByArea[areaId] ?? null);
        setLoading(false);
        return;
      }
      void loadQuestionSet(areaId);
    }
  }, [areaId, questionSetsByArea]);

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
    setMessage("Risposte inviate. Check-in chiuso e profilo aggiornato.");
    await loadAree();
  };

  const submitTrainingAnswers = async () => {
    if (!trainingQuestionSet) {
      return;
    }
    setMessage(null);

    const answers = trainingQuestionSet.questions.map((question) => ({
      questionId: question.id,
      answerOptionId: trainingSelected[question.id],
    }));

    if (answers.some((answer) => !answer.answerOptionId)) {
      setMessage("Rispondi a tutte le domande del check-in sportivo prima dell'invio.");
      return;
    }

    const response = await secureFetch(`${API_BASE}/answers/training/batch`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionSetId: trainingQuestionSet.id, answers }),
    });

    if (!response.ok) {
      setMessage("Le risposte del check-in sportivo non possono essere inviate. Potrebbero esistere gia.");
      return;
    }

    setTrainingSubmitted(true);
    setMessage("Check-in sportivo inviato.");
    await loadTrainingCheckIn();
  };

  return (
    <ProductShell
      eyebrow="Ambiente atleta"
      title="Check-in"
      description="Le misurazioni sono separate dalle attivita: rispondi qui ai check-in sportivi e per area."
      actions={
        <button
          className="pf-button-secondary"
          type="button"
          onClick={() => Promise.all([loadAree(), loadTrainingCheckIn()])}
        >
          Aggiorna
        </button>
      }
      stats={[
        {
          label: "Domande aperte",
          value: loading ? "..." : totalOpenQuestions,
          tone: "accent",
        },
      ]}
    >
      <section className="pf-panel pf-focus-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Check-in percorso sportivo</h2>
            <p className="pf-muted">
              Check-in del percorso complessivo legato a sport e specializzazione.
            </p>
          </div>
          {trainingQuestionSet && (
            <StatusBadge tone="warning">
              {trainingQuestionSet.questions.length} domande
            </StatusBadge>
          )}
        </div>

        <div className="pf-stack">
          {trainingQuestionSet?.questions.map((question) => (
            <article key={question.id} className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>
                    {question.orderIndex}. {question.text}
                  </h3>
                  <p className="pf-muted">
                    {training?.specialization
                      ? `${training.specialization.sport.label} / ${training.specialization.label}`
                      : "Percorso sportivo"}
                  </p>
                </div>
                {trainingSelected[question.id] && (
                  <StatusBadge tone="success">Risposta</StatusBadge>
                )}
              </div>
              <div className="pf-grid">
                {question.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={
                      trainingSelected[question.id] === option.id
                        ? "pf-button"
                        : "pf-button-secondary"
                    }
                    onClick={() =>
                      setTrainingSelected((prev) => ({
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

          {!trainingQuestionSet && (
            <p className="pf-plain-empty">Nessun check-in sportivo aperto.</p>
          )}
        </div>

        {trainingQuestionSet && (
          <div className="pf-actions" style={{ marginTop: 18 }}>
            <button
              className="pf-button"
              type="button"
              onClick={submitTrainingAnswers}
              disabled={trainingSubmitted}
            >
              {trainingSubmitted ? "Check-in inviato" : "Invia check-in sportivo"}
            </button>
          </div>
        )}
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Aree</h2>
            <p className="pf-muted">
              Le aree evidenziate hanno un check-in pubblicato in attesa di risposta.
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
                onClick={() => {
                  questionRequestIdRef.current += 1;
                  setAreaId(area.id);
                  setQuestionSet(set ?? null);
                  setAuthHint(null);
                  setMessage(null);
                  setSubmitted(false);
                  setSnapshot(null);
                  setSelected({});
                  setLoading(false);
                }}
              >
                <span>
                  <strong>{area.name}</strong>
                  <small>
                    {set
                      ? `${set.questions.length} ${set.questions.length === 1 ? "domanda" : "domande"} da rispondere`
                      : "Da assegnare"}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Check-in area</h2>
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
            <p className="pf-plain-empty">
              {areaId ? "Nessun check-in area aperto." : "Seleziona un'area."}
            </p>
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
              {submitted ? "Check-in inviato" : "Invia check-in area"}
            </button>
            {snapshot && (
              <StatusBadge tone="success">
                Ranking {snapshot.rankingGlobal}
              </StatusBadge>
            )}
          </div>
        )}
      </section>

    </ProductShell>
  );
}
