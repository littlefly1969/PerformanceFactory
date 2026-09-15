import { API_BASE, secureFetch } from "@/app/lib/api";
import type { Dispatch, SetStateAction } from "react";
import { DeleteTarget, readError, ResetTarget } from "./admin-cycles-model";
export async function setAthleteActiveAction(
  actionState: {
    setBusyKey: Dispatch<SetStateAction<string | null>>;
    setMessage: Dispatch<SetStateAction<string | null>>;
    loadDashboard: () => Promise<void>;
  },
  athleteId: string,
  active: boolean,
) {
  const { setBusyKey, setMessage, loadDashboard } = actionState;

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
    setMessage(
      `Aggiornamento atleta non riuscito: ${await readError(response)}`,
    );
    setBusyKey(null);
    return;
  }
  setMessage(active ? "Atleta abilitato." : "Atleta disabilitato.");
  await loadDashboard();
  setBusyKey(null);
}

export async function rejectAthleteApplicationAction(
  actionState: {
    setBusyKey: Dispatch<SetStateAction<string | null>>;
    setMessage: Dispatch<SetStateAction<string | null>>;
    loadDashboard: () => Promise<void>;
  },
  athleteId: string,
) {
  const { setBusyKey, setMessage, loadDashboard } = actionState;

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
    setMessage(
      `Rifiuto candidatura non riuscito: ${await readError(response)}`,
    );
    setBusyKey(null);
    return;
  }
  setMessage(
    "Candidatura atleta rifiutata. L'utente potra riproporne una nuova.",
  );
  await loadDashboard();
  setBusyKey(null);
}

export async function resetAthleteDataAction(actionState: {
  resetTarget: ResetTarget | null;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setResetTarget: Dispatch<SetStateAction<ResetTarget | null>>;
  loadDashboard: () => Promise<void>;
}) {
  const { resetTarget, setBusyKey, setMessage, setResetTarget, loadDashboard } =
    actionState;

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
}

export async function deleteAthleteCompletelyAction(actionState: {
  deleteTarget: DeleteTarget | null;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setDeleteTarget: Dispatch<SetStateAction<DeleteTarget | null>>;
  setDeleteConfirmText: Dispatch<SetStateAction<string>>;
  loadDashboard: () => Promise<void>;
}) {
  const {
    deleteTarget,
    setBusyKey,
    setMessage,
    setDeleteTarget,
    setDeleteConfirmText,
    loadDashboard,
  } = actionState;

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
    setMessage(
      `Eliminazione atleta non riuscita: ${await readError(response)}`,
    );
    setBusyKey(null);
    return;
  }
  setMessage("Atleta eliminato definitivamente.");
  setDeleteTarget(null);
  setDeleteConfirmText("");
  await loadDashboard();
  setBusyKey(null);
}
