import { API_BASE, secureFetch } from "@/app/lib/api";
import type { Dispatch, SetStateAction } from "react";
import {
  GoalChatMessage,
  GoalRefinement,
  GoalRiskResponse,
  GoalValidation,
  MessageTone,
  StarterQuestionario,
} from "./onboarding-model";
export function openGoalAssistantAction(
  actionState: {
    goalText: string;
    setRefinedGoalDraft: Dispatch<SetStateAction<string>>;
    setGoalChatMessages: Dispatch<SetStateAction<GoalChatMessage[]>>;
    setGoalChatInput: Dispatch<SetStateAction<string>>;
    setGoalModalOpen: Dispatch<SetStateAction<boolean>>;
  },
  validation: GoalValidation,
  refinedDraft: string,
) {
  const {
    setRefinedGoalDraft,
    setGoalChatMessages,
    setGoalChatInput,
    setGoalModalOpen,
  } = actionState;

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
}

export function openGoalConfirmationAction(
  actionState: {
    goalText: string;
    setRefinedGoalDraft: Dispatch<SetStateAction<string>>;
    setGoalChatMessages: Dispatch<SetStateAction<GoalChatMessage[]>>;
    setGoalChatInput: Dispatch<SetStateAction<string>>;
    setGoalAssistantClosed: Dispatch<SetStateAction<boolean>>;
    setGoalModalOpen: Dispatch<SetStateAction<boolean>>;
  },
  validation: GoalValidation,
  refinedDraft: string,
) {
  const {
    goalText,
    setRefinedGoalDraft,
    setGoalChatMessages,
    setGoalChatInput,
    setGoalAssistantClosed,
    setGoalModalOpen,
  } = actionState;

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
}

