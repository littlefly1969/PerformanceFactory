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
type StarterQuestionario = {
  required: boolean;
  status: string;
  goalText?: string;
  interpretedGoal?: string | null;
  suggestedReformulatedGoal?: string | null;
  questionsToUser?: string[];
  nextStep?: string | null;
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
  status: "OK" | "NEEDS_ANAMNESIS" | "GOAL_NEEDS_REFORMULATION" | "OUT_OF_SCOPE" | "UNSAFE";
  accepted: boolean;
  canProceedToAnamnesis: boolean;
  interpretedGoal: string;
  userMessage: string;
  suggestedReformulatedGoal?: string | null;
  questionsToUser?: string[];
  nextStep?: string | null;
  rejectionReason?: string | null;
};
type GoalChatMessage = {
  role: "assistant" | "user";
  content: string;
};
type GoalRefinement = GoalValidation & {
  assistantMessage: string;
  refinedGoalText: string;
};
type MessageTone = "success" | "warning";

export default function OnboardingPage() {
  const [questionnaire, setQuestionario] = useState<StarterQuestionario | null>(null);
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
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalChatMessages, setGoalChatMessages] = useState<GoalChatMessage[]>([]);
  const [goalChatInput, setGoalChatInput] = useState("");
  const [refinedGoalDraft, setRefinedGoalDraft] = useState("");
  const [refiningGoal, setRefiningGoal] = useState(false);
  const [goalAssistantClosed, setGoalAssistantClosed] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const redirectTimeout = useRef<number | null>(null);

  const radarAree = useMemo(
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
    ? goalValidation?.canProceedToAnamnesis === true &&
      questionnaire.questions.every(
        (question) =>
          !question.required ||
          (answers[question.id] !== undefined && answers[question.id] !== ""),
      )
    : false;

  const loadQuestionario = async () => {
    setLoading(true);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/onboarding/questionnaire`);
    if (!response.ok) {
      setMessageTone("warning");
      setMessage(response.status === 401 ? "Accesso richiesto." : "Impossibile caricare il questionario iniziale.");
      setLoading(false);
      return;
    }
    const data = (await response.json()) as StarterQuestionario;
    setQuestionario(data);
    setGoalText(data.goalText ?? "");
    if (
      (data.validationStatus === "OK" || data.validationStatus === "NEEDS_ANAMNESIS") &&
      data.interpretedGoal
    ) {
      setGoalValidation({
        status: data.validationStatus,
        accepted: data.validationStatus === "OK",
        canProceedToAnamnesis: true,
        interpretedGoal: data.interpretedGoal,
        userMessage:
          data.validationMessage ??
          `Ho capito questo obiettivo: ${data.interpretedGoal}`,
        suggestedReformulatedGoal: data.suggestedReformulatedGoal ?? null,
        questionsToUser: data.questionsToUser ?? [],
        nextStep: data.nextStep ?? null,
      });
      setGoalAssistantClosed(true);
    }
    if (!data.required) {
      setMessageTone("success");
      setMessage("Questionario iniziale gia completato.");
    }
    setLoading(false);
  };

  const readError = async (response: Response) => {
    try {
      const data = (await response.json()) as { message?: string };
      return data.message ?? "Il questionario iniziale non puo essere salvato.";
    } catch {
      return "Il questionario iniziale non puo essere salvato.";
    }
  };

  const openGoalAssistant = (
    validation: GoalValidation,
    refinedDraft = goalText,
  ) => {
    const assistantMessage = [
      validation.userMessage,
      validation.questionsToUser?.length
        ? validation.questionsToUser.join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    setRefinedGoalDraft(
      validation.suggestedReformulatedGoal?.trim() || refinedDraft,
    );
    setGoalChatMessages([
      {
        role: "assistant",
        content:
          assistantMessage ||
          "Mi serve qualche informazione in piu per rendere l'obiettivo utilizzabile.",
      },
    ]);
    setGoalChatInput("");
    setGoalModalOpen(true);
  };

  const openGoalConfirmation = (
    validation: GoalValidation,
    refinedDraft = goalText,
  ) => {
    const draft =
      validation.suggestedReformulatedGoal?.trim() ||
      refinedDraft.trim() ||
      goalText.trim();
    setRefinedGoalDraft(draft);
    setGoalChatMessages([
      {
        role: "assistant",
        content: [
          validation.userMessage ||
            "L'obiettivo e valido e puo essere usato per proseguire.",
          "Vuoi aggiungere altri dettagli utili all'obiettivo prima di continuare? Puoi aggiungere solo informazioni sull'obiettivo, ad esempio risultato desiderato, misura, scadenza o punto di partenza.",
          "Se non vuoi aggiungere altro, conferma l'obiettivo e prosegui con il questionario.",
        ].join("\n\n"),
      },
    ]);
    setGoalChatInput("");
    setGoalAssistantClosed(false);
    setGoalModalOpen(true);
  };

  const validateGoal = async () => {
    const trimmed = goalText.trim();
    if (trimmed.length < 10) {
      setGoalValidation({
        status: "GOAL_NEEDS_REFORMULATION",
        accepted: false,
        canProceedToAnamnesis: false,
        interpretedGoal: "",
        userMessage:
          "Scrivi un obiettivo piu concreto legato a sport, allenamento o performance.",
        rejectionReason: "Obiettivo troppo breve.",
      });
      openGoalAssistant({
        status: "GOAL_NEEDS_REFORMULATION",
        accepted: false,
        canProceedToAnamnesis: false,
        interpretedGoal: "",
        userMessage:
          "Scrivi un obiettivo piu concreto legato a sport, allenamento o performance.",
        questionsToUser: [
          "Quale sport o attivita vuoi migliorare?",
          "Quale aspetto della performance vuoi cambiare?",
        ],
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
    setMessageTone(validation.canProceedToAnamnesis ? "success" : "warning");
    if (validation.canProceedToAnamnesis) {
      setMessage(validation.userMessage);
      openGoalConfirmation(validation, trimmed);
    } else {
      setMessage(null);
      openGoalAssistant(validation);
    }
    setValidatingGoal(false);
  };

  const refineGoal = async () => {
    const userReply = goalChatInput.trim();
    if (!userReply || refiningGoal) {
      return;
    }

    const nextMessages: GoalChatMessage[] = [
      ...goalChatMessages,
      { role: "user", content: userReply },
    ];
    setGoalChatMessages(nextMessages);
    setGoalChatInput("");
    setRefiningGoal(true);
    const response = await secureFetch(`${API_BASE}/onboarding/goal/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalGoal: goalText,
        currentDraft: refinedGoalDraft || goalText,
        messages: goalChatMessages,
        userReply,
      }),
    });
    if (!response.ok) {
      const errorText = await readError(response);
      setGoalChatMessages((current) => [
        ...current,
        { role: "assistant", content: errorText },
      ]);
      setRefiningGoal(false);
      return;
    }

    const refinement = (await response.json()) as GoalRefinement;
    setRefinedGoalDraft(refinement.refinedGoalText);
    setGoalValidation(refinement);
    setGoalChatMessages((current) => [
      ...current,
      {
        role: "assistant",
        content: refinement.assistantMessage || refinement.userMessage,
      },
    ]);
    if (refinement.canProceedToAnamnesis) {
      setMessageTone("success");
      setMessage(refinement.userMessage);
    }
    setRefiningGoal(false);
  };

  const useRefinedGoal = () => {
    const nextGoal = refinedGoalDraft.trim();
    if (!nextGoal || !goalValidation?.canProceedToAnamnesis) {
      return;
    }
    setGoalText(nextGoal);
    setGoalModalOpen(false);
    setGoalAssistantClosed(true);
    setMessageTone("success");
    setMessage(goalValidation.userMessage);
  };

  useEffect(() => {
    void loadQuestionario();

    return () => {
      if (redirectTimeout.current) {
        window.clearTimeout(redirectTimeout.current);
      }
    };
  }, []);

  const submit = async () => {
    if (!questionnaire || !completed) {
      setMessageTone("warning");
      setMessage("Rispondi a tutte le domande prima di continuare.");
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
      eyebrow="Onboarding atleta"
      title="Questionario iniziale di performance"
      description="Completa questa baseline prima di accedere all'ambiente atleta. Crea il primo grafico spider e il profilo iniziale per area."
      actions={
        result ? (
          <button className="pf-button" type="button" onClick={() => { window.location.href = "/user"; }}>
            Entra nell'ambiente
          </button>
        ) : null
      }
      stats={[
        { label: "Stato", value: loading ? "..." : questionnaire?.status ?? "-", tone: questionnaire?.required ? "warning" : "success" },
        { label: "Risposte", value: questionnaire ? `${Object.keys(answers).length}/${questionnaire.questions.length}` : "-", tone: "accent" },
        { label: "Obiettivo", value: goalText.trim() ? "OK" : "-", tone: goalText.trim() ? "success" : "warning" },
      ]}
    >
      {message && <div className={`pf-alert ${messageTone}`}>{message}</div>}

      <section className="pf-dashboard-grid">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>{questionnaire?.title ?? "Questionario"}</h2>
              <p className="pf-muted">{questionnaire?.description ?? "Caricamento..."}</p>
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
                  setGoalAssistantClosed(false);
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
                {goalValidation?.status === "OK" && (
                  <StatusBadge tone="success">Obiettivo valido</StatusBadge>
                )}
                {goalValidation?.status === "NEEDS_ANAMNESIS" && (
                  <StatusBadge tone="success">Serve anamnesi</StatusBadge>
                )}
                {goalValidation && !goalValidation.canProceedToAnamnesis && (
                  <StatusBadge tone="warning">Non consono</StatusBadge>
                )}
                {goalValidation?.canProceedToAnamnesis && (
                  <button
                    className="pf-button-secondary"
                    type="button"
                    onClick={() =>
                      openGoalConfirmation(
                        goalValidation,
                        refinedGoalDraft || goalText,
                      )
                    }
                  >
                    Riapri assistente AI
                  </button>
                )}
              </div>
              {goalValidation?.canProceedToAnamnesis && goalAssistantClosed && (
                <div className="pf-goal-validated-summary">
                  <div>
                    <span>Obiettivo validato</span>
                    <strong>{goalValidation.interpretedGoal}</strong>
                  </div>
                  <button
                    className="pf-button-secondary"
                    type="button"
                    onClick={() =>
                      openGoalConfirmation(
                        goalValidation,
                        refinedGoalDraft || goalText,
                      )
                    }
                  >
                    Aggiungi dettagli
                  </button>
                </div>
              )}
              {goalValidation?.canProceedToAnamnesis &&
                !goalAssistantClosed &&
                goalValidation?.interpretedGoal && (
                <div className="pf-alert success">
                  <strong>Cosa ha capito l AI</strong>
                  <p>{goalValidation.interpretedGoal}</p>
                </div>
              )}
              {goalValidation?.canProceedToAnamnesis &&
                !goalAssistantClosed &&
                goalValidation?.suggestedReformulatedGoal && (
                <div className="pf-alert warning">
                  <strong>Proposta di riformulazione</strong>
                  <p>{goalValidation.suggestedReformulatedGoal}</p>
                </div>
              )}
              {goalValidation?.canProceedToAnamnesis &&
              !goalAssistantClosed &&
              goalValidation?.questionsToUser?.length ? (
                <div className="pf-alert warning">
                  <strong>Domande utili</strong>
                  <ul>
                    {goalValidation.questionsToUser.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
              Continua all'ambiente
            </button>
          ) : (
            <button className="pf-button" type="button" disabled={!completed || submitting} onClick={submit}>
              {redirecting ? "Apertura ambiente..." : submitting ? "Salvataggio..." : "Crea baseline"}
            </button>
          )}
        </article>

        <aside className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Anteprima baseline</h2>
              <p className="pf-muted">Il grafico spider appare dopo il salvataggio del questionario iniziale.</p>
            </div>
          </div>
          <RadarChart areas={radarAree} />
        </aside>
      </section>
      {goalModalOpen && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal pf-goal-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Assistente obiettivo</p>
                <h2>Definisci meglio il tuo obiettivo</h2>
                <p className="pf-muted">
                  Rispondi solo alle informazioni richieste. L'AI mantiene il
                  contesto gia scritto e aggiorna progressivamente la bozza.
                </p>
              </div>
              <button
                className="pf-button-secondary"
                type="button"
                onClick={() => {
                  setGoalModalOpen(false);
                  if (goalValidation?.canProceedToAnamnesis) {
                    setGoalAssistantClosed(true);
                  }
                }}
              >
                Chiudi
              </button>
            </div>

            <div className="pf-goal-draft">
              <span>Bozza obiettivo</span>
              <strong>{refinedGoalDraft || goalText}</strong>
            </div>

            <div className="pf-goal-chat">
              {goalChatMessages.map((item, index) => (
                <div
                  key={`${item.role}-${index}`}
                  className={`pf-goal-message ${item.role}`}
                >
                  <span>{item.role === "assistant" ? "AI" : "Tu"}</span>
                  <p>{item.content}</p>
                </div>
              ))}
            </div>

            <label className="pf-field">
              {goalValidation?.canProceedToAnamnesis
                ? "Aggiungi dettagli all'obiettivo"
                : "Risposta"}
              <textarea
                className="pf-textarea"
                rows={3}
                value={goalChatInput}
                onChange={(event) => setGoalChatInput(event.target.value)}
                placeholder={
                  goalValidation?.canProceedToAnamnesis
                    ? "Opzionale: aggiungi un dettaglio su risultato, misura, scadenza o punto di partenza."
                    : "Rispondi solo alla domanda dell'AI, senza riscrivere tutto."
                }
              />
            </label>

            <div className="pf-actions">
              <button
                className="pf-button-secondary"
                type="button"
                disabled={refiningGoal || !goalChatInput.trim()}
                onClick={refineGoal}
              >
                {refiningGoal ? "Analisi..." : "Invia risposta"}
              </button>
              <button
                className="pf-button"
                type="button"
                disabled={!goalValidation?.canProceedToAnamnesis}
                onClick={useRefinedGoal}
              >
                Conferma e chiudi
              </button>
            </div>
          </section>
        </div>
      )}
    </ProductShell>
  );
}
