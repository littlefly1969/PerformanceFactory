"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
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
  const planRequestIdRef = useRef(0);

  const activeItems = useMemo(
    () => plan?.items.filter((item) => item.status === "ACTIVE") ?? [],
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
      setMessage("Seleziona un'area per caricare l'allenamento corrente.");
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
        setAuthHint("Accedi per vedere il tuo allenamento.");
      } else if (response.status >= 500) {
        setMessage("Impossibile caricare l'allenamento corrente.");
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

  useEffect(() => {
    void (async () => {
      if (!(await redirectIfOnboardingRequired())) {
        await loadAree();
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
      title="Allenamenti da fare"
      description="Il lavoro e organizzato per area. Le aree con allenamenti da fare sono evidenziate per prime: aprine una e completa l'allenamento assegnato."
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
          label: "Allenamenti da fare",
          value: loading ? "..." : activeItems.length,
          tone: "accent",
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
                      ? `${active} ${active === 1 ? "allenamento" : "allenamenti"} da fare`
                      : completed
                        ? `${completed} completate`
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

          {!loading && activeItems.length === 0 && (
            <p className="pf-plain-empty">
              {areaId ? "Nessun lavoro da fare." : "Seleziona un'area."}
            </p>
          )}
        </div>
      </section>

    </ProductShell>
  );
}
