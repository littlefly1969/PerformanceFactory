"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";
import { downloadResponseBody } from "@/app/lib/download";

type Area = { id: string; name: string };
type Sport = {
  id: string;
  label: string;
  specializations: Array<{ id: string; label: string }>;
};
type SportSpecializationRef = {
  id: string;
  label: string;
  sport: { id?: string; label: string };
};
type UserRef = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};
type Professional = UserRef & {
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
type Cycle = {
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
type AreaState = {
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
type Athlete = {
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
type Dashboard = {
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

type AiPreview = {
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

type PreviewTarget = {
  athlete: UserRef;
  area: Area;
};
type TrainingPreviewTarget = {
  athlete: Athlete;
};

type AssignmentTarget = {
  athlete: Athlete;
  state: AreaState;
};
type CoachAssignmentTarget = {
  athlete: Athlete;
  specializationId: string;
  label: string;
};

type ResetTarget = {
  athlete: Athlete;
};

type DeleteTarget = {
  athlete: Athlete;
};

const readError = async (response: Response) => {
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

const formatDate = (value?: string | null) => {
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

const badgeTone = (value: string) => {
  if (
    value.includes("READY") ||
    value.includes("COMPLETED") ||
    value.includes("ACTIVE")
  ) {
    return "success" as const;
  }
  if (value.includes("WAITING") || value.includes("PENDING")) {
    return "warning" as const;
  }
  if (value.includes("REJECTED") || value.includes("MISSING")) {
    return "danger" as const;
  }
  return "neutral" as const;
};

const displayUser = (user: UserRef) => {
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return fullName ? `${fullName} - ${user.email}` : user.email;
};

const formatStatus = (status: string) =>
  ({
    ACTIVE: "attivo",
    COMPLETED: "completato",
    CLOSED: "chiuso",
    PENDING: "in attesa",
    PUBLISHED: "pubblicato",
    READY_TO_PUBLISH: "pronto da pubblicare",
    WAITING_PROFESSIONAL_APPROVAL: "in attesa professionista",
  })[status] ?? status.replace(/_/g, " ").toLowerCase();

export default function AdminCyclesPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [competencesByProfessional, setCompetencesByProfessional] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [coachCompetencesByProfessional, setCoachCompetencesByProfessional] =
    useState<Record<string, Record<string, boolean>>>({});
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(
    null,
  );
  const [trainingPreviewTarget, setTrainingPreviewTarget] =
    useState<TrainingPreviewTarget | null>(null);
  const [assignmentTarget, setAssignmentTarget] =
    useState<AssignmentTarget | null>(null);
  const [coachAssignmentTarget, setCoachAssignmentTarget] =
    useState<CoachAssignmentTarget | null>(null);
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [professionalFilter, setProfessionalFilter] = useState("");
  const [coachFilter, setCoachFilter] = useState("");

  const athletes =
    dashboard?.athletes.filter(
      (athlete) => athlete.onboarding.status !== "REJECTED",
    ) ?? [];
  const professionals = dashboard?.professionals ?? [];
  const areas = dashboard?.areas ?? [];
  const readyToGenerate = useMemo(
    () =>
      athletes.flatMap((athlete) =>
        athlete.areaStates
          .filter((state) => state.generationReady && !state.generationBlocked)
          .map((state) => ({ athlete, state })),
      ),
    [athletes],
  );
  const readyTraining = useMemo(
    () => athletes.filter((athlete) => athlete.trainingState.generationReady),
    [athletes],
  );
  const waitingApproval =
    dashboard?.pendingCycles.filter(
      (cycle) => cycle.cycleStatus !== "READY_TO_PUBLISH",
    ) ?? [];
  const readyCycles = dashboard?.readyCycles ?? [];
  const readyTrainingPlans = dashboard?.readyTrainingPlans ?? [];
  const pendingActivation = athletes.filter(
    (athlete) => !athlete.isActive && athlete.onboarding.status !== "REJECTED",
  );
  const professionalCanHandleArea = (professionalId: string, areaId: string) =>
    Boolean(
      professionals
        .find((professional) => professional.id === professionalId)
        ?.professionalAreaCompetences.some(
          (competence) => competence.areaId === areaId,
        ),
    );
  const enabledProfessionalsForArea = (areaId: string) =>
    areaId
      ? professionals.filter((professional) =>
          professional.professionalAreaCompetences.some(
            (competence) => competence.areaId === areaId,
          ),
        )
      : [];
  const coachCanHandleSpecialization = (
    coachId: string,
    specializationId: string,
  ) =>
    Boolean(
      professionals
        .find((professional) => professional.id === coachId)
        ?.coachSpecializationCompetences.some(
          (competence) => competence.specializationId === specializationId,
        ),
    );

  const previewAthlete = previewTarget?.athlete ?? trainingPreviewTarget?.athlete;
  const previewLabel = previewTarget
    ? previewTarget.area.name
    : "Allenamento specifico";
  const previewIsTraining = Boolean(trainingPreviewTarget);
  const enabledCoachesForSpecialization = (specializationId: string) =>
    specializationId
      ? professionals.filter((professional) =>
          professional.coachSpecializationCompetences.some(
            (competence) => competence.specializationId === specializationId,
          ),
        )
      : [];
  const filteredAssignmentProfessionals = assignmentTarget
    ? enabledProfessionalsForArea(assignmentTarget.state.area.id).filter(
        (professional) =>
          displayUser(professional)
            .toLowerCase()
            .includes(professionalFilter.trim().toLowerCase()),
      )
    : [];
  const filteredCoachAssignmentProfessionals = coachAssignmentTarget
    ? enabledCoachesForSpecialization(
        coachAssignmentTarget.specializationId,
      ).filter((professional) =>
        displayUser(professional)
          .toLowerCase()
          .includes(coachFilter.trim().toLowerCase()),
      )
    : [];

  const loadDashboard = async () => {
    setLoading(true);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/dashboard`, {
      credentials: "include",
    });
    if (!response.ok) {
      setMessage(
        response.status === 403
          ? "Accesso amministratore richiesto."
          : `Caricamento cruscotto non riuscito: ${await readError(response)}`,
      );
      setLoading(false);
      return;
    }

    const data = (await response.json()) as Dashboard;
    setDashboard(data);
    setCompetencesByProfessional(
      Object.fromEntries(
        data.professionals.map((professional) => [
          professional.id,
          Object.fromEntries(
            professional.professionalAreaCompetences.map((competence) => [
              competence.areaId,
              true,
            ]),
          ),
        ]),
      ),
    );
    setCoachCompetencesByProfessional(
      Object.fromEntries(
        data.professionals.map((professional) => [
          professional.id,
          Object.fromEntries(
            professional.coachSpecializationCompetences.map((competence) => [
              competence.specializationId,
              true,
            ]),
          ),
        ]),
      ),
    );
    setLoading(false);
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const openAssignmentModal = (athlete: Athlete, state: AreaState) => {
    setAssignmentTarget({ athlete, state });
    setProfessionalFilter("");
  };

  const closeAssignmentModal = () => {
    setAssignmentTarget(null);
    setProfessionalFilter("");
  };

  const openCoachAssignmentModal = (
    athlete: Athlete,
    specializationId: string,
    label: string,
  ) => {
    setCoachAssignmentTarget({ athlete, specializationId, label });
    setCoachFilter("");
  };

  const closeCoachAssignmentModal = () => {
    setCoachAssignmentTarget(null);
    setCoachFilter("");
  };

  const assignProfessional = async (
    athleteId: string,
    areaId: string,
    professionalId: string,
  ) => {
    if (!areaId) {
      setMessage("Seleziona un'area prima di assegnare un professionista.");
      return;
    }
    if (!professionalId) {
      setMessage("Seleziona un professionista prima dell'assegnazione.");
      return;
    }
    if (!professionalCanHandleArea(professionalId, areaId)) {
      setMessage("Il professionista selezionato non e abilitato per questa area.");
      return;
    }
    setBusyKey(`link:${athleteId}:${areaId}`);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/inspect/links`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: athleteId, professionalId, areaId }),
    });
    if (!response.ok) {
      setMessage(`Assegnazione non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage(
      "Atleta assegnato a un professionista abilitato. I collegamenti precedenti sono stati sostituiti.",
    );
    closeAssignmentModal();
    await loadDashboard();
    setBusyKey(null);
  };

  const saveCompetences = async (professionalId: string) => {
    const selected = Object.entries(
      competencesByProfessional[professionalId] ?? {},
    )
      .filter(([, checked]) => checked)
      .map(([areaId]) => areaId);
    if (!selected.length) {
      setMessage("Seleziona almeno una competenza per area.");
      return;
    }
    setBusyKey(`competences:${professionalId}`);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/inspect/competences`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professionalId, areaIds: selected }),
    });
    if (!response.ok) {
      setMessage(`Aggiornamento competenze non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage(
      "Competenze salvate. Il professionista vede gli atleti collegati e le approvazioni coerenti.",
    );
    await loadDashboard();
    setBusyKey(null);
  };

  const assignCoach = async (
    athleteId: string,
    specializationId: string,
    coachId: string,
  ) => {
    if (!coachId) {
      setMessage("Seleziona un allenatore prima dell'assegnazione.");
      return;
    }
    if (!coachCanHandleSpecialization(coachId, specializationId)) {
      setMessage(
        "L'allenatore selezionato non e abilitato per questa specializzazione.",
      );
      return;
    }
    setBusyKey(`coach-link:${athleteId}:${specializationId}`);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/inspect/coach-links`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: athleteId, coachId, specializationId }),
    });
    if (!response.ok) {
      setMessage(`Assegnazione allenatore non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage("Allenatore assegnato alla sport-specializzazione dell'atleta.");
    closeCoachAssignmentModal();
    await loadDashboard();
    setBusyKey(null);
  };

  const saveCoachCompetences = async (coachId: string) => {
    const selected = Object.entries(
      coachCompetencesByProfessional[coachId] ?? {},
    )
      .filter(([, checked]) => checked)
      .map(([specializationId]) => specializationId);
    if (!selected.length) {
      setMessage("Seleziona almeno una specializzazione per l'allenatore.");
      return;
    }
    setBusyKey(`coach-competences:${coachId}`);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/inspect/coach-competences`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachId, specializationIds: selected }),
    });
    if (!response.ok) {
      setMessage(`Aggiornamento competenze allenatore non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage("Competenze allenatore salvate.");
    await loadDashboard();
    setBusyKey(null);
  };

  const openAiPreview = async (athlete: UserRef, area: Area) => {
    setBusyKey(`preview:${athlete.id}:${area.id}`);
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/admin/orchestrator/preview`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: [athlete.id],
          areaId: area.id,
          runAllAreas: false,
        }),
      },
    );
    if (!response.ok) {
      setMessage(`Anteprima AI non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setAiPreview((await response.json()) as AiPreview);
    setPreviewTarget({ athlete, area });
    setTrainingPreviewTarget(null);
    setBusyKey(null);
  };

  const openTrainingPreview = async (athlete: Athlete) => {
    setBusyKey(`training-preview:${athlete.id}`);
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/admin/orchestrator/training/preview`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: [athlete.id],
          runAllAreas: false,
        }),
      },
    );
    if (!response.ok) {
      setMessage(`Anteprima allenamento non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setAiPreview((await response.json()) as AiPreview);
    setPreviewTarget(null);
    setTrainingPreviewTarget({ athlete });
    setBusyKey(null);
  };

  const closeAiPreview = () => {
    setAiPreview(null);
    setPreviewTarget(null);
    setTrainingPreviewTarget(null);
  };

  const generateCycle = async (athleteId: string, areaId: string) => {
    setBusyKey(`generate:${athleteId}:${areaId}`);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/orchestrator/run`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userIds: [athleteId],
        areaId,
        runAllAreas: false,
      }),
    });
    if (!response.ok) {
      setMessage(`Generazione AI non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage("Proposta AI generata e inviata all'approvazione del professionista.");
    closeAiPreview();
    await loadDashboard();
    setBusyKey(null);
  };

  const generateTraining = async (athleteId: string) => {
    setBusyKey(`training:${athleteId}`);
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/admin/orchestrator/training/run`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [athleteId], runAllAreas: false }),
      },
    );
    if (!response.ok) {
      setMessage(`Generazione allenamento non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage("Allenamento specifico generato e inviato all'approvazione dell'allenatore.");
    closeAiPreview();
    await loadDashboard();
    setBusyKey(null);
  };

  const publishCycle = async (cycleId: string) => {
    setBusyKey(`publish:${cycleId}`);
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/admin/cycles/${cycleId}/publish`,
      {
        method: "POST",
        credentials: "include",
      },
    );
    if (!response.ok) {
      setMessage(`Pubblicazione non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage("Ciclo pubblicato. L'atleta ora vede allenamento e questionario.");
    await loadDashboard();
    setBusyKey(null);
  };

  const publishTrainingPlan = async (trainingPlanId: string) => {
    setBusyKey(`training-publish:${trainingPlanId}`);
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/admin/training-plans/${trainingPlanId}/publish`,
      {
        method: "POST",
        credentials: "include",
      },
    );
    if (!response.ok) {
      setMessage(`Pubblicazione allenamento non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage("Allenamento pubblicato. L'atleta ora vede esercizi e questionario.");
    await loadDashboard();
    setBusyKey(null);
  };

  const confirmExportActivePrompts = async () => {
    setBusyKey("export-active-prompts");
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/ai-tuning/active-prompts/export`,
      {
        method: "GET",
        credentials: "include",
      },
    );
    if (!response.ok) {
      setMessage(`Export prompt AI non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      setExportConfirmOpen(false);
      return;
    }

    await downloadResponseBody(response, "active-ai-prompts.txt");
    setMessage("Export prompt AI attivi generato.");
    setBusyKey(null);
    setExportConfirmOpen(false);
  };

  const setAthleteActive = async (athleteId: string, active: boolean) => {
    setBusyKey(`active:${athleteId}`);
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/admin/users/${athleteId}/${active ? "activate" : "deactivate"}`,
      {
        method: "PATCH",
        credentials: "include",
      },
    );
    if (!response.ok) {
      setMessage(`Aggiornamento atleta non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage(active ? "Atleta abilitato." : "Atleta disabilitato.");
    await loadDashboard();
    setBusyKey(null);
  };

  const rejectAthleteApplication = async (athleteId: string) => {
    setBusyKey(`reject:${athleteId}`);
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/admin/users/${athleteId}/reject`,
      {
        method: "PATCH",
        credentials: "include",
      },
    );
    if (!response.ok) {
      setMessage(`Rifiuto candidatura non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage("Candidatura atleta rifiutata. L'utente potra riproporne una nuova.");
    await loadDashboard();
    setBusyKey(null);
  };

  const resetAthleteData = async () => {
    if (!resetTarget) {
      return;
    }
    const athleteId = resetTarget.athlete.id;
    setBusyKey(`reset:${athleteId}`);
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/admin/users/${athleteId}/reset-data`,
      {
        method: "POST",
        credentials: "include",
      },
    );
    if (!response.ok) {
      setMessage(`Reset dati atleta non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage(
      "Dati atleta cancellati. Resta solo l'account: consensi e onboarding dovranno ripartire.",
    );
    setResetTarget(null);
    await loadDashboard();
    setBusyKey(null);
  };

  const deleteAthleteCompletely = async () => {
    if (!deleteTarget) {
      return;
    }
    const athleteId = deleteTarget.athlete.id;
    setBusyKey(`delete:${athleteId}`);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/users/${athleteId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      setMessage(`Eliminazione atleta non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage("Atleta eliminato definitivamente.");
    setDeleteTarget(null);
    setDeleteConfirmText("");
    await loadDashboard();
    setBusyKey(null);
  };

  return (
    <ProductShell
      eyebrow="Ambiente amministratore"
      title="Cruscotto operativo"
      description="Assegna un professionista per area atleta, genera cicli AI quando gli atleti sono pronti, traccia le approvazioni e pubblica senza copiare ID."
      actions={
        <>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => setExportConfirmOpen(true)}
            disabled={busyKey === "export-active-prompts"}
          >
            Export prompt AI
          </button>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadDashboard()}
          >
            Aggiorna
          </button>
        </>
      }
      stats={[
        {
          label: "Pronti da generare",
          value: loading ? "..." : readyToGenerate.length,
          tone: "accent",
        },
        {
          label: "Allenamenti generabili",
          value: loading ? "..." : readyTraining.length,
          tone: "success",
        },
        {
          label: "Approvazioni in attesa",
          value: loading ? "..." : waitingApproval.length,
          tone: "warning",
        },
        {
          label: "Pronti da pubblicare",
          value: loading ? "..." : readyCycles.length,
          tone: "success",
        },
        {
          label: "In attesa attivazione",
          value: loading ? "..." : pendingActivation.length,
          tone: pendingActivation.length ? "danger" : "neutral",
        },
      ]}
    >
      {message && <div className="pf-alert">{message}</div>}

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Nuove richieste atleta</h2>
            <p className="pf-muted">
              Gli atleti creati dall'accesso pubblico devono essere abilitati
              dall'amministratore prima di accedere e completare l'onboarding.
            </p>
          </div>
          <StatusBadge tone={pendingActivation.length ? "danger" : "success"}>
            {pendingActivation.length} in attesa
          </StatusBadge>
        </div>
        <div className="pf-table">
          {pendingActivation.map((athlete) => (
            <article key={athlete.id} className="pf-work-row">
              <div>
                <strong>{displayUser(athlete)}</strong>
                <p className="pf-muted">
                  Creato il {formatDate(athlete.createdAt)} - onboarding{" "}
                  {formatStatus(athlete.onboarding.status)}
                </p>
              </div>
              <button
                className="pf-button"
                type="button"
                disabled={busyKey === `active:${athlete.id}`}
                onClick={() => setAthleteActive(athlete.id, true)}
              >
                Abilita atleta
              </button>
              <button
                className="pf-button-secondary"
                type="button"
                disabled={busyKey === `reject:${athlete.id}`}
                onClick={() => rejectAthleteApplication(athlete.id)}
              >
                Rifiuta candidatura
              </button>
            </article>
          ))}
          {!loading && pendingActivation.length === 0 && (
            <EmptyState
              title="Nessun atleta in attesa"
              description="Le nuove richieste di registrazione atleta appariranno qui."
            />
          )}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Coda generazione AI</h2>
            <p className="pf-muted">
              Atleti con onboarding completato e aree pronte a ricevere una
              nuova proposta AI.
            </p>
          </div>
          <StatusBadge tone={readyToGenerate.length ? "accent" : "neutral"}>
            {readyToGenerate.length} pronti
          </StatusBadge>
        </div>
        <div className="pf-table">
          {readyToGenerate.map(({ athlete, state }) => {
            const linkedProfessionalCanApprove = Boolean(
              state.linkedProfessional &&
              professionalCanHandleArea(
                state.linkedProfessional.id,
                state.area.id,
              ),
            );
            return (
              <article
                key={`${athlete.id}:${state.area.id}`}
                className="pf-work-row"
              >
                <div>
                  <strong>{displayUser(athlete)}</strong>
                  <p className="pf-muted">
                    {state.area.name} - {state.reason}
                  </p>
                  {!linkedProfessionalCanApprove && (
                    <p className="pf-muted">
                      Assegna un professionista abilitato per {state.area.name} prima
                      di generare.
                    </p>
                  )}
                </div>
                <div className="pf-inline-metrics">
                  <span>R {state.snapshot?.realR.toFixed(0) ?? "-"}</span>
                  <span>P {state.snapshot?.potentialP.toFixed(0) ?? "-"}</span>
                </div>
                <button
                  className="pf-button"
                  type="button"
                  disabled={
                    busyKey === `preview:${athlete.id}:${state.area.id}` ||
                    !linkedProfessionalCanApprove
                  }
                  onClick={() => openAiPreview(athlete, state.area)}
                >
                  Anteprima AI
                </button>
              </article>
            );
          })}
          {!loading && readyToGenerate.length === 0 && (
            <EmptyState
              title="Niente da generare"
              description="Al momento nessuna area atleta completata e disponibile per una nuova proposta."
            />
          )}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Allenamento autonomo</h2>
            <p className="pf-muted">
              Genera l'allenamento specifico dello sport-specializzazione usando i driver abilitati come contesto.
            </p>
          </div>
          <StatusBadge tone={readyTraining.length ? "success" : "neutral"}>
            {readyTraining.length} pronti
          </StatusBadge>
        </div>
        <div className="pf-table">
          {readyTraining.map((athlete) => (
            <article key={`training:${athlete.id}`} className="pf-work-row">
              <div>
                <strong>{displayUser(athlete)}</strong>
                <p className="pf-muted">{athlete.trainingState.reason}</p>
                {athlete.trainingState.sportSelection && (
                  <p className="pf-muted">
                    {athlete.trainingState.sportSelection.sport.label} -{" "}
                    {athlete.trainingState.sportSelection.specialization.label} -{" "}
                    allenatore:{" "}
                    {athlete.trainingState.linkedCoach?.email ?? "non assegnato"}
                  </p>
                )}
                {athlete.trainingState.activeTraining && (
                  <p className="pf-muted">
                    Ultimo allenamento v{athlete.trainingState.activeTraining.version} -{" "}
                    {formatDate(athlete.trainingState.activeTraining.createdAt)}
                  </p>
                )}
              </div>
              <button
                className="pf-button"
                type="button"
                disabled={
                  busyKey === `training-preview:${athlete.id}`
                }
                onClick={() => openTrainingPreview(athlete)}
              >
                Anteprima AI
              </button>
            </article>
          ))}
          {!loading && readyTraining.length === 0 && (
            <EmptyState
              title="Niente da generare"
              description="Al momento nessun atleta ha sport, onboarding e allenatore pronti per un nuovo allenamento."
            />
          )}
        </div>
      </section>

      <section className="pf-dashboard-grid">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Pronti da pubblicare</h2>
              <p className="pf-muted">
                I controlli dei professionisti sono completati. La pubblicazione
                dell'amministratore attiva il ciclo.
              </p>
            </div>
          </div>
          <div className="pf-stack">
            {readyCycles.map((cycle) => (
              <div key={cycle.id} className="pf-card">
                <div className="pf-card-top">
                  <div>
                    <h3>{cycle.area.name}</h3>
                    <p className="pf-muted">
                      {displayUser(cycle.user)} - v{cycle.version} -{" "}
                      {formatDate(cycle.createdAt)}
                    </p>
                  </div>
                  <StatusBadge tone="success">Pronto</StatusBadge>
                </div>
                <div className="pf-actions">
                  <button
                    className="pf-button"
                    type="button"
                    disabled={busyKey === `publish:${cycle.id}`}
                    onClick={() => publishCycle(cycle.id)}
                  >
                    Pubblica
                  </button>
                </div>
              </div>
            ))}
            {readyTrainingPlans.map((training) => (
              <div key={training.id} className="pf-card">
                <div className="pf-card-top">
                  <div>
                    <h3>
                      {training.specialization.sport.label} -{" "}
                      {training.specialization.label}
                    </h3>
                    <p className="pf-muted">
                      {displayUser(training.user)} - v{training.version} -{" "}
                      {formatDate(training.createdAt)}
                    </p>
                  </div>
                  <StatusBadge tone="success">Allenamento pronto</StatusBadge>
                </div>
                <div className="pf-actions">
                  <button
                    className="pf-button"
                    type="button"
                    disabled={busyKey === `training-publish:${training.id}`}
                    onClick={() => publishTrainingPlan(training.id)}
                  >
                    Pubblica allenamento
                  </button>
                </div>
              </div>
            ))}
            {!loading && readyCycles.length === 0 && readyTrainingPlans.length === 0 && (
              <EmptyState
                title="Nessun ciclo pronto"
                description="I cicli approvati appariranno qui per la pubblicazione diretta."
              />
            )}
          </div>
        </article>

        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Carico approvazioni</h2>
              <p className="pf-muted">
                Chi deve agire prima che l'amministratore possa pubblicare.
              </p>
            </div>
          </div>
          <div className="pf-stack">
            {(dashboard?.pendingQuestionApprovals ?? []).map((approval) => (
              <div key={approval.id} className="pf-metric-row">
                <span>
                  {approval.currentProfessional?.email ??
                    approval.professional.email}
                  <br />
                  <small>
                      {displayUser(approval.questionSet.user)} - {approval.area.name}
                  {approval.routingMismatch ? " - riassegnato" : ""}
                  </small>
                </span>
                <StatusBadge tone="warning">Questionario</StatusBadge>
              </div>
            ))}
            {(dashboard?.pendingPlanItems ?? []).map((item) => (
              <div key={item.id} className="pf-metric-row">
                <span>
                  {item.professional?.email ?? "Professionista non assegnato"}
                  <br />
                  <small>
                    {displayUser(item.user)} - {item.area.name}
                  </small>
                </span>
                <StatusBadge tone="warning">Attivita allenamento</StatusBadge>
              </div>
            ))}
            {(dashboard?.pendingTrainingPlans ?? []).map((training) => {
              const approval = training.questionSets[0]?.approvals[0];
              return (
                <div key={training.id} className="pf-metric-row">
                  <span>
                    {approval?.coach.email ?? "Allenatore non assegnato"}
                    <br />
                    <small>
                      {displayUser(training.user)} -{" "}
                      {training.specialization.sport.label} /{" "}
                      {training.specialization.label}
                    </small>
                  </span>
                  <StatusBadge tone="warning">Allenamento</StatusBadge>
                </div>
              );
            })}
            {!loading &&
              !(
                dashboard?.pendingQuestionApprovals.length ||
                dashboard?.pendingPlanItems.length ||
                dashboard?.pendingTrainingPlans.length
              ) && (
                <EmptyState
                  title="Nessuna approvazione pendente"
                  description="I professionisti non hanno revisioni aperte."
                />
              )}
          </div>
        </article>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Assegnazione atleti</h2>
            <p className="pf-muted">
              Assegna un professionista per atleta e area. Riassegnando un'area
              viene sostituito solo il responsabile di quell'area.
            </p>
          </div>
        </div>
        <div className="pf-grid pf-ownership-grid">
          {athletes.map((athlete) => {
            const assignedCount = athlete.areaStates.filter(
              (state) => state.linkedProfessional,
            ).length;

            return (
              <article key={athlete.id} className="pf-card pf-ownership-card">
                <div className="pf-card-top pf-ownership-header">
                  <div>
                    <h3>{displayUser(athlete)}</h3>
                    <p className="pf-muted pf-athlete-meta">
                      {athlete.isActive ? "Abilitato" : "In attesa attivazione"} -
                      onboarding {formatStatus(athlete.onboarding.status)} -
                      ranking {athlete.latestSnapshot?.rankingGlobal ?? "-"}
                    </p>
                  </div>
                  <StatusBadge
                    tone={
                      !athlete.isActive
                        ? "danger"
                        : assignedCount
                          ? "success"
                          : "warning"
                    }
                  >
                    {!athlete.isActive
                      ? "in attesa"
                      : `${assignedCount}/${athlete.areaStates.length} assegnati`}
                  </StatusBadge>
                </div>
                <div className="pf-ownership-actions">
                  <button
                    className="pf-button-secondary"
                    type="button"
                    disabled={busyKey === `active:${athlete.id}`}
                    onClick={() =>
                      setAthleteActive(athlete.id, !athlete.isActive)
                    }
                  >
                    {athlete.isActive ? "Disabilita atleta" : "Abilita atleta"}
                  </button>
                  <button
                    className="pf-button-danger"
                    type="button"
                    disabled={busyKey === `reset:${athlete.id}`}
                    onClick={() => setResetTarget({ athlete })}
                  >
                    Cancella dati
                  </button>
                  <button
                    className="pf-button-danger"
                    type="button"
                    disabled={busyKey === `delete:${athlete.id}`}
                    onClick={() => {
                      setDeleteTarget({ athlete });
                      setDeleteConfirmText("");
                    }}
                  >
                    Elimina atleta
                  </button>
                </div>
                <div className="pf-area-strip">
                  {athlete.areaStates.map((state) => (
                    <button
                      key={state.area.id}
                      className={`pf-area-pill ${state.pendingCycle ? "pending" : state.generationReady ? "ready" : ""} ${
                        state.linkedProfessional ? "assigned" : ""
                      }`}
                      type="button"
                      onClick={() => openAssignmentModal(athlete, state)}
                    >
                      <span>{state.area.name}</span>
                    </button>
                  ))}
                  {athlete.trainingState.sportSelection && (
                    <button
                      className={`pf-area-pill ${
                        athlete.trainingState.generationReady ? "ready" : ""
                      } ${athlete.trainingState.linkedCoach ? "assigned" : ""}`}
                      type="button"
                      onClick={() =>
                        openCoachAssignmentModal(
                          athlete,
                          athlete.trainingState.sportSelection!.specializationId,
                          `${athlete.trainingState.sportSelection!.sport.label} - ${athlete.trainingState.sportSelection!.specialization.label}`,
                        )
                      }
                    >
                      <span>
                        Allenamento:{" "}
                        {athlete.trainingState.sportSelection.sport.label} -{" "}
                        {
                          athlete.trainingState.sportSelection.specialization
                            .label
                        }
                      </span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Competenze professionisti</h2>
            <p className="pf-muted">
              L'instradamento delle approvazioni usa le competenze per area.
              Mantienilo esplicito e visibile.
            </p>
          </div>
        </div>
        <div className="pf-grid">
          {professionals.map((professional) => (
            <article key={professional.id} className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>{professional.email}</h3>
                  <p className="pf-muted">
                    {professional.professionalLinks.length} atleti collegati
                  </p>
                </div>
              </div>
              <div className="pf-checkbox-grid">
                {areas.map((area) => (
                  <label key={area.id} className="pf-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(
                        competencesByProfessional[professional.id]?.[area.id],
                      )}
                      onChange={(event) =>
                        setCompetencesByProfessional((prev) => ({
                          ...prev,
                          [professional.id]: {
                            ...(prev[professional.id] ?? {}),
                            [area.id]: event.target.checked,
                          },
                        }))
                      }
                    />
                    <span>{area.name}</span>
                  </label>
                ))}
              </div>
              <button
                className="pf-button-secondary"
                type="button"
                disabled={busyKey === `competences:${professional.id}`}
                onClick={() => saveCompetences(professional.id)}
              >
                Salva aree
              </button>
              <div className="pf-divider" />
              <p className="pf-muted">Competenze allenatore</p>
              <div className="pf-checkbox-grid">
                {(dashboard?.sports ?? []).flatMap((sport) =>
                  sport.specializations.map((specialization) => (
                    <label key={specialization.id} className="pf-checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(
                          coachCompetencesByProfessional[professional.id]?.[
                            specialization.id
                          ],
                        )}
                        onChange={(event) =>
                          setCoachCompetencesByProfessional((prev) => ({
                            ...prev,
                            [professional.id]: {
                              ...(prev[professional.id] ?? {}),
                              [specialization.id]: event.target.checked,
                            },
                          }))
                        }
                      />
                      <span>
                        {sport.label} - {specialization.label}
                      </span>
                    </label>
                  )),
                )}
              </div>
              <button
                className="pf-button-secondary"
                type="button"
                disabled={busyKey === `coach-competences:${professional.id}`}
                onClick={() => saveCoachCompetences(professional.id)}
              >
                Salva allenatore
              </button>
            </article>
          ))}
        </div>
      </section>

      {assignmentTarget && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal pf-assignment-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Assegnazione area</p>
                <h2>Seleziona professionista</h2>
              </div>
              <button
                className="pf-button-secondary"
                type="button"
                onClick={closeAssignmentModal}
              >
                Chiudi
              </button>
            </div>

            <div className="pf-assignment-summary">
              <div>
                <span>Utente</span>
                <strong>{displayUser(assignmentTarget.athlete)}</strong>
              </div>
              <div>
                <span>Zona driver</span>
                <strong>{assignmentTarget.state.area.name}</strong>
              </div>
              <div>
                <span>Attualmente assegnato</span>
                <strong>
                  {assignmentTarget.state.linkedProfessional?.email ??
                    "Nessun professionista"}
                </strong>
              </div>
            </div>

            <label className="pf-field pf-combobox-field">
              Professionista
              <input
                className="pf-input"
                value={professionalFilter}
                onChange={(event) => setProfessionalFilter(event.target.value)}
                placeholder="Cerca per nome o email"
                role="combobox"
                aria-expanded="true"
                aria-controls="professional-assignment-options"
                autoFocus
                autoComplete="off"
              />
            </label>

            <div
              className="pf-combobox-menu"
              id="professional-assignment-options"
            >
              {filteredAssignmentProfessionals.map((professional) => (
                <button
                  key={professional.id}
                  className={`pf-combobox-option ${
                    assignmentTarget.state.linkedProfessional?.id ===
                    professional.id
                      ? "selected"
                      : ""
                  }`}
                  type="button"
                  disabled={
                    busyKey ===
                    `link:${assignmentTarget.athlete.id}:${assignmentTarget.state.area.id}`
                  }
                  onClick={() =>
                    assignProfessional(
                      assignmentTarget.athlete.id,
                      assignmentTarget.state.area.id,
                      professional.id,
                    )
                  }
                >
                  {displayUser(professional)}
                </button>
              ))}
              {!filteredAssignmentProfessionals.length && (
                <div className="pf-alert warning">
                  Nessun professionista abilitato trovato per questa area.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {coachAssignmentTarget && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal pf-assignment-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Assegnazione allenatore</p>
                <h2>Seleziona allenatore</h2>
              </div>
              <button
                className="pf-button-secondary"
                type="button"
                onClick={closeCoachAssignmentModal}
              >
                Chiudi
              </button>
            </div>

            <div className="pf-assignment-summary">
              <div>
                <span>Utente</span>
                <strong>{displayUser(coachAssignmentTarget.athlete)}</strong>
              </div>
              <div>
                <span>Sport-specializzazione</span>
                <strong>{coachAssignmentTarget.label}</strong>
              </div>
              <div>
                <span>Attualmente assegnato</span>
                <strong>
                  {coachAssignmentTarget.athlete.trainingState.linkedCoach?.email ??
                    "Nessun allenatore"}
                </strong>
              </div>
            </div>

            <label className="pf-field pf-combobox-field">
              Allenatore
              <input
                className="pf-input"
                value={coachFilter}
                onChange={(event) => setCoachFilter(event.target.value)}
                placeholder="Cerca per nome o email"
                role="combobox"
                aria-expanded="true"
                autoFocus
                autoComplete="off"
              />
            </label>

            <div className="pf-combobox-menu">
              {filteredCoachAssignmentProfessionals.map((professional) => (
                <button
                  key={professional.id}
                  className={`pf-combobox-option ${
                    coachAssignmentTarget.athlete.trainingState.linkedCoach?.id ===
                    professional.id
                      ? "selected"
                      : ""
                  }`}
                  type="button"
                  disabled={
                    busyKey ===
                    `coach-link:${coachAssignmentTarget.athlete.id}:${coachAssignmentTarget.specializationId}`
                  }
                  onClick={() =>
                    assignCoach(
                      coachAssignmentTarget.athlete.id,
                      coachAssignmentTarget.specializationId,
                      professional.id,
                    )
                  }
                >
                  {displayUser(professional)}
                </button>
              ))}
              {!filteredCoachAssignmentProfessionals.length && (
                <div className="pf-alert warning">
                  Nessun allenatore abilitato trovato per questa specializzazione.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {resetTarget && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Conferma amministratore</p>
                <h2>Cancellare tutti i dati atleta?</h2>
                <p className="pf-muted">
                  {displayUser(resetTarget.athlete)}
                </p>
              </div>
              <StatusBadge tone="danger">Azione irreversibile</StatusBadge>
            </div>
            <div className="pf-alert warning">
              Verranno cancellati consensi privacy/AI, onboarding, obiettivo,
              sport, assegnazioni, allenamenti, questionari, risposte,
              snapshot, storico, audit e dati AI collegati all'atleta.
              Resteranno solo account, password e identita login.
            </div>
            <div className="pf-actions">
              <button
                className="pf-button-danger"
                type="button"
                disabled={busyKey === `reset:${resetTarget.athlete.id}`}
                onClick={resetAthleteData}
              >
                Conferma cancellazione
              </button>
              <button
                className="pf-button-secondary"
                type="button"
                disabled={busyKey === `reset:${resetTarget.athlete.id}`}
                onClick={() => setResetTarget(null)}
              >
                Annulla
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Conferma amministratore</p>
                <h2>Eliminare definitivamente l'atleta?</h2>
                <p className="pf-muted">
                  {displayUser(deleteTarget.athlete)}
                </p>
              </div>
              <StatusBadge tone="danger">Azione irreversibile</StatusBadge>
            </div>
            <div className="pf-alert warning">
              Verranno cancellati account, credenziali di login, identita
              collegate, consensi, onboarding, obiettivo, sport, assegnazioni,
              allenamenti, questionari, risposte, snapshot, storico, audit e
              dati AI collegati all'atleta.
            </div>
            <label className="pf-field">
              <span>Digita l'email dell'atleta per confermare</span>
              <input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder={deleteTarget.athlete.email}
                autoComplete="off"
              />
            </label>
            <div className="pf-actions">
              <button
                className="pf-button-danger"
                type="button"
                disabled={
                  busyKey === `delete:${deleteTarget.athlete.id}` ||
                  deleteConfirmText !== deleteTarget.athlete.email
                }
                onClick={deleteAthleteCompletely}
              >
                Elimina definitivamente
              </button>
              <button
                className="pf-button-secondary"
                type="button"
                disabled={busyKey === `delete:${deleteTarget.athlete.id}`}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmText("");
                }}
              >
                Annulla
              </button>
            </div>
          </section>
        </div>
      )}

      {exportConfirmOpen && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal">
            <div className="pf-panel-header">
              <div>
                <h2>Esportare prompt AI attivi?</h2>
                <p className="pf-muted">
                  Il file contiene prompt AI e configurazioni correnti con
                  valore sensibile/IP. Non include versioni storiche, log, dati
                  utente, sessioni o segreti.
                </p>
              </div>
            </div>
            <div className="pf-actions">
              <button
                className="pf-button"
                type="button"
                disabled={busyKey === "export-active-prompts"}
                onClick={() => void confirmExportActivePrompts()}
              >
                {busyKey === "export-active-prompts"
                  ? "Export..."
                  : "Conferma export"}
              </button>
              <button
                className="pf-button-secondary"
                type="button"
                disabled={busyKey === "export-active-prompts"}
                onClick={() => setExportConfirmOpen(false)}
              >
                Annulla
              </button>
            </div>
          </section>
        </div>
      )}

      {aiPreview && previewAthlete && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Anteprima AI</p>
                <h2>Contesto inviato all'AI</h2>
                <p className="pf-muted">
                  {previewAthlete.email} - {previewLabel} -{" "}
                  {aiPreview.provider}/{aiPreview.model}
                </p>
              </div>
              <StatusBadge tone="accent">{aiPreview.promptVersion}</StatusBadge>
            </div>

            <div className="pf-dashboard-grid">
              <article className="pf-review-section">
                <h4>Istruzione di sistema</h4>
                <p className="pf-muted">
                  {aiPreview.inputJson.prompt?.system ?? "-"}
                </p>
              </article>
              <article className="pf-review-section">
                <h4>Regole di generazione</h4>
                <pre className="pf-json-preview">
                  {JSON.stringify(
                    aiPreview.inputJson.prompt?.user?.constraints ?? {},
                    null,
                    2,
                  )}
                </pre>
              </article>
            </div>

            <article className="pf-review-section">
              <h4>Contesto atleta</h4>
              <pre className="pf-json-preview">
                {JSON.stringify(
                  aiPreview.inputJson.prompt?.user?.context ?? {},
                  null,
                  2,
                )}
              </pre>
            </article>

            <div className="pf-actions">
              <button
                className="pf-button"
                type="button"
                disabled={
                  previewTarget
                    ? busyKey ===
                      `generate:${previewTarget.athlete.id}:${previewTarget.area.id}`
                    : busyKey === `training:${previewAthlete.id}`
                }
                onClick={() =>
                  previewTarget
                    ? generateCycle(previewTarget.athlete.id, previewTarget.area.id)
                    : generateTraining(previewAthlete.id)
                }
              >
                {previewIsTraining
                  ? "Conferma e genera allenamento"
                  : "Conferma e invia all'AI"}
              </button>
              <button
                className="pf-button-secondary"
                type="button"
                onClick={closeAiPreview}
              >
                Annulla
              </button>
            </div>
          </section>
        </div>
      )}
    </ProductShell>
  );
}
