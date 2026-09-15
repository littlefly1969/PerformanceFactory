export type AiSummary = { id: string; summaryText: string; createdAt: string };

export type UserRef = { id: string; email: string };

export type PlanItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  area?: { id: string; name: string };
  planRelease: {
    id: string;
    version: number;
    user: UserRef;
    aiContextSummaries: AiSummary[];
  };
};

export type QuestionApproval = {
  id: string;
  status: string;
  areaId: string;
  questionSetId: string;
  area?: { id: string; name: string };
  questionSet: {
    id: string;
    user: UserRef;
    planRelease?: {
      id: string;
      version: number;
      aiContextSummaries: AiSummary[];
    };
    questions: Array<{
      id: string;
      text: string;
      orderIndex: number;
      options: Array<{ id: string; label: string; score: number }>;
    }>;
  };
};

export type TrainingPlanItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  trainingPlanRelease: {
    id: string;
    version: number;
    user: UserRef;
    specialization: {
      id: string;
      label: string;
      sport: { label: string };
    };
  };
};

export type TrainingQuestionApproval = {
  id: string;
  status: string;
  trainingQuestionSetId: string;
  questionSet: {
    id: string;
    user: UserRef;
    specialization: {
      id: string;
      label: string;
      sport: { label: string };
    };
    trainingPlanRelease: {
      id: string;
      version: number;
      summaryText: string;
    };
    questions: Array<{
      id: string;
      text: string;
      orderIndex: number;
      options: Array<{ id: string; label: string; score: number }>;
    }>;
  };
};

export type InboxResponse = {
  planItems: PlanItem[];
  questionApprovals: QuestionApproval[];
  trainingPlanItems: TrainingPlanItem[];
  trainingQuestionApprovals: TrainingQuestionApproval[];
};

export const readError = async (response: Response) => {
  try {
    const data = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };
    return Array.isArray(data.message)
      ? data.message.join(", ")
      : (data.message ?? data.error ?? `HTTP ${response.status}`);
  } catch {
    return `HTTP ${response.status}`;
  }
};

export const formatDate = (value?: string) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "-"
    : parsed.toLocaleDateString("it-IT", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
};
