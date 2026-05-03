"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ProductShell, StatusBadge } from "@/app/components/product-shell";
import { RadarChart } from "@/app/components/radar-chart";
import { API_BASE, secureFetch } from "@/app/lib/api";

type StarterOption = { value: number; label: string };
type StarterQuestion = {
  id: string;
  key: string;
  scope: "GENERAL" | "AREA";
  areaId?: string | null;
  areaName?: string | null;
  text: string;
  helpText?: string | null;
  inputType: "TEXT" | "NUMBER" | "SELECT" | "SCORE";
  required: boolean;
  options: Array<{ value: string | number; label: string }>;
};
type StarterQuestionnaire = {
  required: boolean;
  status: string;
  title: string;
  description: string;
  options: StarterOption[];
  questions: StarterQuestion[];
};

type SubmitResult = {
  status: string;
  areas: Array<{ areaId: string; areaName: string; realR: number; potentialP: number }>;
};
type MessageTone = "success" | "warning";

export default function OnboardingPage() {
  const [questionnaire, setQuestionnaire] = useState<StarterQuestionnaire | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<MessageTone>("warning");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const redirectTimeout = useRef<number | null>(null);

  const radarAreas = useMemo(
    () =>
      result?.areas.map((area) => ({
        id: area.areaId,
        label: area.areaName,
        real: area.realR,
        potential: area.potentialP,
      })) ?? [],
    [result],
  );

  const completed = questionnaire
    ? questionnaire.questions.every(
        (question) =>
          !question.required ||
          (answers[question.id] !== undefined && answers[question.id] !== ""),
      )
    : false;

  const loadQuestionnaire = async () => {
    setLoading(true);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/onboarding/questionnaire`);
    if (!response.ok) {
      setMessageTone("warning");
      setMessage(response.status === 401 ? "Login required." : "Unable to load starter questionnaire.");
      setLoading(false);
      return;
    }
    const data = (await response.json()) as StarterQuestionnaire;
    setQuestionnaire(data);
    if (!data.required) {
      setMessageTone("success");
      setMessage("Starter questionnaire already completed.");
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadQuestionnaire();

    return () => {
      if (redirectTimeout.current) {
        window.clearTimeout(redirectTimeout.current);
      }
    };
  }, []);

  const submit = async () => {
    if (!questionnaire || !completed) {
      setMessageTone("warning");
      setMessage("Answer all questions before continuing.");
      return;
    }

    setSubmitting(true);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/onboarding/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: questionnaire.questions.map((question) => ({
          questionId: question.id,
          value: answers[question.id],
        })),
      }),
    });

    if (!response.ok) {
      setMessageTone("warning");
      setMessage("Starter questionnaire could not be saved.");
      setSubmitting(false);
      return;
    }

    setResult((await response.json()) as SubmitResult);
    setMessageTone("success");
    setMessage("Anamnesi iniziale creata. Apertura ambiente atleta...");
    setSubmitting(false);
    setRedirecting(true);
    redirectTimeout.current = window.setTimeout(() => {
      window.location.href = "/user";
    }, 1200);
  };

  return (
    <ProductShell
      eyebrow="Athlete onboarding"
      title="Starter performance questionnaire"
      description="Complete this baseline before opening the athlete workspace. It creates your first spider chart and initial area profile."
      actions={
        result ? (
          <button className="pf-button" type="button" onClick={() => { window.location.href = "/user"; }}>
            Enter workspace
          </button>
        ) : null
      }
      stats={[
        { label: "Status", value: loading ? "..." : questionnaire?.status ?? "-", tone: questionnaire?.required ? "warning" : "success" },
        { label: "Answered", value: questionnaire ? `${Object.keys(answers).length}/${questionnaire.questions.length}` : "-", tone: "accent" },
        { label: "Access", value: result || questionnaire?.required === false ? "Ready" : "Locked", tone: result ? "success" : "warning" },
      ]}
    >
      {message && <div className={`pf-alert ${messageTone}`}>{message}</div>}

      <section className="pf-dashboard-grid">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>{questionnaire?.title ?? "Questionnaire"}</h2>
              <p className="pf-muted">{questionnaire?.description ?? "Loading..."}</p>
            </div>
            {questionnaire && <StatusBadge tone={questionnaire.required ? "warning" : "success"}>{questionnaire.status}</StatusBadge>}
          </div>

          <div className="pf-stack">
            {questionnaire?.questions.map((question) => (
              <article key={question.id} className="pf-card">
                <div className="pf-card-top">
                  <div>
                    <h3>{question.scope === "GENERAL" ? "Generale" : question.areaName}</h3>
                    <p className="pf-muted">{question.text}</p>
                    {question.helpText && (
                      <p className="pf-muted">{question.helpText}</p>
                    )}
                  </div>
                  {answers[question.id] !== undefined && answers[question.id] !== "" && (
                    <StatusBadge tone="success">OK</StatusBadge>
                  )}
                </div>
                {question.inputType === "TEXT" && (
                  <textarea
                    className="pf-textarea"
                    value={String(answers[question.id] ?? "")}
                    onChange={(event) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [question.id]: event.target.value,
                      }))
                    }
                    rows={3}
                  />
                )}
                {question.inputType === "NUMBER" && (
                  <input
                    className="pf-input"
                    type="number"
                    value={String(answers[question.id] ?? "")}
                    onChange={(event) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [question.id]: Number(event.target.value),
                      }))
                    }
                  />
                )}
                {question.inputType === "SELECT" && (
                  <select
                    className="pf-select"
                    value={String(answers[question.id] ?? "")}
                    onChange={(event) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [question.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Seleziona</option>
                    {question.options.map((option) => (
                      <option key={String(option.value)} value={String(option.value)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
                {question.inputType === "SCORE" && (
                  <div className="pf-option-grid">
                    {(question.options.length ? question.options : questionnaire.options).map((option) => (
                      <button
                        key={String(option.value)}
                        type="button"
                        className={answers[question.id] === option.value ? "pf-button" : "pf-button-secondary"}
                        onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: option.value }))}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>

          {questionnaire?.required === false ? (
            <button className="pf-button" type="button" onClick={() => { window.location.href = "/user"; }}>
              Continue to workspace
            </button>
          ) : (
            <button className="pf-button" type="button" disabled={!completed || submitting} onClick={submit}>
              {redirecting ? "Opening workspace..." : submitting ? "Saving..." : "Create baseline"}
            </button>
          )}
        </article>

        <aside className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Baseline preview</h2>
              <p className="pf-muted">The spider appears after saving the starter questionnaire.</p>
            </div>
          </div>
          <RadarChart areas={radarAreas} />
        </aside>
      </section>
    </ProductShell>
  );
}
