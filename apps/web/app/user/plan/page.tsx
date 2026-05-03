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

type Piano = {
  id: string;
  areaId: string;
  version: number;
  status: string;
  createdAt: string;
  items: PlanItem[];
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

export default function UserPianoPage() {
  const [plan, setPiano] = useState<Piano | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [ratingById, setRatingById] = useState<Record<string, string>>({});
  const [areas, setAree] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [plansByArea, setPianosByArea] = useState<Record<string, Piano | null>>(
    {},
  );
  const [planHistory, setPianoHistory] = useState<Piano[]>([]);

  const activeItems = useMemo(
    () => plan?.items.filter((item) => item.status === "ACTIVE") ?? [],
    [plan],
  );
  const completedItems = useMemo(
    () => plan?.items.filter((item) => item.status === "COMPLETED") ?? [],
    [plan],
  );

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
      setAreaId(
        (current) =>
          current ||
          (requestedAreaId && loadedAree.some((area) => area.id === requestedAreaId)
            ? requestedAreaId
            : "") ||
          firstActive?.[0] ||
          loadedAree[0]?.id ||
          "",
      );
    }
  };

  const loadPiano = async (selectedAreaId = areaId) => {
    setLoading(true);
    setAuthHint(null);
    setMessage(null);
    setNotesById({});
    setRatingById({});

    if (!selectedAreaId) {
      setPiano(null);
      setMessage("Seleziona un'area per caricare il piano corrente.");
      setLoading(false);
      return;
    }

    const response = await secureFetch(
      `${API_BASE}/user/plan/current?areaId=${encodeURIComponent(selectedAreaId)}`,
      { credentials: "include" },
    );

    if (!response.ok) {
      setPiano(null);
      if (response.status === 401) {
        setAuthHint("Accedi per vedere il tuo piano.");
      } else if (response.status !== 404) {
        setMessage("Impossibile caricare il piano corrente.");
      }
      setLoading(false);
      return;
    }

    setPiano((await response.json()) as Piano);
    const historyResponse = await secureFetch(
      `${API_BASE}/user/plan/history?areaId=${encodeURIComponent(selectedAreaId)}`,
      { credentials: "include" },
    );
    setPianoHistory(historyResponse.ok ? ((await historyResponse.json()) as Piano[]) : []);
    setLoading(false);
  };

  useEffect(() => {
    void (async () => {
      if (!(await redirectIfOnboardingRequired())) {
        await loadAree();
      }
    })();
  }, []);

  useEffect(() => {
    if (areaId) {
      void loadPiano(areaId);
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
          ? "Questa attivita e gia stata completata."
          : "Completamento non riuscito.",
      );
      return;
    }

    await loadAree();
    await loadPiano();
  };

  return (
    <ProductShell
      eyebrow="Ambiente atleta"
      title="Piano performance attivo"
      description="Il lavoro e organizzato per area. Le aree con attivita attive sono evidenziate per prime: aprine una e completa l'attivita assegnata."
      actions={
        <button
          className="pf-button-secondary"
          type="button"
          onClick={() => loadAree()}
        >
          Aggiorna aree
        </button>
      }
      stats={[
        {
          label: "Attivita attive",
          value: loading ? "..." : activeItems.length,
          tone: "accent",
        },
        {
          label: "Completate",
          value: loading ? "..." : completedItems.length,
          tone: "success",
        },
        {
          label: "Versione piano",
          value: plan ? `v${plan.version}` : "-",
          tone: "warning",
        },
      ]}
    >
      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Aree</h2>
            <p className="pf-muted">Apri l'area che contiene lavoro da completare.</p>
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
                onClick={() => setAreaId(area.id)}
              >
                <span>
                  <strong>{area.name}</strong>
                  <small>
                    {active
                      ? `${active} attivita attiva`
                      : completed
                        ? `${completed} completate`
                        : "Nessun piano attivo"}
                  </small>
                </span>
                <StatusBadge
                  tone={active ? "accent" : completed ? "success" : "neutral"}
                >
                  {active ? "Da fare" : completed ? "Completato" : "Vuoto"}
                </StatusBadge>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Lavoro di oggi</h2>
            <p className="pf-muted">
              Completa le attivita solo quando sono state davvero eseguite.
            </p>
          </div>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadPiano()}
          >
            Aggiorna
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
                    {item.area?.name ?? "Area"} -{" "}
                    <span className="pf-mono">{item.id.slice(0, 8)}</span>
                  </p>
                </div>
                <StatusBadge tone="accent">
                  {cleanStato(item.status)}
                </StatusBadge>
              </div>
              <p>{item.body}</p>
              <div className="pf-grid">
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
              <button
                className="pf-button"
                type="button"
                onClick={() => completePlanItem(item.id)}
              >
                Segna come completata
              </button>
            </article>
          ))}

          {!loading && activeItems.length === 0 && (
            <EmptyState
              title={areaId ? "Nessun lavoro attivo per questa area" : "Seleziona un'area"}
              description={
                areaId
                  ? "Non ci sono attivita attive pubblicate per l'area selezionata."
                  : "Scegli un'area per caricare il piano corrente."
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
                  {cleanStato(historyPlan.status)}
                </StatusBadge>
              </div>
              <div className="pf-stack">
                {historyPlan.items.map((item) => (
                  <div key={item.id} className="pf-work-row">
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {cleanStato(item.status)}
                        {item.completedAt ? ` - completato ${new Date(item.completedAt).toLocaleDateString("it-IT")}` : ""}
                        {item.completionRating ? ` - voto ${item.completionRating}` : ""}
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
