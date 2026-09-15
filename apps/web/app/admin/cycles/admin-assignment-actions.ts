import { API_BASE, secureFetch } from "@/app/lib/api";
import type { Dispatch, SetStateAction } from "react";
import { readError } from "./admin-cycles-model";
export async function assignProfessionalAction(
  actionState: {
    setMessage: Dispatch<SetStateAction<string | null>>;
    professionalCanHandleArea: (
      professionalId: string,
      areaId: string,
    ) => boolean;
    setBusyKey: Dispatch<SetStateAction<string | null>>;
    closeAssignmentModal: () => void;
    loadDashboard: () => Promise<void>;
  },
  athleteId: string,
  areaId: string,
  professionalId: string,
) {
  const {
    setMessage,
    professionalCanHandleArea,
    setBusyKey,
    closeAssignmentModal,
    loadDashboard,
  } = actionState;

  if (!areaId) {
    setMessage("Seleziona un'area prima di assegnare un professionista.");
    return;
  }
  if (!professionalId) {
    setMessage("Seleziona un professionista prima dell'assegnazione.");
    return;
  }
  if (!professionalCanHandleArea(professionalId, areaId)) {
    setMessage(
      "Il professionista selezionato non e abilitato per questa area.",
    );
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
}

export async function saveCompetencesAction(
  actionState: {
    competencesByProfessional: Record<string, Record<string, boolean>>;
    setMessage: Dispatch<SetStateAction<string | null>>;
    setBusyKey: Dispatch<SetStateAction<string | null>>;
    loadDashboard: () => Promise<void>;
  },
  professionalId: string,
) {
  const { competencesByProfessional, setMessage, setBusyKey, loadDashboard } =
    actionState;

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
    setMessage(
      `Aggiornamento competenze non riuscito: ${await readError(response)}`,
    );
    setBusyKey(null);
    return;
  }
  setMessage(
    "Competenze salvate. Il professionista vede gli atleti collegati e le approvazioni coerenti.",
  );
  await loadDashboard();
  setBusyKey(null);
}

export async function assignCoachAction(
  actionState: {
    setMessage: Dispatch<SetStateAction<string | null>>;
    coachCanHandleSpecialization: (
      coachId: string,
      specializationId: string,
    ) => boolean;
    setBusyKey: Dispatch<SetStateAction<string | null>>;
    closeCoachAssignmentModal: () => void;
    loadDashboard: () => Promise<void>;
  },
  athleteId: string,
  specializationId: string,
  coachId: string,
) {
  const {
    setMessage,
    coachCanHandleSpecialization,
    setBusyKey,
    closeCoachAssignmentModal,
    loadDashboard,
  } = actionState;

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
    setMessage(
      `Assegnazione allenatore non riuscita: ${await readError(response)}`,
    );
    setBusyKey(null);
    return;
  }
  setMessage("Allenatore assegnato alla sport-specializzazione dell'atleta.");
  closeCoachAssignmentModal();
  await loadDashboard();
  setBusyKey(null);
}

export async function saveCoachCompetencesAction(
  actionState: {
    coachCompetencesByProfessional: Record<string, Record<string, boolean>>;
    setMessage: Dispatch<SetStateAction<string | null>>;
    setBusyKey: Dispatch<SetStateAction<string | null>>;
    loadDashboard: () => Promise<void>;
  },
  coachId: string,
) {
  const {
    coachCompetencesByProfessional,
    setMessage,
    setBusyKey,
    loadDashboard,
  } = actionState;

  const selected = Object.entries(coachCompetencesByProfessional[coachId] ?? {})
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
    setMessage(
      `Aggiornamento competenze allenatore non riuscito: ${await readError(response)}`,
    );
    setBusyKey(null);
    return;
  }
  setMessage("Competenze allenatore salvate.");
  await loadDashboard();
  setBusyKey(null);
}
