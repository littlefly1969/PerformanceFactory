"use client";

import { API_BASE, secureFetch } from "@/app/lib/api";
import { useEffect, useMemo, useState } from "react";
import {
  InboxResponse,
  PlanItem,
  QuestionApproval,
  readError,
  TrainingPlanItem,
  TrainingQuestionApproval,
  UserRef,
} from "./professional-approvals-model";
export function useProfessionalApprovals() {
  const [inbox, setInbox] = useState<InboxResponse>({
    planItems: [],
    questionApprovals: [],
    trainingPlanItems: [],
    trainingQuestionApprovals: [],
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>(
    {},
  );
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        user: UserRef;
        questions: QuestionApproval[];
        plans: PlanItem[];
        trainingQuestions: TrainingQuestionApproval[];
        trainingPlans: TrainingPlanItem[];
      }
    >();
    for (const approval of inbox.questionApprovals) {
      const user = approval.questionSet.user;
      const entry = map.get(user.id) ?? {
        user,
        questions: [],
        plans: [],
        trainingQuestions: [],
        trainingPlans: [],
      };
      entry.questions.push(approval);
      map.set(user.id, entry);
    }
    for (const item of inbox.planItems) {
      const user = item.planRelease.user;
      const entry = map.get(user.id) ?? {
        user,
        questions: [],
        plans: [],
        trainingQuestions: [],
        trainingPlans: [],
      };
      entry.plans.push(item);
      map.set(user.id, entry);
    }
    for (const approval of inbox.trainingQuestionApprovals ?? []) {
      const user = approval.questionSet.user;
      const entry = map.get(user.id) ?? {
        user,
        questions: [],
        plans: [],
        trainingQuestions: [],
        trainingPlans: [],
      };
      entry.trainingQuestions.push(approval);
      map.set(user.id, entry);
    }
    for (const item of inbox.trainingPlanItems ?? []) {
      const user = item.trainingPlanRelease.user;
      const entry = map.get(user.id) ?? {
        user,
        questions: [],
        plans: [],
        trainingQuestions: [],
        trainingPlans: [],
      };
      entry.trainingPlans.push(item);
      map.set(user.id, entry);
    }
    return Array.from(map.values()).sort((a, b) => {
      const totalA =
        a.questions.length +
        a.plans.length +
        a.trainingQuestions.length +
        a.trainingPlans.length;
      const totalB =
        b.questions.length +
        b.plans.length +
        b.trainingQuestions.length +
        b.trainingPlans.length;
      return totalB - totalA;
    });
  }, [inbox]);
  const totalPending =
    inbox.questionApprovals.length +
    inbox.planItems.length +
    (inbox.trainingQuestionApprovals?.length ?? 0) +
    (inbox.trainingPlanItems?.length ?? 0);
  const loadInbox = async () => {
    setLoading(true);
    setAuthHint(null);
    setMessage(null);

    const response = await secureFetch(`${API_BASE}/professional/approvals`, {
      credentials: "include",
    });
    if (!response.ok) {
      if (response.status === 401) {
        setAuthHint("Accedi con un account professionista.");
      } else if (response.status === 403) {
        setAuthHint("Questo ambiente e riservato ai professionisti.");
      } else {
        setMessage(
          `Impossibile caricare le approvazioni: ${await readError(response)}`,
        );
      }
      setLoading(false);
      return;
    }

    setInbox((await response.json()) as InboxResponse);
    setLoading(false);
  };
  useEffect(() => {
    void loadInbox();
  }, []);
  const setBusy = (id: string, value: boolean) => {
    setBusyIds((prev) => ({ ...prev, [id]: value }));
  };
  const approveQuestionSet = async (
    questionSetId: string,
    approvalId: string,
  ) => {
    setMessage(null);
    setBusy(approvalId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/questionsets/${questionSetId}/approve`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId }),
      },
    );
    if (!response.ok) {
      setMessage(
        `Approvazione questionario non riuscita: ${await readError(response)}`,
      );
      setBusy(approvalId, false);
      return;
    }
    setMessage(
      "Questionario approvato. Se tutte le revisioni sono completate, il ciclo viene pubblicato automaticamente.",
    );
    await loadInbox();
    setBusy(approvalId, false);
  };
  const rejectQuestionSet = async (
    questionSetId: string,
    approvalId: string,
  ) => {
    const reason = rejectReasons[approvalId]?.trim();
    if (!reason) {
      setMessage("Il motivo del rifiuto e obbligatorio.");
      return;
    }
    setBusy(approvalId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/questionsets/${questionSetId}/reject`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: reason, approvalId }),
      },
    );
    if (!response.ok) {
      setMessage(
        `Rifiuto questionario non riuscito: ${await readError(response)}`,
      );
      setBusy(approvalId, false);
      return;
    }
    await loadInbox();
    setBusy(approvalId, false);
  };
  const approvePlanItem = async (planItemId: string) => {
    setBusy(planItemId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/plan-items/${planItemId}/approve`,
      {
        method: "POST",
        credentials: "include",
      },
    );
    if (!response.ok) {
      setMessage(
        `Approvazione attivita allenamento non riuscita: ${await readError(response)}`,
      );
      setBusy(planItemId, false);
      return;
    }
    setMessage(
      "Attivita approvata. Se tutte le revisioni sono completate, il ciclo viene pubblicato automaticamente.",
    );
    await loadInbox();
    setBusy(planItemId, false);
  };
  const rejectPlanItem = async (planItemId: string) => {
    const reason = rejectReasons[planItemId]?.trim();
    if (!reason) {
      setMessage("Il motivo del rifiuto e obbligatorio.");
      return;
    }
    setBusy(planItemId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/plan-items/${planItemId}/reject`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: reason }),
      },
    );
    if (!response.ok) {
      setMessage(
        `Rifiuto attivita allenamento non riuscito: ${await readError(response)}`,
      );
      setBusy(planItemId, false);
      return;
    }
    await loadInbox();
    setBusy(planItemId, false);
  };
  const approveTrainingQuestionSet = async (
    questionSetId: string,
    approvalId: string,
  ) => {
    setBusy(approvalId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/training-questionsets/${questionSetId}/approve`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId }),
      },
    );
    if (!response.ok) {
      setMessage(
        `Approvazione questionario allenamento non riuscita: ${await readError(response)}`,
      );
      setBusy(approvalId, false);
      return;
    }
    setMessage(
      "Questionario allenamento approvato. Se tutte le revisioni sono completate, l'allenamento viene pubblicato automaticamente.",
    );
    await loadInbox();
    setBusy(approvalId, false);
  };
  const rejectTrainingQuestionSet = async (
    questionSetId: string,
    approvalId: string,
  ) => {
    const reason = rejectReasons[approvalId]?.trim();
    if (!reason) {
      setMessage("Il motivo del rifiuto e obbligatorio.");
      return;
    }
    setBusy(approvalId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/training-questionsets/${questionSetId}/reject`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: reason, approvalId }),
      },
    );
    if (!response.ok) {
      setMessage(
        `Rifiuto questionario allenamento non riuscito: ${await readError(response)}`,
      );
      setBusy(approvalId, false);
      return;
    }
    await loadInbox();
    setBusy(approvalId, false);
  };
  const approveTrainingPlanItem = async (planItemId: string) => {
    setBusy(planItemId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/training-plan-items/${planItemId}/approve`,
      { method: "POST", credentials: "include" },
    );
    if (!response.ok) {
      setMessage(
        `Approvazione esercizio allenamento non riuscita: ${await readError(response)}`,
      );
      setBusy(planItemId, false);
      return;
    }
    setMessage(
      "Esercizio allenamento approvato. Se tutte le revisioni sono completate, l'allenamento viene pubblicato automaticamente.",
    );
    await loadInbox();
    setBusy(planItemId, false);
  };
  const rejectTrainingPlanItem = async (planItemId: string) => {
    const reason = rejectReasons[planItemId]?.trim();
    if (!reason) {
      setMessage("Il motivo del rifiuto e obbligatorio.");
      return;
    }
    setBusy(planItemId, true);
    const response = await secureFetch(
      `${API_BASE}/professional/training-plan-items/${planItemId}/reject`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: reason }),
      },
    );
    if (!response.ok) {
      setMessage(
        `Rifiuto esercizio allenamento non riuscito: ${await readError(response)}`,
      );
      setBusy(planItemId, false);
      return;
    }
    await loadInbox();
    setBusy(planItemId, false);
  };
  return {
    inbox,
    setInbox,
    loading,
    setLoading,
    message,
    setMessage,
    authHint,
    setAuthHint,
    rejectReasons,
    setRejectReasons,
    busyIds,
    setBusyIds,
    groups,
    totalPending,
    loadInbox,
    setBusy,
    approveQuestionSet,
    rejectQuestionSet,
    approvePlanItem,
    rejectPlanItem,
    approveTrainingQuestionSet,
    rejectTrainingQuestionSet,
    approveTrainingPlanItem,
    rejectTrainingPlanItem,
  };
}
export type ProfessionalApprovalsModel = ReturnType<
  typeof useProfessionalApprovals
>;
