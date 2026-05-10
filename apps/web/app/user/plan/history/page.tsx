"use client";

import { useEffect, useState } from "react";
import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import {
  API_BASE,
  redirectIfOnboardingRequired,
  secureFetch,
} from "@/app/lib/api";

type PlanItem = {
  id: string;
  title: string;
  body: string;
  completedAt?: string | null;
  completionRating?: number | null;
};

type Piano = {
  id: string;
  version: number;
  createdAt: string;
  items: PlanItem[];
};

type Area = { id: string; name: string };

export default function UserPlanHistoryPage() {
  const [areas, setAree] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [history, setHistory] = useState<Piano[]>([]);
  const [historyCounts, setHistoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [authHint, setAuthHint] = useState<string | null>(null);

  const loadHistory = async (selectedAreaId: string) => {
    setAreaId(selectedAreaId);
    setLoading(true);
    setAuthHint(null);
    setHistory([]);

    const response = await secureFetch(
      `${API_BASE}/user/plan/history?areaId=${encodeURIComponent(selectedAreaId)}`,
      { credentials: "include" },
    );

    if (!response.ok) {
      if (response.status === 401) {
        setAuthHint("Accedi per vedere lo storico allenamenti.");
      }
      setLoading(false);
      return;
    }

    setHistory((await response.json()) as Piano[]);
    setLoading(false);
  };

  const loadAree = async () => {
    const response = await secureFetch(`${API_BASE}/areas`, {
      credentials: "include",
    });
    if (!response.ok) {
      return;
    }

    const loadedAree = (await response.json()) as Area[];
    setAree(loadedAree);
    const countEntries = await Promise.all(
      loadedAree.map(async (area) => {
        const historyResponse = await secureFetch(
          `${API_BASE}/user/plan/history?areaId=${encodeURIComponent(area.id)}`,
          { credentials: "include" },
        );
        const areaHistory = historyResponse.ok
          ? ((await historyResponse.json()) as Piano[])
          : [];
        return [area.id, areaHistory.length] as const;
      }),
    );
    setHistoryCounts(Object.fromEntries(countEntries));
    const requestedAreaId =
      typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("areaId");
    const firstAreaId =
      (requestedAreaId && loadedAree.some((area) => area.id === requestedAreaId)
        ? requestedAreaId
        : "") ||
      loadedAree[0]?.id ||
      "";
    if (firstAreaId) {
      await loadHistory(firstAreaId);
    }
  };

  useEffect(() => {
    void (async () => {
      if (!(await redirectIfOnboardingRequired())) {
        await loadAree();
      }
    })();
  }, []);

  return (
    <ProductShell
      eyebrow="Ambiente atleta"
      title="Storico allenamenti"
      description="Scegli un'area per rivedere gli allenamenti precedenti."
      actions={
        <button
          className="pf-button-secondary"
          type="button"
          onClick={() => loadAree()}
        >
          Aggiorna
        </button>
      }
    >
      {authHint && <div className="pf-alert warning">{authHint}</div>}

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Aree</h2>
            <p className="pf-muted">Apri lo storico dell'area che vuoi consultare.</p>
          </div>
        </div>
        <div className="pf-area-grid">
          {areas.map((area) => (
            <button
              key={area.id}
              className={`pf-area-card ${area.id === areaId ? "selected" : ""} ${historyCounts[area.id] ? "attention" : ""}`}
              type="button"
              onClick={() => loadHistory(area.id)}
            >
              <span>
                <strong>{area.name}</strong>
                <small>
                  {historyCounts[area.id]
                    ? `${historyCounts[area.id]} ${historyCounts[area.id] === 1 ? "storico disponibile" : "storici disponibili"}`
                    : "Nessuno storico"}
                </small>
              </span>
              <StatusBadge tone={historyCounts[area.id] ? "accent" : "neutral"}>
                {historyCounts[area.id] ? "Disponibile" : "Vuoto"}
              </StatusBadge>
            </button>
          ))}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Storico</h2>
            <p className="pf-muted">Allenamenti completati o chiusi dell'area selezionata.</p>
          </div>
        </div>

        <div className="pf-stack">
          {history.map((historyPlan) => (
            <article key={historyPlan.id} className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>Tranche {historyPlan.version}</h3>
                  <p className="pf-muted">
                    {new Date(historyPlan.createdAt).toLocaleDateString("it-IT")}
                  </p>
                </div>
                <StatusBadge tone="accent">Completato</StatusBadge>
              </div>
              <div className="pf-stack">
                {historyPlan.items.map((item) => (
                  <div key={item.id} className="pf-work-row pf-plan-history-item">
                    <div className="pf-plan-history-heading">
                      <strong>{item.title}</strong>
                      {(item.completedAt || item.completionRating) && (
                        <small>
                          {item.completedAt
                            ? `Completato ${new Date(item.completedAt).toLocaleDateString("it-IT")}`
                            : ""}
                          {item.completedAt && item.completionRating ? " - " : ""}
                          {item.completionRating ? `Voto ${item.completionRating}` : ""}
                        </small>
                      )}
                    </div>
                    <p className="pf-muted">{item.body}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
          {!loading && areaId && history.length === 0 && (
            <EmptyState
              title="Nessuno storico"
              description="Lo storico apparira dopo la pubblicazione degli allenamenti."
            />
          )}
          {loading && (
            <EmptyState
              title="Caricamento storico"
              description="Sto caricando gli allenamenti precedenti dell'area selezionata."
            />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
