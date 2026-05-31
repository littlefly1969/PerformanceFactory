"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState, ProductShell, StatusBadge } from "@/app/components/product-shell";
import { API_BASE, secureFetch, redirectIfOnboardingRequired } from "@/app/lib/api";

type SnapshotArea = {
  areaId: string;
  realR: number;
  potentialP: number;
  area?: { id: string; name: string };
};
type Snapshot = {
  id: string;
  userId: string;
  rankingGlobal: number;
  reason: string;
  createdAt: string;
  areas: SnapshotArea[];
};

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Data sconosciuta";
  }
  return parsed.toLocaleDateString("it-IT", { month: "short", day: "2-digit", year: "numeric" });
};

export default function UserPerformancePage() {
  const [current, setCurrent] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [authHint, setAuthHint] = useState<string | null>(null);

  const sortedHistory = useMemo(
    () => history.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [history],
  );

  const loadProfilo = async () => {
    setLoading(true);
    setMessage(null);
    setAuthHint(null);

    const [currentRes, historyRes] = await Promise.all([
      secureFetch(`${API_BASE}/performance/profile/current`, { credentials: "include" }),
      secureFetch(`${API_BASE}/performance/profile/history`, { credentials: "include" }),
    ]);

    if (!currentRes.ok || !historyRes.ok) {
      if (currentRes.status === 401 || historyRes.status === 401) {
        setAuthHint("Accedi per vedere il tuo profilo performance.");
      } else if (currentRes.status === 404) {
        setCurrent(null);
        setHistory([]);
      } else {
        setMessage("Impossibile caricare il profilo performance.");
      }
      setLoading(false);
      return;
    }

    setCurrent((await currentRes.json()) as Snapshot);
    setHistory((await historyRes.json()) as Snapshot[]);
    setLoading(false);
  };

  useEffect(() => {
    void (async () => {
      if (!(await redirectIfOnboardingRequired())) {
        await loadProfilo();
      }
    })();
  }, []);

  return (
    <ProductShell
      eyebrow="Ambiente atleta"
      title="Profilo performance"
      description="Rivedi ranking piu recente, valori reali e potenziali per area e storico snapshot generato dai cicli chiusi."
      actions={
        <button className="pf-button-secondary" type="button" onClick={() => loadProfilo()}>
          Aggiorna
        </button>
      }
      stats={[
        { label: "Ranking globale", value: loading ? "..." : current?.rankingGlobal ?? "-", tone: "accent" },
        { label: "Aree tracciate", value: current?.areas.length ?? 0, tone: "success" },
        { label: "Snapshot", value: history.length, tone: "warning" },
      ]}
    >
      {authHint && <div className="pf-alert warning">{authHint}</div>}
      {message && <div className="pf-alert">{message}</div>}

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Snapshot corrente</h2>
            <p className="pf-muted">Reale misura l'esecuzione attuale. Potenziale traccia la capacita raggiungibile nel prossimo livello.</p>
          </div>
          {current && <StatusBadge tone="success">{formatDate(current.createdAt)}</StatusBadge>}
        </div>
        {current ? (
          <div className="pf-grid">
            {current.areas.map((area) => (
              <article key={area.areaId} className="pf-card">
                <div className="pf-card-top">
                  <div>
                    <h3>{area.area?.name ?? "Area"}</h3>
                    <p className="pf-muted pf-mono">{area.areaId.slice(0, 8)}</p>
                  </div>
                </div>
                <div className="pf-row">
                  <span>Reale</span>
                  <strong>{area.realR.toFixed(1)}</strong>
                </div>
                <div className="pf-row">
                  <span>Potenziale</span>
                  <strong>{area.potentialP.toFixed(1)}</strong>
                </div>
              </article>
            ))}
          </div>
        ) : (
          !loading && (
            <EmptyState
              title="Profilo non ancora disponibile"
              description="Completa e chiudi un check-in pubblicato per generare il primo snapshot performance."
            />
          )
        )}
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Timeline snapshot</h2>
            <p className="pf-muted">Ogni ciclo chiuso aggiunge un nuovo punto storico al profilo.</p>
          </div>
        </div>
        <div className="pf-stack">
          {sortedHistory.map((snapshot) => (
            <article key={snapshot.id} className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>Ranking {snapshot.rankingGlobal}</h3>
                  <p className="pf-muted">{snapshot.reason}</p>
                </div>
                <div className="pf-stack">
                  <StatusBadge>{formatDate(snapshot.createdAt)}</StatusBadge>
                  <span className="pf-muted pf-mono">{snapshot.id.slice(0, 8)}</span>
                </div>
              </div>
            </article>
          ))}
          {!loading && sortedHistory.length === 0 && (
            <EmptyState title="Nessuno storico" description="Lo storico snapshot appare dopo la chiusura dei cicli performance." />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
