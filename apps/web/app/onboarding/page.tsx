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
  goalText?: string;
  interpretedGoal?: string | null;
  validationStatus?: string;
  validationMessage?: string | null;
  title: string;
  description: string;
  options: StarterOption[];
  questions: StarterQuestion[];
};

type SubmitResult = {
  status: string;
  goalValidation?: {
    interpretedGoal: string;
    userMessage: string;
  };
  areas: Array<{ areaId: string; areaName: string; realR: number; potentialP: number }>;
};
type GoalValidation = {
  accepted: boolean;
  interpretedGoal: string;
  userMessage: string;
  rejectionReason?: string | null;
};
type MessageTone = "success" | "warning";

export default function OnboardingPage() {
  const [questionnaire, setQuestionnaire] = useState<StarterQuestionnaire | null>(null);
  const [goalText, setGoalText] = useState("");
  const [goalValidation, setGoalValidation] =
    useState<GoalValidation | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<MessageTone>("warning");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validatingGoal, setValidatingGoal] = useState(false);
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
    ? goalValidation?.accepted === true &&
      questionnaire.questions.every(
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
    setGoalText(data.goalText ?? "");
    if (data.validationStatus === "ACCEPTED" && data.interpretedGoal) {
      setGoalValidation({
        accepted: true,
        interpretedGoal: data.interpretedGoal,
        userMessage:
          data.validationMessage ??
          `Ho capito questo obiettivo: ${data.interpretedGoal}`,
      });
    }
    if (!data.required) {
      setMessageTone("success");
      setMessage("Starter questionnaire already completed.");
    }
    setLoading(false);
  };

  const readError = async (response: Response) => {
    try {
      const data = (await response.json()) as { message?: string };
      return data.message ?? "Starter questionnaire could not be saved.";
    } catch {
      return "Starter questionnaire could not be saved.";
    }
  };

  const validateGoal = async () => {
    const trimmed = goalText.trim();
    if (trimmed.length < 10) {
      setGoalValidation({
        accepted: false,
        interpretedGoal: "",
        userMessage:
          "Scrivi un obiettivo piu concreto legato a sport, allenamento o performance.",
        rejectionReason: "Obiettivo troppo breve.",
      });
      return;
    }

    setValidatingGoal(true);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/onboarding/goal/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalText: trimmed }),
    });
    if (!response.ok) {
      setMessageTone("warning");
      setMessage("Validazione obiettivo non disponibile.");
      setValidatingGoal(false);
      return;
    }
    const validation = (await response.json()) as GoalValidation;
    setGoalValidation(validation);
    setMessageTone(validation.accepted ? "success" : "warning");
    setMessage(validation.userMessage);
    setValidatingGoal(false);
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
        goalText,
        answers: questionnaire.questions.map((question) => ({
          questionId: question.id,
          value: answers[question.id],
        })),
      }),
    });

    if (!response.ok) {
      setMessageTone("warning");
      setMessage(await readError(response));
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
        { label: "Obiettivo", value: goalText.trim() ? "OK" : "-", tone: goalText.trim() ? "success" : "warning" },
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
            <article className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>Obiettivo personale</h3>
                  <p className="pf-muted">
                    Descrivi perche stai usando PerformanceFactory. Questo testo
                    personalizza i prompt AI per ogni area.
                  </p>
                </div>
                {goalText.trim().length >= 10 && <StatusBadge tone="success">OK</StatusBadge>}
              </div>
              <textarea
                className="pf-textarea"
                rows={4}
                value={goalText}
                onChange={(event) => {
                  setGoalText(event.target.value);
                  setGoalValidation(null);
                }}
                placeholder="Esempio: voglio migliorare continuita, prevenire cali fisici e arrivare piu preparato alle gare."
              />
              <div className="pf-actions">
                <button
                  className="pf-button-secondary"
                  type="button"
                  disabled={validatingGoal || goalText.trim().length < 10}
                  onClick={validateGoal}
                >
                  {validatingGoal ? "Validazione..." : "Valida obiettivo"}
                </button>
                {goalValidation?.accepted && (
                  <StatusBadge tone="success">Obiettivo valido</StatusBadge>
                )}
                {goalValidation && !goalValidation.accepted && (
                  <StatusBadge tone="warning">Non consono</StatusBadge>
                )}
              </div>
              {goalValidation?.interpretedGoal && (
                <div className="pf-alert success">
                  <strong>Cosa ha capito l AI</strong>
                  <p>{goalValidation.interpretedGoal}</p>
                </div>
              )}
              {goalValidation && !goalValidation.accepted && (
                <div className="pf-alert warning">
                  {goalValidation.userMessage}
                </div>
              )}
            </article>
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
