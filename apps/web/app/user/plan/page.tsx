"use client";

import { useEffect, useMemo, useState } from "react";
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

type Plan = {
  id: string;
  areaId: string;
  version: number;
  status: string;
  createdAt: string;
  items: PlanItem[];
};

type Area = { id: string; name: string };

const cleanStatus = (status: string) => status.replace(/_/g, " ").toLowerCase();

export default function UserPlanPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [ratingById, setRatingById] = useState<Record<string, string>>({});
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [plansByArea, setPlansByArea] = useState<Record<string, Plan | null>>(
    {},
  );
  const [planHistory, setPlanHistory] = useState<Plan[]>([]);

  const activeItems = useMemo(
    () => plan?.items.filter((item) => item.status === "ACTIVE") ?? [],
    [plan],
  );
  const completedItems = useMemo(
    () => plan?.items.filter((item) => item.status === "COMPLETED") ?? [],
    [plan],
  );

  const loadAreas = async () => {
    const response = await secureFetch(`${API_BASE}/areas`, {
      credentials: "include",
    });
    if (response.ok) {
      const loadedAreas = (await response.json()) as Area[];
      setAreas(loadedAreas);
      const entries = await Promise.all(
        loadedAreas.map(async (area) => {
          const planResponse = await secureFetch(
            `${API_BASE}/user/plan/current?areaId=${encodeURIComponent(area.id)}`,
            { credentials: "include" },
          );
          return [
            area.id,
            planResponse.ok ? ((await planResponse.json()) as Plan) : null,
          ] as const;
        }),
      );
      const nextPlans = Object.fromEntries(entries);
      setPlansByArea(nextPlans);
      const firstActive = entries.find(([, areaPlan]) =>
        areaPlan?.items.some((item) => item.status === "ACTIVE"),
      );
      const requestedAreaId =
        typeof window === "undefined"
          ? ""
          : new URLSearchParams(window.location.search).get("areaId");
      setAreaId(
        (current) =>
          current ||
          (requestedAreaId && loadedAreas.some((area) => area.id === requestedAreaId)
            ? requestedAreaId
            : "") ||
          firstActive?.[0] ||
          loadedAreas[0]?.id ||
          "",
      );
    }
  };

  const loadPlan = async (selectedAreaId = areaId) => {
    setLoading(true);
    setAuthHint(null);
    setMessage(null);
    setNotesById({});
    setRatingById({});

    if (!selectedAreaId) {
      setPlan(null);
      setMessage("Select an area to load the current plan.");
      setLoading(false);
      return;
    }

    const response = await secureFetch(
      `${API_BASE}/user/plan/current?areaId=${encodeURIComponent(selectedAreaId)}`,
      { credentials: "include" },
    );

    if (!response.ok) {
      setPlan(null);
      if (response.status === 401) {
        setAuthHint("Sign in to view your plan.");
      } else if (response.status !== 404) {
        setMessage("Unable to load the current plan.");
      }
      setLoading(false);
      return;
    }

    setPlan((await response.json()) as Plan);
    const historyResponse = await secureFetch(
      `${API_BASE}/user/plan/history?areaId=${encodeURIComponent(selectedAreaId)}`,
      { credentials: "include" },
    );
    setPlanHistory(historyResponse.ok ? ((await historyResponse.json()) as Plan[]) : []);
    setLoading(false);
  };

  useEffect(() => {
    void (async () => {
      if (!(await redirectIfOnboardingRequired())) {
        await loadAreas();
      }
    })();
  }, []);

  useEffect(() => {
    if (areaId) {
      void loadPlan(areaId);
    }
  }, [areaId]);

  const completePlanItem = async (itemId: string) => {
    setMessage(null);
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

    const response = await secureFetch(
      `${API_BASE}/user/plan-items/${itemId}/complete`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      setMessage(
        response.status === 409
          ? "This item is already completed."
          : "Completion failed.",
      );
      return;
    }

    await loadAreas();
    await loadPlan();
  };

  return (
    <ProductShell
      eyebrow="Athlete workspace"
      title="Active performance plan"
      description="Work is organized by area. Areas with active work are highlighted first; open one and complete the assigned activity."
      actions={
        <button
          className="pf-button-secondary"
          type="button"
          onClick={() => loadAreas()}
        >
          Refresh areas
        </button>
      }
      stats={[
        {
          label: "Active items",
          value: loading ? "..." : activeItems.length,
          tone: "accent",
        },
        {
          label: "Completed",
          value: loading ? "..." : completedItems.length,
          tone: "success",
        },
        {
          label: "Plan version",
          value: plan ? `v${plan.version}` : "-",
          tone: "warning",
        },
      ]}
    >
      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Areas</h2>
            <p className="pf-muted">Open the area that has work to complete.</p>
          </div>
        </div>
        <div className="pf-area-grid">
          {areas.map((area) => {
            const areaPlan = plansByArea[area.id];
            const active =
              areaPlan?.items.filter((item) => item.status === "ACTIVE")
                .length ?? 0;
            const completed =
              areaPlan?.items.filter((item) => item.status === "COMPLETED")
                .length ?? 0;
            const selected = area.id === areaId;
            return (
              <button
                key={area.id}
                className={`pf-area-card ${selected ? "selected" : ""} ${active ? "attention" : ""}`}
                type="button"
                onClick={() => setAreaId(area.id)}
              >
                <span>
                  <strong>{area.name}</strong>
                  <small>
                    {active
                      ? `${active} active work item`
                      : completed
                        ? `${completed} completed`
                        : "No active plan"}
                  </small>
                </span>
                <StatusBadge
                  tone={active ? "accent" : completed ? "success" : "neutral"}
                >
                  {active ? "To do" : completed ? "Done" : "Empty"}
                </StatusBadge>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Today&apos;s work</h2>
            <p className="pf-muted">
              Complete items only after the activity is actually done.
            </p>
          </div>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadPlan()}
          >
            Refresh
          </button>
        </div>

        {authHint && <div className="pf-alert warning">{authHint}</div>}
        {message && <div className="pf-alert">{message}</div>}

        <div className="pf-stack">
          {activeItems.map((item) => (
            <article key={item.id} className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>{item.title}</h3>
                  <p className="pf-muted">
                    {item.area?.name ?? "Area"} ·{" "}
                    <span className="pf-mono">{item.id.slice(0, 8)}</span>
                  </p>
                </div>
                <StatusBadge tone="accent">
                  {cleanStatus(item.status)}
                </StatusBadge>
              </div>
              <p>{item.body}</p>
              <div className="pf-grid">
                <label className="pf-field">
                  Completion notes
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
                    placeholder="What did you complete?"
                  />
                </label>
                <label className="pf-field">
                  Rating
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
              <button
                className="pf-button"
                type="button"
                onClick={() => completePlanItem(item.id)}
              >
                Mark complete
              </button>
            </article>
          ))}

          {!loading && activeItems.length === 0 && (
            <EmptyState
              title={areaId ? "No active work for this area" : "Select an area"}
              description={
                areaId
                  ? "There is no published active item for the selected area."
                  : "Choose an area to load the current plan."
              }
            />
          )}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Storico lavori</h2>
            <p className="pf-muted">
              Rivedi anche esercizi completati o chiusi delle versioni precedenti.
            </p>
          </div>
        </div>
        <div className="pf-stack">
          {planHistory.map((historyPlan) => (
            <article key={historyPlan.id} className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>Versione {historyPlan.version}</h3>
                  <p className="pf-muted">{new Date(historyPlan.createdAt).toLocaleDateString("it-IT")}</p>
                </div>
                <StatusBadge tone={historyPlan.status === "ACTIVE" ? "accent" : "neutral"}>
                  {cleanStatus(historyPlan.status)}
                </StatusBadge>
              </div>
              <div className="pf-stack">
                {historyPlan.items.map((item) => (
                  <div key={item.id} className="pf-work-row">
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {cleanStatus(item.status)}
                        {item.completedAt ? ` · completato ${new Date(item.completedAt).toLocaleDateString("it-IT")}` : ""}
                        {item.completionRating ? ` · voto ${item.completionRating}` : ""}
                      </small>
                    </span>
                    <p className="pf-muted">{item.body}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
          {!loading && planHistory.length === 0 && (
            <EmptyState title="Nessuno storico" description="Lo storico apparira dopo la pubblicazione dei piani." />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
