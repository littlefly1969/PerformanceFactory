"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import {
  API_BASE,
  secureFetch,
  redirectIfOnboardingRequired,
} from "@/app/lib/api";

type PlanItem = {
  id: string;
  status: string;
  title: string;
  body: string;
  area?: { id: string; name: string };
  completedAt?: string | null;
  completionNotes?: string | null;
  completionRating?: number | null;
};

type Piano = {
  id: string;
  areaId: string;
  version: number;
  status: string;
  createdAt: string;
  items: PlanItem[];
};

type TrainingOutput = {
  summaryText?: string;
  planItems?: Array<{
    type?: string;
    title?: string;
    body?: string;
  }>;
};

type TrainingPlan = {
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

type Area = { id: string; name: string };

const cleanStato = (status: string) =>
  ({
    ACTIVE: "attivo",
    COMPLETED: "completato",
    CLOSED: "chiuso",
    PENDING: "in attesa",
    PUBLISHED: "pubblicato",
  })[status] ?? status.replace(/_/g, " ").toLowerCase();

const formatDate = (value?: string | null) => {
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

export default function UserPianoPage() {
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
    () =>
      training?.items?.filter((item) => item.status === "ACTIVE") ?? [],
    [training],
  );
  const completedTrainingItems = useMemo(
    () =>
      training?.items?.filter((item) => item.status === "COMPLETED") ?? [],
    [training],
  );
  const totalOpenActivities = activeAreaItems.length + activeTrainingItems.length;

  const loadTraining = async () => {
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
  };

  const loadAree = async () => {
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
        areaId ||
        (requestedAreaId && loadedAree.some((area) => area.id === requestedAreaId)
          ? requestedAreaId
          : "") ||
        firstActive?.[0] ||
        loadedAree[0]?.id ||
        "";
      setAreaId(nextAreaId);
      setPiano(nextPianos[nextAreaId] ?? null);
    }
  };

  const loadPiano = async (selectedAreaId = areaId) => {
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
  };

  const loadAll = async () => {
    await Promise.all([loadTraining(), loadAree()]);
  };

  useEffect(() => {
    void (async () => {
      if (!(await redirectIfOnboardingRequired())) {
        await loadAll();
      }
    })();
  }, []);

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
  }, [areaId, plansByArea]);

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

  return (
    <ProductShell
      eyebrow="Ambiente atleta"
      title="Attivita"
      description="Percorso sportivo e lavori per area sono nello stesso spazio, ma restano distinti per obiettivo e responsabilita."
      actions={
        <button
          className="pf-button-secondary"
          type="button"
          onClick={() => loadAll()}
        >
          Aggiorna
        </button>
      }
      stats={[
        {
          label: "Attivita aperte",
          value: loading || trainingLoading ? "..." : totalOpenActivities,
          tone: "accent",
        },
        {
          label: "Percorso sportivo",
          value: training ? cleanStato(training.status) : "-",
          tone: training ? "success" : "neutral",
        },
        {
          label: "Lavori area",
          value: loading ? "..." : activeAreaItems.length,
          tone: "warning",
        },
      ]}
    >
      <section className="pf-panel pf-focus-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Percorso sportivo</h2>
            <p className="pf-muted">
              Lavoro complessivo generato per sport e specializzazione.
            </p>
          </div>
          {training && (
            <StatusBadge tone="success">{cleanStato(training.status)}</StatusBadge>
          )}
        </div>

        {trainingMessage && <div className="pf-alert">{trainingMessage}</div>}

        {!trainingLoading && !training && (
          <EmptyState
            title="Nessun percorso sportivo"
            description="Quando viene pubblicato, lo vedrai qui separato dai lavori per area."
          />
        )}

        {training && (
          <div className="pf-stack">
            <div>
              <p className="pf-muted">
                Generato il {formatDate(training.createdAt)}
                {training.specialization
                  ? ` - ${training.specialization.sport.label} / ${training.specialization.label}`
                  : ""}
              </p>
              <p>{training.summaryText}</p>
            </div>

            {trainingItems.map((item, index) => {
              const itemId =
                "id" in item && typeof item.id === "string" ? item.id : null;
              const itemStatus =
                "status" in item && typeof item.status === "string"
                  ? item.status
                  : "";
              const actionable = Boolean(itemId) && itemStatus === "ACTIVE";
              const completed = itemStatus === "COMPLETED";
              const completedAt =
                "completedAt" in item &&
                (typeof item.completedAt === "string" ||
                  item.completedAt === null)
                  ? item.completedAt
                  : null;
              const completionRating =
                "completionRating" in item &&
                typeof item.completionRating === "number"
                  ? item.completionRating
                  : null;

              return (
                <article
                  key={`${item.title ?? "item"}:${index}`}
                  className="pf-card pf-active-plan-card"
                >
                  <div className="pf-card-top pf-active-plan-header">
                    <div>
                      <p className="pf-eyebrow">
                        {"type" in item ? item.type : "Percorso sportivo"}
                      </p>
                      <h3>{item.title ?? `Blocco ${index + 1}`}</h3>
                    </div>
                    {itemStatus && (
                      <StatusBadge tone={completed ? "success" : "accent"}>
                        {cleanStato(itemStatus)}
                      </StatusBadge>
                    )}
                  </div>
                  <p className="pf-active-plan-body">{item.body}</p>
                  {completed && (
                    <p className="pf-muted">
                      Completato {formatDate(completedAt)}
                      {completionRating ? ` - voto ${completionRating}/10` : ""}
                    </p>
                  )}
                  {actionable && itemId && (
                    <>
                      <div className="pf-grid pf-active-plan-form">
                        <label className="pf-field">
                          Note di completamento
                          <textarea
                            className="pf-textarea"
                            rows={3}
                            value={notesById[itemId] ?? ""}
                            onChange={(event) =>
                              setNotesById((prev) => ({
                                ...prev,
                                [itemId]: event.target.value,
                              }))
                            }
                            placeholder="Cosa hai completato?"
                          />
                        </label>
                        <label className="pf-field">
                          Voto
                          <input
                            className="pf-input"
                            type="number"
                            min={1}
                            max={10}
                            value={ratingById[itemId] ?? ""}
                            onChange={(event) =>
                              setRatingById((prev) => ({
                                ...prev,
                                [itemId]: event.target.value,
                              }))
                            }
                            placeholder="1-10"
                          />
                        </label>
                      </div>
                      <div className="pf-active-plan-actions">
                        <button
                          className="pf-button"
                          type="button"
                          onClick={() => completeTrainingItem(itemId)}
                        >
                          Segna come completato
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}

            <div className="pf-metric-row">
              <span>Completati</span>
              <strong>{completedTrainingItems.length}</strong>
            </div>
            <div className="pf-metric-row">
              <span>Storico percorso</span>
              <strong>{trainingHistory.length}</strong>
            </div>
          </div>
        )}
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Lavori per area</h2>
            <p className="pf-muted">
              Attivita operative collegate alle aree performance.
            </p>
          </div>
        </div>
        <div className="pf-area-grid">
          {areas.map((area) => {
            const areaPiano = plansByArea[area.id];
            const active =
              areaPiano?.items.filter((item) => item.status === "ACTIVE")
                .length ?? 0;
            const completed =
              areaPiano?.items.filter((item) => item.status === "COMPLETED")
                .length ?? 0;
            const selected = area.id === areaId;
            return (
              <button
                key={area.id}
                className={`pf-area-card ${selected ? "selected" : ""} ${active ? "attention" : ""}`}
                type="button"
                onClick={() => {
                  planRequestIdRef.current += 1;
                  setAreaId(area.id);
                  setPiano(areaPiano ?? null);
                  setAuthHint(null);
                  setMessage(null);
                  setNotesById({});
                  setRatingById({});
                  setLoading(false);
                }}
              >
                <span>
                  <strong>{area.name}</strong>
                  <small>
                    {active
                      ? `${active} ${active === 1 ? "lavoro" : "lavori"} da fare`
                      : completed
                        ? `${completed} completati`
                        : "Da assegnare"}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Lavori aperti</h2>
            <p className="pf-muted">
              Completa le attivita solo quando sono state davvero eseguite.
            </p>
          </div>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadPiano()}
          >
            Aggiorna lavori
          </button>
        </div>

        {authHint && <div className="pf-alert warning">{authHint}</div>}
        {message && <div className="pf-alert">{message}</div>}

        <div className="pf-stack">
          {activeAreaItems.map((item) => (
            <article key={item.id} className="pf-card pf-active-plan-card">
              <div className="pf-card-top pf-active-plan-header">
                <div>
                  <p className="pf-active-plan-area">
                    {item.area?.name ?? "Area"}
                  </p>
                  <h3>{item.title}</h3>
                </div>
                <StatusBadge tone="accent">
                  {cleanStato(item.status)}
                </StatusBadge>
              </div>
              <p className="pf-active-plan-body">{item.body}</p>
              <div className="pf-grid pf-active-plan-form">
                <label className="pf-field">
                  Note di completamento
                  <textarea
                    className="pf-textarea"
                    rows={3}
                    value={notesById[item.id] ?? ""}
                    onChange={(event) =>
                      setNotesById((prev) => ({
                        ...prev,
                        [item.id]: event.target.value,
                      }))
                    }
                    placeholder="Cosa hai completato?"
                  />
                </label>
                <label className="pf-field">
                  Voto
                  <input
                    className="pf-input"
                    type="number"
                    min={1}
                    max={10}
                    value={ratingById[item.id] ?? ""}
                    onChange={(event) =>
                      setRatingById((prev) => ({
                        ...prev,
                        [item.id]: event.target.value,
                      }))
                    }
                    placeholder="1-10"
                  />
                </label>
              </div>
              <div className="pf-active-plan-actions">
                <button
                  className="pf-button"
                  type="button"
                  onClick={() => completePlanItem(item.id)}
                >
                  Segna come completata
                </button>
              </div>
            </article>
          ))}

          {!loading && activeAreaItems.length === 0 && (
            <p className="pf-plain-empty">
              {areaId ? "Nessun lavoro da fare." : "Seleziona un'area."}
            </p>
          )}
        </div>
      </section>
    </ProductShell>
  );
}
