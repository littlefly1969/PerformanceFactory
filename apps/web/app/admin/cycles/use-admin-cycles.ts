"use client";

import { API_BASE, secureFetch } from "@/app/lib/api";
import { useEffect, useMemo, useState } from "react";
import {
  assignCoachAction,
  assignProfessionalAction,
  saveCoachCompetencesAction,
  saveCompetencesAction,
} from "./admin-assignment-actions";
import {
  deleteAthleteCompletelyAction,
  rejectAthleteApplicationAction,
  resetAthleteDataAction,
  setAthleteActiveAction,
} from "./admin-athlete-actions";
import {
  confirmExportActivePromptsAction,
  generateCycleAction,
  generateTrainingAction,
  openAiPreviewAction,
  openTrainingPreviewAction,
  publishCycleAction,
  publishTrainingPlanAction,
} from "./admin-cycle-actions";
import {
  AiPreview,
  Area,
  AreaState,
  AssignmentTarget,
  Athlete,
  CoachAssignmentTarget,
  Dashboard,
  DeleteTarget,
  displayUser,
  PreviewTarget,
  readError,
  ResetTarget,
  TrainingPreviewTarget,
  UserRef,
} from "./admin-cycles-model";
export function useAdminCycles() {
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
  const athletes = useMemo(
    () =>
      dashboard?.athletes.filter(
        (athlete) => athlete.onboarding.status !== "REJECTED",
      ) ?? [],
    [dashboard],
  );
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
  const previewAthlete =
    previewTarget?.athlete ?? trainingPreviewTarget?.athlete;
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
  const assignProfessional = (
    athleteId: string,
    areaId: string,
    professionalId: string,
  ) =>
    assignProfessionalAction(
      {
        setMessage,
        professionalCanHandleArea,
        setBusyKey,
        closeAssignmentModal,
        loadDashboard,
      },
      athleteId,
      areaId,
      professionalId,
    );
  const saveCompetences = (professionalId: string) =>
    saveCompetencesAction(
      { competencesByProfessional, setMessage, setBusyKey, loadDashboard },
      professionalId,
    );
  const assignCoach = (
    athleteId: string,
    specializationId: string,
    coachId: string,
  ) =>
    assignCoachAction(
      {
        setMessage,
        coachCanHandleSpecialization,
        setBusyKey,
        closeCoachAssignmentModal,
        loadDashboard,
      },
      athleteId,
      specializationId,
      coachId,
    );
  const saveCoachCompetences = (coachId: string) =>
    saveCoachCompetencesAction(
      { coachCompetencesByProfessional, setMessage, setBusyKey, loadDashboard },
      coachId,
    );
  const openAiPreview = (athlete: UserRef, area: Area) =>
    openAiPreviewAction(
      {
        setBusyKey,
        setMessage,
        setAiPreview,
        setPreviewTarget,
        setTrainingPreviewTarget,
      },
      athlete,
      area,
    );
  const openTrainingPreview = (athlete: Athlete) =>
    openTrainingPreviewAction(
      {
        setBusyKey,
        setMessage,
        setAiPreview,
        setPreviewTarget,
        setTrainingPreviewTarget,
      },
      athlete,
    );
  const closeAiPreview = () => {
    setAiPreview(null);
    setPreviewTarget(null);
    setTrainingPreviewTarget(null);
  };
  const generateCycle = (athleteId: string, areaId: string) =>
    generateCycleAction(
      { setBusyKey, setMessage, closeAiPreview, loadDashboard },
      athleteId,
      areaId,
    );
  const generateTraining = (athleteId: string) =>
    generateTrainingAction(
      { setBusyKey, setMessage, closeAiPreview, loadDashboard },
      athleteId,
    );
  const publishCycle = (cycleId: string) =>
    publishCycleAction({ setBusyKey, setMessage, loadDashboard }, cycleId);
  const publishTrainingPlan = (trainingPlanId: string) =>
    publishTrainingPlanAction(
      { setBusyKey, setMessage, loadDashboard },
      trainingPlanId,
    );
  const confirmExportActivePrompts = () =>
    confirmExportActivePromptsAction({
      setBusyKey,
      setMessage,
      setExportConfirmOpen,
    });
  const setAthleteActive = (athleteId: string, active: boolean) =>
    setAthleteActiveAction(
      { setBusyKey, setMessage, loadDashboard },
      athleteId,
      active,
    );
  const rejectAthleteApplication = (athleteId: string) =>
    rejectAthleteApplicationAction(
      { setBusyKey, setMessage, loadDashboard },
      athleteId,
    );
  const resetAthleteData = () =>
    resetAthleteDataAction({
      resetTarget,
      setBusyKey,
      setMessage,
      setResetTarget,
      loadDashboard,
    });
  const deleteAthleteCompletely = () =>
    deleteAthleteCompletelyAction({
      deleteTarget,
      setBusyKey,
      setMessage,
      setDeleteTarget,
      setDeleteConfirmText,
      loadDashboard,
    });
  return {
    dashboard,
    setDashboard,
    loading,
    setLoading,
    message,
    setMessage,
    busyKey,
    setBusyKey,
    competencesByProfessional,
    setCompetencesByProfessional,
    coachCompetencesByProfessional,
    setCoachCompetencesByProfessional,
    aiPreview,
    setAiPreview,
    previewTarget,
    setPreviewTarget,
    trainingPreviewTarget,
    setTrainingPreviewTarget,
    assignmentTarget,
    setAssignmentTarget,
    coachAssignmentTarget,
    setCoachAssignmentTarget,
    resetTarget,
    setResetTarget,
    deleteTarget,
    setDeleteTarget,
    deleteConfirmText,
    setDeleteConfirmText,
    exportConfirmOpen,
    setExportConfirmOpen,
    professionalFilter,
    setProfessionalFilter,
    coachFilter,
    setCoachFilter,
    athletes,
    professionals,
    areas,
    readyToGenerate,
    readyTraining,
    waitingApproval,
    readyCycles,
    readyTrainingPlans,
    pendingActivation,
    professionalCanHandleArea,
    enabledProfessionalsForArea,
    coachCanHandleSpecialization,
    previewAthlete,
    previewLabel,
    previewIsTraining,
    enabledCoachesForSpecialization,
    filteredAssignmentProfessionals,
    filteredCoachAssignmentProfessionals,
    loadDashboard,
    openAssignmentModal,
    closeAssignmentModal,
    openCoachAssignmentModal,
    closeCoachAssignmentModal,
    assignProfessional,
    saveCompetences,
    assignCoach,
    saveCoachCompetences,
    openAiPreview,
    openTrainingPreview,
    closeAiPreview,
    generateCycle,
    generateTraining,
    publishCycle,
    publishTrainingPlan,
    confirmExportActivePrompts,
    setAthleteActive,
    rejectAthleteApplication,
    resetAthleteData,
    deleteAthleteCompletely,
  };
}
export type AdminCyclesModel = ReturnType<typeof useAdminCycles>;
