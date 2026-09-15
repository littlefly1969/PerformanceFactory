export type PlanItem = {
  id: string;
  status: string;
  title: string;
  body: string;
  area?: { id: string; name: string };
  completedAt?: string | null;
  completionNotes?: string | null;
  completionRating?: number | null;
};

export type Piano = {
  id: string;
  areaId: string;
  version: number;
  status: string;
  createdAt: string;
  items: PlanItem[];
};

export type TrainingOutput = {
  summaryText?: string;
  planItems?: Array<{
    type?: string;
    title?: string;
    body?: string;
  }>;
};

export type TrainingPlan = {
  id: string;
  version: number;
  status: string;
  summaryText: string;
  outputJson: TrainingOutput;
  provider: string;
  model: string;
  createdAt: string;
  specialization?: {
    label: string;
    sport: { label: string };
  };
  items?: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    status: string;
    completedAt?: string | null;
    completionNotes?: string | null;
    completionRating?: number | null;
  }>;
};

export type Area = { id: string; name: string };

export const cleanStato = (status: string) =>
  ({
    ACTIVE: "attivo",
    COMPLETED: "completato",
    CLOSED: "chiuso",
    PENDING: "in attesa",
    PUBLISHED: "pubblicato",
  })[status] ?? status.replace(/_/g, " ").toLowerCase();

export const formatDate = (value?: string | null) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "-"
    : parsed.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};