export function openGoalRevisionFromRiskAction(actionState: {
  pendingGoalRisk: GoalRiskResponse | null;
  setGoalValidation: Dispatch<SetStateAction<GoalValidation | null>>;
  goalText: string;
  setRefinedGoalDraft: Dispatch<SetStateAction<string>>;
  setGoalChatMessages: Dispatch<SetStateAction<GoalChatMessage[]>>;
  setGoalChatInput: Dispatch<SetStateAction<string>>;
  setGoalRiskAcknowledged: Dispatch<SetStateAction<boolean>>;
  setFinalGoalValidated: Dispatch<SetStateAction<boolean>>;
  setPendingGoalRisk: Dispatch<SetStateAction<GoalRiskResponse | null>>;
  setGoalRiskModalOpen: Dispatch<SetStateAction<boolean>>;
  setGoalAssistantClosed: Dispatch<SetStateAction<boolean>>;
  setGoalModalOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const {
    pendingGoalRisk,
    setGoalValidation,
    goalText,
    setRefinedGoalDraft,
    setGoalChatMessages,
    setGoalChatInput,
    setGoalRiskAcknowledged,
    setFinalGoalValidated,
    setPendingGoalRisk,
    setGoalRiskModalOpen,
    setGoalAssistantClosed,
    setGoalModalOpen,
  } = actionState;

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
}

export async function confirmSuggestedGoalFromRiskAction(actionState: {
  pendingGoalRisk: GoalRiskResponse | null;
  setGoalText: Dispatch<SetStateAction<string>>;
  setGoalRiskModalOpen: Dispatch<SetStateAction<boolean>>;
  setPendingGoalRisk: Dispatch<SetStateAction<GoalRiskResponse | null>>;
  setGoalRiskAcknowledged: Dispatch<SetStateAction<boolean>>;
  setGoalAssistantClosed: Dispatch<SetStateAction<boolean>>;
  validateFinalGoal: (goalOverride?: string) => Promise<void>;
}) {
  const {
    pendingGoalRisk,
    setGoalText,
    setGoalRiskModalOpen,
    setPendingGoalRisk,
    setGoalRiskAcknowledged,
    setGoalAssistantClosed,
    validateFinalGoal,
  } = actionState;

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
}

export async function confirmGoalContextAction(actionState: {
  sportSelectionSaved: boolean;
  saveSportSelection: () => Promise<boolean>;
  goalText: string;
  setGoalValidation: Dispatch<SetStateAction<GoalValidation | null>>;
  openGoalAssistant: (
    validation: GoalValidation,
    refinedDraft?: string,
  ) => void;
  setGoalAssistantClosed: Dispatch<SetStateAction<boolean>>;
  setGoalRiskAcknowledged: Dispatch<SetStateAction<boolean>>;
  setFinalGoalValidated: Dispatch<SetStateAction<boolean>>;
  setPendingGoalRisk: Dispatch<SetStateAction<GoalRiskResponse | null>>;
  setMessageTone: Dispatch<SetStateAction<MessageTone>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const {
    sportSelectionSaved,
    saveSportSelection,
    goalText,
    setGoalValidation,
    openGoalAssistant,
    setGoalAssistantClosed,
    setGoalRiskAcknowledged,
    setFinalGoalValidated,
    setPendingGoalRisk,
    setMessageTone,
    setMessage,
  } = actionState;

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
}

export async function refineGoalAction(actionState: {
  goalChatInput: string;
  refiningGoal: boolean;
  goalChatMessages: GoalChatMessage[];
  setGoalChatMessages: Dispatch<SetStateAction<GoalChatMessage[]>>;
  setGoalChatInput: Dispatch<SetStateAction<string>>;
  setRefiningGoal: Dispatch<SetStateAction<boolean>>;
  goalText: string;
  refinedGoalDraft: string;
  readError: (response: Response) => Promise<string>;
  showWarning: (title: string, detail: string) => void;
  setRefinedGoalDraft: Dispatch<SetStateAction<string>>;
  setGoalValidation: Dispatch<SetStateAction<GoalValidation | null>>;
  setMessageTone: Dispatch<SetStateAction<MessageTone>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const {
    goalChatInput,
    refiningGoal,
    goalChatMessages,
    setGoalChatMessages,
    setGoalChatInput,
    setRefiningGoal,
    goalText,
    refinedGoalDraft,
    readError,
    showWarning,
    setRefinedGoalDraft,
    setGoalValidation,
    setMessageTone,
    setMessage,
  } = actionState;

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
    showWarning("Errore API AI", errorText);
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
}

export async function useRefinedGoalAction(actionState: {
  refinedGoalDraft: string;
  goalValidation: GoalValidation | null;
  setGoalText: Dispatch<SetStateAction<string>>;
  setGoalModalOpen: Dispatch<SetStateAction<boolean>>;
  setGoalAssistantClosed: Dispatch<SetStateAction<boolean>>;
  setMessageTone: Dispatch<SetStateAction<MessageTone>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  completed: boolean;
  validateFinalGoal: (goalOverride?: string) => Promise<void>;
}) {
  const {
    refinedGoalDraft,
    goalValidation,
    setGoalText,
    setGoalModalOpen,
    setGoalAssistantClosed,
    setMessageTone,
    setMessage,
    completed,
    validateFinalGoal,
  } = actionState;

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
}

export async function validateFinalGoalAction(
  actionState: {
    questionnaire: StarterQuestionario | null;
    completed: boolean;
    setMessageTone: Dispatch<SetStateAction<MessageTone>>;
    setMessage: Dispatch<SetStateAction<string | null>>;
    goalText: string;
    setValidatingFinalGoal: Dispatch<SetStateAction<boolean>>;
    answers: Record<string, string | number>;
    setPendingGoalRisk: Dispatch<SetStateAction<GoalRiskResponse | null>>;
    setGoalRiskModalOpen: Dispatch<SetStateAction<boolean>>;
    setGoalValidation: Dispatch<SetStateAction<GoalValidation | null>>;
    showWarning: (title: string, detail: string) => void;
    readError: (response: Response) => Promise<string>;
    setGoalText: Dispatch<SetStateAction<string>>;
    setFinalGoalValidated: Dispatch<SetStateAction<boolean>>;
    setGoalRiskAcknowledged: Dispatch<SetStateAction<boolean>>;
  },
  goalOverride?: string | undefined,
) {
  const {
    questionnaire,
    completed,
    setMessageTone,
    setMessage,
    goalText,
    setValidatingFinalGoal,
    answers,
    setPendingGoalRisk,
    setGoalRiskModalOpen,
    setGoalValidation,
    showWarning,
    readError,
    setGoalText,
    setFinalGoalValidated,
    setGoalRiskAcknowledged,
  } = actionState;

  if (!questionnaire || !completed) {
    setMessageTone("warning");
    setMessage("Completa tutte le risposte prima di validare l'obiettivo.");
    return;
  }

  const goalForValidation =
    typeof goalOverride === "string" ? goalOverride : goalText;
  setValidatingFinalGoal(true);
  setMessage(null);
  const response = await secureFetch(
    `${API_BASE}/onboarding/goal/final-validate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalText: goalForValidation,
        answers: questionnaire.questions.map((question) => ({
          questionId: question.id,
          value: answers[question.id],
        })),
      }),
    },
  );

  if (!response.ok) {
    if (response.status === 409) {
      const risk = (await response.json()) as GoalRiskResponse;
      if (risk.code === "GOAL_RISK_ACK_REQUIRED") {
        setPendingGoalRisk(risk);
        setGoalRiskModalOpen(true);
        setGoalValidation({
          status: risk.goalValidation?.status ?? "GOAL_NEEDS_REFORMULATION",
          accepted: false,
          canProceedToAnamnesis: false,
          interpretedGoal:
            risk.goalValidation?.interpretedGoal ?? goalForValidation,
          userMessage:
            risk.goalValidation?.userMessage ??
            risk.message ??
            "L'obiettivo non risulta validato.",
          suggestedReformulatedGoal:
            risk.goalValidation?.suggestedReformulatedGoal ?? null,
          questionsToUser: risk.goalValidation?.questionsToUser ?? [],
          nextStep: risk.goalValidation?.nextStep ?? null,
          rejectionReason:
            risk.goalValidation?.rejectionReason ?? risk.message ?? null,
        });
        setMessageTone("warning");
        setMessage(
          risk.message ??
            risk.goalValidation?.userMessage ??
            "L'AI non ha validato l'obiettivo rispetto alle risposte inserite.",
        );
        setValidatingFinalGoal(false);
        return;
      }
      showWarning(
        "Validazione obiettivo non riuscita",
        risk.message ?? "Validazione obiettivo non disponibile.",
      );
      setValidatingFinalGoal(false);
      return;
    }
    showWarning("Errore API AI", await readError(response));
    setValidatingFinalGoal(false);
    return;
  }

  const validation = (await response.json()) as GoalValidation;
  setGoalText(goalForValidation);
  setGoalValidation({
    ...validation,
    accepted: validation.accepted ?? true,
    canProceedToAnamnesis: true,
  });
  setFinalGoalValidated(true);
  setGoalRiskAcknowledged(false);
  setMessageTone("success");
  setMessage(
    validation.userMessage ||
      "Obiettivo validato. Ora puoi creare la performance.",
  );
  setValidatingFinalGoal(false);
}
