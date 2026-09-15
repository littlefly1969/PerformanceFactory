import { API_BASE, secureFetch } from "@/app/lib/api";
import { downloadResponseBody } from "@/app/lib/download";
import type { Dispatch, SetStateAction } from "react";
import {
  AiPreview,
  Area,
  Athlete,
  PreviewTarget,
  readError,
  TrainingPreviewTarget,
  UserRef,
} from "./admin-cycles-model";
export async function openAiPreviewAction(
  actionState: {
    setBusyKey: Dispatch<SetStateAction<string | null>>;
    setMessage: Dispatch<SetStateAction<string | null>>;
    setAiPreview: Dispatch<SetStateAction<AiPreview | null>>;
    setPreviewTarget: Dispatch<SetStateAction<PreviewTarget | null>>;
    setTrainingPreviewTarget: Dispatch<
      SetStateAction<TrainingPreviewTarget | null>
    >;
  },
  athlete: UserRef,
  area: Area,
) {
  const {
    setBusyKey,
    setMessage,
    setAiPreview,
    setPreviewTarget,
    setTrainingPreviewTarget,
  } = actionState;

  setBusyKey(`preview:${athlete.id}:${area.id}`);
  setMessage(null);
  const response = await secureFetch(`${API_BASE}/admin/orchestrator/preview`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userIds: [athlete.id],
      areaId: area.id,
      runAllAreas: false,
    }),
  });
  if (!response.ok) {
    setMessage(`Anteprima AI non riuscita: ${await readError(response)}`);
    setBusyKey(null);
    return;
  }
  setAiPreview((await response.json()) as AiPreview);
  setPreviewTarget({ athlete, area });
  setTrainingPreviewTarget(null);
  setBusyKey(null);
}

export async function openTrainingPreviewAction(
  actionState: {
    setBusyKey: Dispatch<SetStateAction<string | null>>;
    setMessage: Dispatch<SetStateAction<string | null>>;
    setAiPreview: Dispatch<SetStateAction<AiPreview | null>>;
    setPreviewTarget: Dispatch<SetStateAction<PreviewTarget | null>>;
    setTrainingPreviewTarget: Dispatch<
      SetStateAction<TrainingPreviewTarget | null>
    >;
  },
  athlete: Athlete,
) {
  const {
    setBusyKey,
    setMessage,
    setAiPreview,
    setPreviewTarget,
    setTrainingPreviewTarget,
  } = actionState;

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
    setMessage(
      `Anteprima allenamento non riuscita: ${await readError(response)}`,
    );
    setBusyKey(null);
    return;
  }
  setAiPreview((await response.json()) as AiPreview);
  setPreviewTarget(null);
  setTrainingPreviewTarget({ athlete });
  setBusyKey(null);
}

export async function generateCycleAction(
  actionState: {
    setBusyKey: Dispatch<SetStateAction<string | null>>;
    setMessage: Dispatch<SetStateAction<string | null>>;
    closeAiPreview: () => void;
    loadDashboard: () => Promise<void>;
  },
  athleteId: string,
  areaId: string,
) {
  const { setBusyKey, setMessage, closeAiPreview, loadDashboard } = actionState;

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
  setMessage(
    "Proposta AI generata e inviata all'approvazione del professionista.",
  );
  closeAiPreview();
  await loadDashboard();
  setBusyKey(null);
}

export async function generateTrainingAction(
  actionState: {
    setBusyKey: Dispatch<SetStateAction<string | null>>;
    setMessage: Dispatch<SetStateAction<string | null>>;
    closeAiPreview: () => void;
    loadDashboard: () => Promise<void>;
  },
  athleteId: string,
) {
  const { setBusyKey, setMessage, closeAiPreview, loadDashboard } = actionState;

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
    setMessage(
      `Generazione allenamento non riuscita: ${await readError(response)}`,
    );
    setBusyKey(null);
    return;
  }
  setMessage(
    "Allenamento specifico generato e inviato all'approvazione dell'allenatore.",
  );
  closeAiPreview();
  await loadDashboard();
  setBusyKey(null);
}

export async function publishCycleAction(
  actionState: {
    setBusyKey: Dispatch<SetStateAction<string | null>>;
    setMessage: Dispatch<SetStateAction<string | null>>;
    loadDashboard: () => Promise<void>;
  },
  cycleId: string,
) {
  const { setBusyKey, setMessage, loadDashboard } = actionState;

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
}

export async function publishTrainingPlanAction(
  actionState: {
    setBusyKey: Dispatch<SetStateAction<string | null>>;
    setMessage: Dispatch<SetStateAction<string | null>>;
    loadDashboard: () => Promise<void>;
  },
  trainingPlanId: string,
) {
  const { setBusyKey, setMessage, loadDashboard } = actionState;

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
    setMessage(
      `Pubblicazione allenamento non riuscita: ${await readError(response)}`,
    );
    setBusyKey(null);
    return;
  }
  setMessage(
    "Allenamento pubblicato. L'atleta ora vede esercizi e questionario.",
  );
  await loadDashboard();
  setBusyKey(null);
}

export async function confirmExportActivePromptsAction(actionState: {
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setExportConfirmOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const { setBusyKey, setMessage, setExportConfirmOpen } = actionState;

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
}
