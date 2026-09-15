"use client";

import {
  API_BASE,
  redirectIfOnboardingRequired,
  secureFetch,
} from "@/app/lib/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, Piano, TrainingPlan } from "./user-plan-model";
export function useUserPlan() {
  const [plan, setPiano] = useState<Piano | null>(null);
  const [training, setTraining] = useState<TrainingPlan | null>(null);
  const [trainingHistory, setTrainingHistory] = useState<TrainingPlan[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [trainingMessage, setTrainingMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [ratingById, setRatingById] = useState<Record<string, string>>({});
  const [areas, setAree] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [plansByArea, setPianosByArea] = useState<Record<string, Piano | null>>(
    {},
  );
  const planRequestIdRef = useRef(0);
  const areaIdRef = useRef(areaId);
  useEffect(() => {
    areaIdRef.current = areaId;
  }, [areaId]);
  const activeAreaItems = useMemo(
    () => plan?.items.filter((item) => item.status === "ACTIVE") ?? [],
    [plan],
  );
  const trainingItems = useMemo(
    () =>
      training?.items?.length
        ? training.items
        : (training?.outputJson?.planItems ?? []),
    [training],
  );
  const activeTrainingItems = useMemo(
    () => training?.items?.filter((item) => item.status === "ACTIVE") ?? [],
    [training],
  );
  const completedTrainingItems = useMemo(
    () => training?.items?.filter((item) => item.status === "COMPLETED") ?? [],
    [training],
  );
  const totalOpenActivities =
    activeAreaItems.length + activeTrainingItems.length;
  const loadTraining = useCallback(async () => {
    setTrainingLoading(true);
    setTrainingMessage(null);
    const [currentResponse, historyResponse] = await Promise.all([
      secureFetch(`${API_BASE}/user/training/current`, {
        credentials: "include",
      }),
      secureFetch(`${API_BASE}/user/training/history`, {
        credentials: "include",
      }),
    ]);

    if (currentResponse.ok) {
      setTraining((await currentResponse.json()) as TrainingPlan);
    } else {
      setTraining(null);
      if (currentResponse.status !== 404) {
        setTrainingMessage("Impossibile caricare il percorso sportivo.");
      }
    }

    if (historyResponse.ok) {
      setTrainingHistory((await historyResponse.json()) as TrainingPlan[]);
    }
    setTrainingLoading(false);
  }, []);
  const loadAree = useCallback(async () => {
    const response = await secureFetch(`${API_BASE}/areas`, {
      credentials: "include",
    });
    if (response.ok) {
      const loadedAree = (await response.json()) as Area[];
      setAree(loadedAree);
      const entries = await Promise.all(
        loadedAree.map(async (area) => {
          const planResponse = await secureFetch(
            `${API_BASE}/user/plan/current?areaId=${encodeURIComponent(area.id)}`,
            { credentials: "include" },
          );
          return [
            area.id,
            planResponse.ok ? ((await planResponse.json()) as Piano) : null,
          ] as const;
        }),
      );
      const nextPianos = Object.fromEntries(entries);
      setPianosByArea(nextPianos);
      const firstActive = entries.find(([, areaPiano]) =>
        areaPiano?.items.some((item) => item.status === "ACTIVE"),
      );
      const requestedAreaId =
        typeof window === "undefined"
          ? ""
          : new URLSearchParams(window.location.search).get("areaId");
      const nextAreaId =
        areaIdRef.current ||
        (requestedAreaId &&
        loadedAree.some((area) => area.id === requestedAreaId)
          ? requestedAreaId
          : "") ||
        firstActive?.[0] ||
        loadedAree[0]?.id ||
        "";
      setAreaId(nextAreaId);
      setPiano(nextPianos[nextAreaId] ?? null);
    }
  }, []);
  const loadPiano = useCallback(async (selectedAreaId = areaIdRef.current) => {
    const requestId = planRequestIdRef.current + 1;
    planRequestIdRef.current = requestId;
    setLoading(true);
    setAuthHint(null);
    setMessage(null);
    setNotesById({});
    setRatingById({});

    if (!selectedAreaId) {
      if (planRequestIdRef.current !== requestId) {
        return;
      }
      setPiano(null);
      setMessage("Seleziona un'area per caricare i lavori correnti.");
      setLoading(false);
      return;
    }

    const response = await secureFetch(
      `${API_BASE}/user/plan/current?areaId=${encodeURIComponent(selectedAreaId)}`,
      { credentials: "include" },
    );

    if (planRequestIdRef.current !== requestId) {
      return;
    }

    if (!response.ok) {
      setPiano(null);
      if (response.status === 401) {
        setAuthHint("Accedi per vedere i tuoi lavori.");
      } else if (response.status >= 500) {
        setMessage("Impossibile caricare i lavori correnti.");
      }
      setLoading(false);
      return;
    }

    const nextPlan = (await response.json()) as Piano;
    if (planRequestIdRef.current !== requestId) {
      return;
    }
    setPiano(nextPlan);
    setLoading(false);
  }, []);
  const loadAll = useCallback(async () => {
    await Promise.all([loadTraining(), loadAree()]);
  }, [loadAree, loadTraining]);
  useEffect(() => {
    void (async () => {
      if (!(await redirectIfOnboardingRequired())) {
        await loadAll();
      }
    })();
  }, [loadAll]);
  useEffect(() => {
    if (areaId) {
      if (Object.prototype.hasOwnProperty.call(plansByArea, areaId)) {
        planRequestIdRef.current += 1;
        setAuthHint(null);
        setMessage(null);
        setNotesById({});
        setRatingById({});
        setPiano(plansByArea[areaId] ?? null);
        setLoading(false);
        return;
      }
      void loadPiano(areaId);
    }
  }, [areaId, loadPiano, plansByArea]);
  const buildCompletionPayload = (itemId: string) => {
    const completionNotes = notesById[itemId]?.trim();
    const ratingRaw = ratingById[itemId]?.trim();
    const payload: { completionNotes?: string; completionRating?: number } = {};

    if (completionNotes) {
      payload.completionNotes = completionNotes;
    }
    if (ratingRaw) {
      const parsed = Number(ratingRaw);
      if (Number.isFinite(parsed)) {
        payload.completionRating = Math.trunc(parsed);
      }
    }

    return payload;
  };
  const completePlanItem = async (itemId: string) => {
    setMessage(null);

    const response = await secureFetch(
      `${API_BASE}/user/plan-items/${itemId}/complete`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCompletionPayload(itemId)),
      },
    );

    if (!response.ok) {
      setMessage(
        response.status === 409
          ? "Questa attivita e gia stata completata."
          : "Completamento non riuscito.",
      );
      return;
    }

    await loadAree();
    await loadPiano(areaId);
  };
  const completeTrainingItem = async (itemId: string) => {
    setTrainingMessage(null);

    const response = await secureFetch(
      `${API_BASE}/user/training-plan-items/${itemId}/complete`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCompletionPayload(itemId)),
      },
    );

    if (!response.ok) {
      setTrainingMessage(
        response.status === 409
          ? "Questo esercizio e gia stato completato."
          : "Completamento esercizio non riuscito.",
      );
      return;
    }

    setTrainingMessage("Esercizio completato.");
    await loadTraining();
  };
  return {
    plan,
    setPiano,
    training,
    setTraining,
    trainingHistory,
    setTrainingHistory,
    message,
    setMessage,
    trainingMessage,
    setTrainingMessage,
    loading,
    setLoading,
    trainingLoading,
    setTrainingLoading,
    authHint,
    setAuthHint,
    notesById,
    setNotesById,
    ratingById,
    setRatingById,
    areas,
    setAree,
    areaId,
    setAreaId,
    plansByArea,
    setPianosByArea,
    planRequestIdRef,
    areaIdRef,
    activeAreaItems,
    trainingItems,
    activeTrainingItems,
    completedTrainingItems,
    totalOpenActivities,
    loadTraining,
    loadAree,
    loadPiano,
    loadAll,
    buildCompletionPayload,
    completePlanItem,
    completeTrainingItem,
  };
}
export type UserPlanModel = ReturnType<typeof useUserPlan>;
