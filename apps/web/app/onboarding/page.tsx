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
  sportSelection?: SportSelection | null;
  sportOptions?: SportOption[];
  fitnessLocationOptions?: SportOption[];
  goalText?: string;
  interpretedGoal?: string | null;
  suggestedReformulatedGoal?: string | null;
  questionsToUser?: string[];
  nextStep?: string | null;
  validationStatus?: string;
  validationMessage?: string | null;
  goalFrozenAt?: string | null;
  title: string;
  description: string;
  options: StarterOption[];
  questions: StarterQuestion[];
};

type SubmitResult = {
  status: string;
  goalValidation?: {
    status?: GoalValidation["status"];
    interpretedGoal: string;
    userMessage: string;
  };
  areas: Array<{ areaId: string; areaName: string; realR: number; potentialP: number }>;
};
type GoalRiskResponse = {
  code?: string;
  message?: string;
  goalValidation?: Partial<GoalValidation> & {
    userMessage?: string;
  };
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
type SportOption = { key: string; label: string };
type SportSelection = {
  sports: string[];
  fitnessLocation: string | null;
  label?: string;
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
type FlowStep = "ANAMNESIS" | "GOAL";

export default function OnboardingPage() {
  const [questionnaire, setQuestionario] = useState<StarterQuestionario | null>(null);
  const [goalText, setGoalText] = useState("");
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [fitnessLocation, setFitnessLocation] = useState("");
  const [sportSelectionSaved, setSportSelectionSaved] = useState(false);
  const [goalValidation, setGoalValidation] =
    useState<GoalValidation | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<MessageTone>("warning");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validatingGoal, setValidatingGoal] = useState(false);
  const [generatingSpecialistQuestions, setGeneratingSpecialistQuestions] =
    useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalChatMessages, setGoalChatMessages] = useState<GoalChatMessage[]>([]);
  const [goalChatInput, setGoalChatInput] = useState("");
  const [refinedGoalDraft, setRefinedGoalDraft] = useState("");
  const [refiningGoal, setRefiningGoal] = useState(false);
  const [goalAssistantClosed, setGoalAssistantClosed] = useState(false);
  const [flowStep, setFlowStep] = useState<FlowStep>("ANAMNESIS");
  const [goalRiskModalOpen, setGoalRiskModalOpen] = useState(false);
  const [pendingGoalRisk, setPendingGoalRisk] = useState<GoalRiskResponse | null>(null);
  const [goalRiskAcknowledged, setGoalRiskAcknowledged] = useState(false);
  const [finalGoalValidated, setFinalGoalValidated] = useState(false);
  const [validatingFinalGoal, setValidatingFinalGoal] = useState(false);
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

  const goalIsValidated = goalValidation?.canProceedToAnamnesis === true;
  const generalQuestions = useMemo(
    () =>
      questionnaire?.questions.filter(
        (question) => question.scope === "GENERAL",
      ) ?? [],
    [questionnaire?.questions],
  );
  const specialistQuestions = useMemo(
    () =>
      questionnaire?.questions.filter((question) => question.scope === "AREA") ??
      [],
    [questionnaire?.questions],
  );
  const specialistQuestionsGenerated = specialistQuestions.length > 0;
  const visibleQuestions =
    flowStep === "ANAMNESIS" ? generalQuestions : specialistQuestions;
  const goalReady = sportSelectionSaved && goalText.trim().length >= 10;
  const goalConfirmed = goalReady && goalAssistantClosed;
  const sportOptions = questionnaire?.sportOptions ?? [
    { key: "CYCLING", label: "Ciclismo" },
    { key: "RUNNING", label: "Corsa" },
    { key: "TENNIS", label: "Tennis" },
    { key: "PADEL", label: "Padel" },
    { key: "FITNESS", label: "Fitness" },
  ];
  const fitnessLocationOptions = questionnaire?.fitnessLocationOptions ?? [
    { key: "HOME", label: "In casa" },
    { key: "GYM", label: "In palestra" },
    { key: "MIXED", label: "Misto" },
  ];
  const sportSelectionValid =
    selectedSports.length > 0 &&
    selectedSports.length <= 2 &&
    (!selectedSports.includes("FITNESS") || Boolean(fitnessLocation));
  const generalAnswersComplete =
    generalQuestions.length > 0 &&
    generalQuestions.every(
      (question) =>
        !question.required ||
        (answers[question.id] !== undefined && answers[question.id] !== ""),
    );
  const generalComplete = sportSelectionSaved && generalAnswersComplete;
  const completed = questionnaire
    ? goalConfirmed &&
      specialistQuestionsGenerated &&
      questionnaire.questions.every(
        (question) =>
          !question.required ||
          (answers[question.id] !== undefined && answers[question.id] !== ""),
      )
    : false;
  const canCreatePerformance = completed && finalGoalValidated;
  const specialistScoreOptions: StarterOption[] = [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4" },
    { value: 5, label: "5" },
  ];

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
    setSelectedSports(data.sportSelection?.sports ?? []);
    setFitnessLocation(data.sportSelection?.fitnessLocation ?? "");
    setSportSelectionSaved(Boolean(data.sportSelection?.sports?.length));
    setGoalAssistantClosed(Boolean(data.goalText));
    setFinalGoalValidated(Boolean(data.goalFrozenAt));
    setFlowStep(
      data.goalText || data.questions.some((question) => question.scope === "AREA")
        ? "GOAL"
        : "ANAMNESIS",
    );
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

  const openGoalRevisionFromRisk = () => {
    const riskValidation = pendingGoalRisk?.goalValidation;
    const userMessage =
      riskValidation?.userMessage ??
      pendingGoalRisk?.message ??
      "L'obiettivo non risulta realistico rispetto alle risposte attuali.";
    setGoalValidation({
      status: "GOAL_NEEDS_REFORMULATION",
      accepted: false,
      canProceedToAnamnesis: false,
      interpretedGoal: riskValidation?.interpretedGoal ?? goalText,
      userMessage,
      suggestedReformulatedGoal:
        riskValidation?.suggestedReformulatedGoal ?? null,
      questionsToUser: riskValidation?.questionsToUser ?? [
        "Vuoi ridurre il risultato atteso, modificare i tempi o trasformarlo in un obiettivo intermedio?",
      ],
      nextStep: riskValidation?.nextStep ?? null,
      rejectionReason: riskValidation?.rejectionReason ?? null,
    });
    setRefinedGoalDraft(
      riskValidation?.suggestedReformulatedGoal?.trim() || goalText,
    );
    setGoalChatMessages([
      {
        role: "assistant",
        content: [
          userMessage,
          "Possiamo riformulare l'obiettivo mantenendo l'idea di allenarti al massimo, ma rendendolo piu coerente con i dati attuali.",
          riskValidation?.questionsToUser?.length
            ? riskValidation.questionsToUser.join("\n")
            : "Dimmi cosa vuoi modificare: risultato atteso, tempi, frequenza o livello di partenza.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ]);
    setGoalChatInput("");
    setGoalRiskAcknowledged(false);
    setFinalGoalValidated(false);
    setPendingGoalRisk(null);
    setGoalRiskModalOpen(false);
    setGoalAssistantClosed(false);
    setGoalModalOpen(true);
  };

  const confirmSuggestedGoalFromRisk = async () => {
    const suggestedGoal =
      pendingGoalRisk?.goalValidation?.suggestedReformulatedGoal?.trim();
    if (!suggestedGoal) {
      return;
    }
    setGoalText(suggestedGoal);
    setGoalRiskModalOpen(false);
    setPendingGoalRisk(null);
    setGoalRiskAcknowledged(false);
    setGoalAssistantClosed(true);
    await validateFinalGoal(suggestedGoal);
  };

  const toggleSport = (sportKey: string) => {
    setSelectedSports((current) => {
      const next = current.includes(sportKey)
        ? current.filter((item) => item !== sportKey)
        : current.length < 2
          ? [...current, sportKey]
          : current;
      if (!next.includes("FITNESS")) {
        setFitnessLocation("");
      } else if (!fitnessLocation) {
        setFitnessLocation("HOME");
      }
      setSportSelectionSaved(false);
      setGoalValidation(null);
      return next;
    });
  };

  const saveSportSelection = async () => {
    if (!sportSelectionValid) {
      setMessageTone("warning");
      setMessage("Seleziona uno o due sport. Per fitness indica casa, palestra o misto.");
      return false;
    }
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/onboarding/sport-selection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sports: selectedSports,
        fitnessLocation: selectedSports.includes("FITNESS")
          ? fitnessLocation
          : null,
      }),
    });
    if (!response.ok) {
      setMessageTone("warning");
      setMessage(await readError(response));
      return false;
    }
    const saved = (await response.json()) as SportSelection;
    setSelectedSports(saved.sports);
    setFitnessLocation(saved.fitnessLocation ?? "");
    setSportSelectionSaved(true);
    setMessageTone("success");
    setMessage("Sport salvato. Ora completa l'anamnesi.");
    return true;
  };

  const setQuestionAnswer = (questionId: string, value: string | number) => {
    setGoalRiskAcknowledged(false);
    setFinalGoalValidated(false);
    setPendingGoalRisk(null);
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const confirmAnamnesis = async () => {
    if (!sportSelectionValid) {
      setMessageTone("warning");
      setMessage("Seleziona uno o due sport prima di confermare.");
      return;
    }
    if (!sportSelectionSaved) {
      const saved = await saveSportSelection();
      if (!saved) {
        return;
      }
    }
    if (!generalAnswersComplete) {
      setMessageTone("warning");
      setMessage("Completa tutte le domande anamnestiche generali prima di continuare.");
      return;
    }
    setFlowStep("GOAL");
    setMessageTone("success");
    setMessage("Anamnesi confermata. Ora definisci l'obiettivo.");
  };

  const confirmGoalContext = async () => {
    if (!sportSelectionSaved) {
      const saved = await saveSportSelection();
      if (!saved) {
        return;
      }
    }
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
    setGoalValidation(null);
    setGoalAssistantClosed(true);
    setGoalRiskAcknowledged(false);
    setFinalGoalValidated(false);
    setPendingGoalRisk(null);
    setMessageTone("success");
    setMessage(
      "Obiettivo acquisito. Ora puoi generare le domande specialistiche: la validazione AI verra fatta alla fine con tutti i dati.",
    );
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

  const useRefinedGoal = async () => {
    const nextGoal = refinedGoalDraft.trim();
    if (!nextGoal || !goalValidation?.canProceedToAnamnesis) {
      return;
    }
    setGoalText(nextGoal);
    setGoalModalOpen(false);
    setGoalAssistantClosed(true);
    setMessageTone("success");
    setMessage(goalValidation.userMessage);
    if (completed) {
      await validateFinalGoal(nextGoal);
    }
  };

  const generateSpecialistQuestions = async () => {
    if (!questionnaire || !generalComplete) {
      setMessageTone("warning");
      setMessage(
        "Completa prima anamnesi generale e obiettivo per generare le domande specialistiche.",
      );
      return;
    }
    setGeneratingSpecialistQuestions(true);
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/onboarding/specialist-questions/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalText: goalText.trim(),
          answers: generalQuestions.map((question) => ({
            questionId: question.id,
            value: answers[question.id],
          })),
        }),
      },
    );
    if (!response.ok) {
      setMessageTone("warning");
      setMessage(await readError(response));
      setGeneratingSpecialistQuestions(false);
      return;
    }
    const data = (await response.json()) as {
      questions: StarterQuestion[];
    };
    setQuestionario((current) =>
      current ? { ...current, questions: data.questions } : current,
    );
    setFinalGoalValidated(false);
    setGoalRiskAcknowledged(false);
    setPendingGoalRisk(null);
    setMessageTone("success");
    setMessage(
      "Domande specialistiche generate in base all'obiettivo e salvate sulla base dati.",
    );
    setGeneratingSpecialistQuestions(false);
  };

  const validateFinalGoal = async (goalOverride?: string) => {
    if (!questionnaire || !completed) {
      setMessageTone("warning");
      setMessage("Completa tutte le risposte prima di validare l'obiettivo.");
      return;
    }

    const goalForValidation =
      typeof goalOverride === "string" ? goalOverride : goalText;
    setValidatingFinalGoal(true);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/onboarding/goal/final-validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalText: goalForValidation,
        answers: questionnaire.questions.map((question) => ({
          questionId: question.id,
          value: answers[question.id],
        })),
      }),
    });

    if (!response.ok) {
      if (response.status === 409) {
        const risk = (await response.json()) as GoalRiskResponse;
        if (risk.code === "GOAL_RISK_ACK_REQUIRED") {
          setPendingGoalRisk(risk);
          setGoalRiskModalOpen(true);
          setValidatingFinalGoal(false);
          return;
        }
        setMessageTone("warning");
        setMessage(risk.message ?? "Validazione obiettivo non disponibile.");
        setValidatingFinalGoal(false);
        return;
      }
      setMessageTone("warning");
      setMessage(await readError(response));
      setValidatingFinalGoal(false);
      return;
    }

    const validation = (await response.json()) as GoalValidation;
    setGoalText(goalForValidation);
    setGoalValidation(validation);
    setFinalGoalValidated(true);
    setGoalRiskAcknowledged(false);
    setMessageTone("success");
    setMessage(validation.userMessage || "Obiettivo validato. Ora puoi creare la performance.");
    setValidatingFinalGoal(false);
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
      title={flowStep === "ANAMNESIS" ? "Anamnesi iniziale" : "Definizione obiettivo"}
      description={
        flowStep === "ANAMNESIS"
          ? "Completa sport e dati anamnestici. L'obiettivo viene definito nello step successivo."
          : "Definisci l'obiettivo usando i dati appena inseriti; l'AI validera il realismo alla fine."
      }
      actions={
        result ? (
          <button className="pf-button" type="button" onClick={() => { window.location.href = "/user"; }}>
            Entra nell'ambiente
          </button>
        ) : null
      }
      stats={[
        { label: "Stato", value: loading ? "..." : questionnaire?.status ?? "-", tone: questionnaire?.required ? "warning" : "success" },
        {
          label: "Sport",
          value: selectedSports.length ? selectedSports.length : "-",
          tone: sportSelectionSaved ? "success" : "warning",
        },
        { label: "Risposte", value: questionnaire ? `${Object.keys(answers).length}/${questionnaire.questions.length}` : "-", tone: "accent" },
        {
          label: "Obiettivo",
          value:
            flowStep === "ANAMNESIS"
              ? "Dopo anamnesi"
              : goalConfirmed
                ? "Pronto"
                : goalText.trim()
                  ? "Da confermare"
                  : "-",
          tone: goalConfirmed ? "success" : "warning",
        },
      ]} 
    >
      {message && <div className={`pf-alert ${messageTone}`}>{message}</div>}

      <section className="pf-dashboard-grid">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>
                {flowStep === "ANAMNESIS"
                  ? questionnaire?.title ?? "Questionario"
                  : "Definizione dell'obiettivo"}
              </h2>
              <p className="pf-muted">
                {flowStep === "ANAMNESIS"
                  ? questionnaire?.description ?? "Caricamento..."
                  : "Ora usa l'anamnesi come contesto: l'obiettivo guidera le domande specialistiche e sara validato alla fine."}
              </p>
            </div>
            {questionnaire && <StatusBadge tone={questionnaire.required ? "warning" : "success"}>{questionnaire.status}</StatusBadge>}
          </div>

          <div className="pf-stack">
            {flowStep === "ANAMNESIS" && (
            <article className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>Sport</h3>
                  <p className="pf-muted">
                    Seleziona fino a due sport. Se scegli fitness indica il
                    contesto di allenamento.
                  </p>
                </div>
                {sportSelectionSaved && (
                  <StatusBadge tone="success">Salvato</StatusBadge>
                )}
              </div>
              <div className="pf-option-grid">
                {sportOptions.map((sport) => (
                  <button
                    key={sport.key}
                    type="button"
                    className={
                      selectedSports.includes(sport.key)
                        ? "pf-button"
                        : "pf-button-secondary"
                    }
                    disabled={
                      !selectedSports.includes(sport.key) &&
                      selectedSports.length >= 2
                    }
                    onClick={() => toggleSport(sport.key)}
                  >
                    {sport.label}
                  </button>
                ))}
              </div>
              {selectedSports.includes("FITNESS") && (
                <label className="pf-field">
                  Dove fai fitness
                  <select
                    className="pf-select"
                    value={fitnessLocation}
                    onChange={(event) => {
                      setFitnessLocation(event.target.value);
                      setSportSelectionSaved(false);
                      setGoalValidation(null);
                    }}
                  >
                    <option value="">Seleziona</option>
                    {fitnessLocationOptions.map((location) => (
                      <option key={location.key} value={location.key}>
                        {location.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="pf-actions">
                <button
                  className="pf-button-secondary"
                  type="button"
                  disabled={!sportSelectionValid}
                  onClick={saveSportSelection}
                >
                  Salva sport
                </button>
              </div>
            </article>
            )}

            {flowStep === "GOAL" && (
            <article className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>Obiettivo</h3>
                  <p className="pf-muted">
                    Definisci l'obiettivo dopo aver completato l'anamnesi
                    generale.
                  </p>
                </div>
                {goalConfirmed && (
                  <StatusBadge tone="success">Pronto</StatusBadge>
                )}
              </div>
              {!goalIsValidated && (
                <textarea
                  className="pf-textarea"
                  rows={4}
                  value={goalText}
                  onChange={(event) => {
                    setGoalText(event.target.value);
                    setGoalValidation(null);
                    setGoalAssistantClosed(false);
                    setGoalRiskAcknowledged(false);
                    setFinalGoalValidated(false);
                    setPendingGoalRisk(null);
                  }}
                  placeholder="Esempio: voglio migliorare continuita, prevenire cali fisici e arrivare piu preparato alle gare."
                />
              )}
              {!goalIsValidated && (
                <div className="pf-actions">
                  <button
                    className="pf-button-secondary"
                    type="button"
                    disabled={
                      validatingGoal ||
                      goalText.trim().length < 10 ||
                      !sportSelectionValid
                    }
                    onClick={confirmGoalContext}
                  >
                    Conferma obiettivo
                  </button>
                  {goalValidation && !goalValidation.canProceedToAnamnesis && (
                    <StatusBadge tone="warning">Non consono</StatusBadge>
                  )}
                </div>
              )}
              {goalConfirmed && !goalValidation && (
                <div className="pf-goal-validated-summary">
                  <div>
                    <span>Validazione finale</span>
                    <strong>
                      L'AI valutera realismo e coerenza dopo le risposte
                      anamnestiche.
                    </strong>
                  </div>
                </div>
              )}
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
            )}
            {visibleQuestions.map((question) => {
              const questionLocked =
                specialistQuestionsGenerated && question.scope === "GENERAL";
              return (
              <article key={question.id} className="pf-card">
                <div className="pf-card-top">
                  <div>
                    {question.scope === "AREA" && <h3>{question.areaName}</h3>}
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
                    readOnly={questionLocked}
                    onChange={(event) =>
                      questionLocked
                        ? undefined
                        :
                      setQuestionAnswer(question.id, event.target.value)
                    }
                    rows={3}
                  />
                )}
                {question.inputType === "NUMBER" && (
                  <input
                    className="pf-input"
                    type="number"
                    value={String(answers[question.id] ?? "")}
                    readOnly={questionLocked}
                    onChange={(event) =>
                      questionLocked
                        ? undefined
                        :
                      setQuestionAnswer(question.id, Number(event.target.value))
                    }
                  />
                )}
                {question.inputType === "SELECT" && (
                  <select
                    className="pf-select"
                    value={String(answers[question.id] ?? "")}
                    disabled={questionLocked}
                    onChange={(event) =>
                      setQuestionAnswer(question.id, event.target.value)
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
                    {(question.scope === "AREA"
                      ? specialistScoreOptions
                      : question.options.length
                        ? question.options
                        : questionnaire?.options ?? []
                    ).map((option) => (
                      <button
                        key={String(option.value)}
                        type="button"
                        className={answers[question.id] === option.value ? "pf-button" : "pf-button-secondary"}
                        disabled={questionLocked}
                        onClick={() => setQuestionAnswer(question.id, option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </article>
              );
            })}
          </div>

          {questionnaire &&
            flowStep === "GOAL" &&
            goalConfirmed &&
            !specialistQuestionsGenerated && (
              <div className="pf-submit-row">
                <article className="pf-card pf-next-step-card">
                  <div className="pf-card-top">
                    <div>
                      <h3>Domande specialistiche AI</h3>
                      <p className="pf-muted">
                        Dopo l'anamnesi generale, l'AI genera tre domande per
                        ogni area per raccogliere dati utili a verificare anche
                        il realismo dell'obiettivo finale.
                      </p>
                    </div>
                    <StatusBadge tone={generalComplete ? "accent" : "warning"}>
                      {generalComplete ? "Pronte" : "Completa generale"}
                    </StatusBadge>
                  </div>
                  <button
                    className="pf-button"
                    type="button"
                    disabled={!generalComplete || generatingSpecialistQuestions}
                    onClick={generateSpecialistQuestions}
                  >
                    {generatingSpecialistQuestions
                      ? "Generazione..."
                      : "Genera domande di realismo e area"}
                  </button>
                </article>
              </div>
            )}

          {questionnaire &&
            flowStep === "GOAL" &&
            specialistQuestionsGenerated && (
              <div className="pf-submit-row">
                <article className="pf-card pf-next-step-card">
                  <div className="pf-card-top">
                    <div>
                      <h3>Validazione finale obiettivo</h3>
                      <p className="pf-muted">
                        L'AI valuta l'obiettivo usando anamnesi e risposte
                        specialistiche. Se non risulta realistico devi prendere
                        visione prima della creazione finale.
                      </p>
                    </div>
                    <StatusBadge tone={finalGoalValidated ? "success" : completed ? "accent" : "warning"}>
                      {finalGoalValidated
                        ? goalRiskAcknowledged
                          ? "Presa visione"
                          : "Validato"
                        : completed
                          ? "Pronta"
                          : "Completa risposte"}
                    </StatusBadge>
                  </div>
                  <button
                    className="pf-button-secondary"
                    type="button"
                    disabled={!completed || validatingFinalGoal || finalGoalValidated}
                    onClick={() => void validateFinalGoal()}
                  >
                    {validatingFinalGoal ? "Validazione..." : "Valida obiettivo"}
                  </button>
                </article>
              </div>
            )}

          {questionnaire?.required === false ? (
            <button className="pf-button" type="button" onClick={() => { window.location.href = "/user"; }}>
              Continua all'ambiente
            </button>
          ) : flowStep === "ANAMNESIS" ? (
            <div className="pf-submit-row">
              <button
                className="pf-button"
                type="button"
                disabled={!sportSelectionValid || !generalAnswersComplete}
                onClick={confirmAnamnesis}
              >
                Conferma
              </button>
            </div>
          ) : (
            <div className="pf-submit-row">
              <button className="pf-button" type="button" disabled={!canCreatePerformance || submitting} onClick={submit}>
                {redirecting
                  ? "Apertura ambiente..."
                  : submitting
                    ? "Salvataggio..."
                    : "Crea la performance"}
              </button>
            </div>
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
      {goalRiskModalOpen && pendingGoalRisk && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal pf-goal-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Validazione obiettivo</p>
                <h2>Obiettivo non realistico</h2>
                <p className="pf-muted">
                  L'AI ha valutato l'obiettivo rispetto alle risposte inserite.
                </p>
              </div>
            </div>

            <div className="pf-alert warning">
              <strong>Valutazione AI</strong>
              <p>
                {pendingGoalRisk.goalValidation?.userMessage ??
                  pendingGoalRisk.message ??
                  "Date le risposte attuali, l'obiettivo non risulta realistico."}
              </p>
              <p>
                Puoi procedere con la performance, ma l'obiettivo viene salvato
                come irrealistico rispetto ai dati attuali.
              </p>
            </div>

            {pendingGoalRisk.goalValidation?.suggestedReformulatedGoal && (
              <div className="pf-goal-draft">
                <span>Possibile riformulazione</span>
                <strong>
                  {pendingGoalRisk.goalValidation.suggestedReformulatedGoal}
                </strong>
              </div>
            )}

            <div className="pf-actions">
              {pendingGoalRisk.goalValidation?.suggestedReformulatedGoal && (
                <button
                  className="pf-button"
                  type="button"
                  disabled={validatingFinalGoal}
                  onClick={() => void confirmSuggestedGoalFromRisk()}
                >
                  Conferma obiettivo AI
                </button>
              )}
              <button
                className="pf-button-secondary"
                type="button"
                onClick={openGoalRevisionFromRisk}
              >
                Chatta con AI per modifica
              </button>
              <button
                className="pf-button-secondary"
                type="button"
                onClick={() => {
                  setGoalRiskAcknowledged(true);
                  setFinalGoalValidated(true);
                  setGoalRiskModalOpen(false);
                  setMessageTone("warning");
                  setMessage(
                    "Presa visione confermata. Ora puoi creare la performance.",
                  );
                }}
              >
                Procedi comunque
              </button>
            </div>
          </section>
        </div>
      )}
    </ProductShell>
  );
}
