export type Area = { id: string; name: string };

export type Sport = {
  id: string;
  label: string;
  specializations: Array<{ id: string; label: string }>;
};

export type SportSpecializationRef = {
  id: string;
  label: string;
  sport: { id?: string; label: string };
};

export type UserRef = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

export type Professional = UserRef & {
  professionalAreaCompetences: Array<{ areaId: string; area: Area }>;
  professionalLinks: Array<{
    userId: string;
    user: UserRef;
    createdAt: string;
  }>;
  coachSpecializationCompetences: Array<{
    specializationId: string;
    specialization: SportSpecializationRef;
  }>;
  coachUserLinks: Array<{
    userId: string;
    specializationId: string;
    user: UserRef;
    specialization: SportSpecializationRef;
    createdAt: string;
  }>;
};

export type Cycle = {
  id: string;
  userId: string;
  areaId: string;
  version: number;
  status?: string;
  cycleStatus: string;
  createdAt: string;
  user: UserRef;
  area: Area;
  items?: Array<{ id: string; status: string }>;
  questionSets?: Array<{
    id: string;
    status: string;
    approvals: Array<{ id: string; status: string; professional: UserRef }>;
  }>;
};

export type AreaState = {
  area: Area;
  snapshot?: { realR: number; potentialP: number } | null;
  pendingCycle?: Cycle | null;
  activeCycle?: Cycle | null;
  currentQuestionSet?: { id: string; status: string } | null;
  linkedProfessional?: UserRef | null;
  generationReady: boolean;
  generationBlocked: boolean;
  reason: string;
};

export type Athlete = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  isActive: boolean;
  createdAt: string;
  onboarding: { status: string; completedAt?: string | null };
  linkedProfessionals: Array<{
    area: Area;
    professional: UserRef;
    createdAt: string;
  }>;
  latestSnapshot?: { rankingGlobal: number; createdAt: string } | null;
  trainingState: {
    sportSelection?: {
      specializationId: string;
      sport: { id: string; label: string };
      specialization: { id: string; label: string };
    } | null;
    linkedCoach?: UserRef | null;
    pendingTraining?: {
      id: string;
      version: number;
      status: string;
      cycleStatus: string;
      createdAt: string;
      specialization: SportSpecializationRef;
    } | null;
    activeTraining?: {
      id: string;
      version: number;
      status: string;
      cycleStatus?: string;
      createdAt: string;
      publishedAt?: string | null;
      summaryText: string;
      specialization?: SportSpecializationRef;
    } | null;
    generationReady: boolean;
    reason: string;
  };
  areaStates: AreaState[];
};

export type Dashboard = {
  areas: Area[];
  athletes: Athlete[];
  professionals: Professional[];
  sports: Sport[];
  pendingCycles: Cycle[];
  readyCycles: Cycle[];
  pendingTrainingPlans: Array<{
    id: string;
    version: number;
    cycleStatus: string;
    createdAt: string;
    user: UserRef;
    specialization: SportSpecializationRef;
    items: Array<{ id: string; status: string }>;
    questionSets: Array<{
      id: string;
      status: string;
      approvals: Array<{ id: string; status: string; coach: UserRef }>;
    }>;
  }>;
  readyTrainingPlans: Array<{
    id: string;
    version: number;
    cycleStatus: string;
    createdAt: string;
    user: UserRef;
    specialization: SportSpecializationRef;
  }>;
  pendingQuestionApprovals: Array<{
    id: string;
    professional: UserRef;
    currentProfessional?: UserRef | null;
    routingMismatch?: boolean;
    area: Area;
    questionSet: { id: string; user: UserRef; planReleaseId: string };
  }>;
  pendingPlanItems: Array<{
    id: string;
    area: Area;
    planReleaseId: string;
    user: UserRef;
    professional?: UserRef | null;
  }>;
};

export type AiPreview = {
  provider: string;
  model: string;
  promptVersion: string;
  promptHash: string;
  inputJson: {
    prompt?: {
      system?: string;
      user?: {
        task?: string;
        constraints?: unknown;
        context?: unknown;
      };
      responseJsonSchema?: unknown;
    };
    [key: string]: unknown;
  };
};

export type PreviewTarget = {
  athlete: UserRef;
  area: Area;
};

export type TrainingPreviewTarget = {
  athlete: Athlete;
};

export type AssignmentTarget = {
  athlete: Athlete;
  state: AreaState;
};

export type CoachAssignmentTarget = {
  athlete: Athlete;
  specializationId: string;
  label: string;
};

export type ResetTarget = {
  athlete: Athlete;
};

export type DeleteTarget = {
  athlete: Athlete;
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

export const formatDate = (value?: string | null) => {
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

export const displayUser = (user: UserRef) => {
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return fullName ? `${fullName} - ${user.email}` : user.email;
};

export const formatStatus = (status: string) =>
  ({
    ACTIVE: "attivo",
    COMPLETED: "completato",
    CLOSED: "chiuso",
    PENDING: "in attesa",
    PUBLISHED: "pubblicato",
    READY_TO_PUBLISH: "pronto da pubblicare",
    WAITING_PROFESSIONAL_APPROVAL: "in attesa professionista",
  })[status] ?? status.replace(/_/g, " ").toLowerCase();
