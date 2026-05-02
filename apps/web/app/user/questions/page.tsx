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

export default function UserQuestionsPage() {
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [questionSetsByArea, setQuestionSetsByArea] = useState<
    Record<string, QuestionSet | null>
  >({});

  const totalQuestions = questionSet?.questions.length ?? 0;
  const answeredCount = Object.keys(selected).length;
  const progress = useMemo(() => {
    if (!totalQuestions) {
      return "0%";
    }
    return `${Math.round((answeredCount / totalQuestions) * 100)}%`;
  }, [answeredCount, totalQuestions]);

  const loadAreas = async () => {
    const response = await secureFetch(`${API_BASE}/areas`, {
      credentials: "include",
    });
    if (response.ok) {
      const loadedAreas = (await response.json()) as Area[];
      setAreas(loadedAreas);
      const entries = await Promise.all(
        loadedAreas.map(async (area) => {
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
      setAreaId(
        (current) => current || firstOpen?.[0] || loadedAreas[0]?.id || "",
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
      setMessage("Select an area to load the questionnaire.");
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
        setAuthHint("Sign in to answer your questionnaire.");
      } else if (response.status === 404) {
        setMessage("No published questionnaire is available for this area.");
      } else {
        setMessage("Unable to load the questionnaire.");
      }
      setLoading(false);
      return;
    }

    setQuestionSet((await response.json()) as QuestionSet);
    setLoading(false);
  };

  useEffect(() => {
    void (async () => {
      if (!(await redirectIfOnboardingRequired())) {
        await loadAreas();
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
      setMessage("Answer all questions before submitting.");
      return;
    }

    const response = await secureFetch(`${API_BASE}/answers/batch`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionSetId: questionSet.id, answers }),
    });

    if (!response.ok) {
      setMessage("Answers could not be submitted. They may already exist.");
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
    setMessage("Answers submitted. Questionnaire closed and profile updated.");
    await loadAreas();
  };

  return (
    <ProductShell
      eyebrow="Athlete workspace"
      title="Area check-ins"
      description="Questionnaires are grouped by area. Submitting all answers closes the check-in and updates your profile automatically."
      actions={
        <button
          className="pf-button-secondary"
          type="button"
          onClick={() => loadAreas()}
        >
          Refresh areas
        </button>
      }
      stats={[
        {
          label: "Answered",
          value: `${answeredCount}/${totalQuestions}`,
          tone: "accent",
        },
        { label: "Progress", value: progress, tone: "success" },
        { label: "Status", value: questionSet?.status ?? "-", tone: "warning" },
      ]}
    >
      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Areas</h2>
            <p className="pf-muted">
              A highlighted area has a published questionnaire waiting for
              answers.
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
                      ? `${set.questions.length} questions ready`
                      : "No questionnaire"}
                  </small>
                </span>
                <StatusBadge tone={set ? "warning" : "neutral"}>
                  {set ? "To answer" : "Empty"}
                </StatusBadge>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Current check-in</h2>
            <p className="pf-muted">
              Choose the option that best reflects your current execution.
            </p>
          </div>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadQuestionSet()}
          >
            Refresh
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
                  <StatusBadge tone="success">Answered</StatusBadge>
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
              title={areaId ? "No questionnaire available" : "Select an area"}
              description={
                areaId
                  ? "A professional-approved questionnaire has not been published for this area yet."
                  : "Choose an area to load the current questionnaire."
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
              {submitted ? "Submitted and closed" : "Submit and close"}
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
