"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, ProductShell, StatusBadge } from "@/app/components/product-shell";
import { RadarChart } from "@/app/components/radar-chart";
import { API_BASE, secureFetch, redirectIfOnboardingRequired } from "@/app/lib/api";

type SnapshotArea = {
  areaId: string;
  realR: number;
  potentialP: number;
  area?: { id: string; name: string };
};

type Snapshot = {
  id: string;
  rankingGlobal: number;
  reason: string;
  createdAt: string;
  areas: SnapshotArea[];
};

type Area = { id: string; name: string };
type Professional = { id: string; email: string };

type Piano = {
  id: string;
  version: number;
  areaId: string;
  items: Array<{
    id: string;
    status: string;
    title: string;
    body: string;
    area?: { id: string; name: string };
  }>;
};

type QuestionSet = {
  id: string;
  status: string;
  areaId?: string;
  questions: Array<{ id: string }>;
};

type AreaWorkspace = {
  area: Area;
  plan?: Piano;
  questionSet?: QuestionSet;
};

const formatDate = (value?: string) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleDateString("it-IT", { month: "short", day: "2-digit", year: "numeric" });
};

const avg = (items: number[]) => {
  if (!items.length) {
    return 0;
  }
  return Math.round(items.reduce((sum, item) => sum + item, 0) / items.length);
};

const getAverageTone = (real: number, potential: number) => {
  if (!real || !potential) {
    return "neutral";
  }
  const ratio = real / potential;
  if (ratio <= 0.25) {
    return "danger";
  }
  if (ratio <= 0.5) {
    return "warning";
  }
  if (ratio <= 0.75) {
    return "soft";
  }
  if (ratio < 1) {
    return "accent";
  }
  return "max";
};

export default function AthleteDashboardPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [areas, setAree] = useState<Area[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [workspace, setWorkspace] = useState<AreaWorkspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const radarAree = useMemo(
    () =>
      snapshot?.areas.map((area) => ({
        id: area.areaId,
        label: area.area?.name ?? "Area",
        real: area.realR,
        potential: area.potentialP,
      })) ?? [],
    [snapshot],
  );

  const realAverage = useMemo(() => avg(radarAree.map((area) => area.real)), [radarAree]);
  const potentialAverage = useMemo(() => avg(radarAree.map((area) => area.potential)), [radarAree]);
  const realAverageTone = useMemo(
    () => getAverageTone(realAverage, potentialAverage),
    [potentialAverage, realAverage],
  );
  const activeItems = useMemo(
    () => workspace.flatMap((item) => item.plan?.items.filter((planItem) => planItem.status === "ACTIVE") ?? []),
    [workspace],
  );
  const openQuestionSets = useMemo(
    () => workspace.filter((item) => item.questionSet && item.questionSet.status !== "CLOSED"),
    [workspace],
  );

  const loadDashboard = async () => {
    setLoading(true);
    setMessage(null);

    if (await redirectIfOnboardingRequired()) {
      return;
    }

    const [areasRes, prosRes, profileRes] = await Promise.all([
      secureFetch(`${API_BASE}/areas`, { credentials: "include" }),
      secureFetch(`${API_BASE}/relationships/my-professionals`, { credentials: "include" }),
      secureFetch(`${API_BASE}/performance/profile/current`, { credentials: "include" }),
    ]);

    if (areasRes.status === 401 || prosRes.status === 401 || profileRes.status === 401) {
      setMessage("Accedi come atleta per aprire questo ambiente.");
      setLoading(false);
      return;
    }

    const loadedAree = areasRes.ok ? ((await areasRes.json()) as Area[]) : [];
    setAree(loadedAree);
    setProfessionals(prosRes.ok ? ((await prosRes.json()) as Professional[]) : []);
    setSnapshot(profileRes.ok ? ((await profileRes.json()) as Snapshot) : null);

    const rows = await Promise.all(
      loadedAree.map(async (area) => {
        const [planRes, questionRes] = await Promise.all([
          secureFetch(`${API_BASE}/user/plan/current?areaId=${encodeURIComponent(area.id)}`, { credentials: "include" }),
          secureFetch(`${API_BASE}/user/questions/current?areaId=${encodeURIComponent(area.id)}`, { credentials: "include" }),
        ]);

        return {
          area,
          plan: planRes.ok ? ((await planRes.json()) as Piano) : undefined,
          questionSet: questionRes.ok ? ((await questionRes.json()) as QuestionSet) : undefined,
        };
      }),
    );

    setWorkspace(rows);
    setLoading(false);
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  return (
    <ProductShell
      eyebrow="Ambiente atleta"
      title="La tua performance"
      titleMeta={
        <>
          <span className={`pf-title-metric real-${realAverageTone}`}>
            <small>Media reale</small>
            <strong>{loading ? "..." : realAverage || "-"}</strong>
          </span>
          <span className="pf-title-metric">
            <small>Media potenziale</small>
            <strong>{loading ? "..." : potentialAverage || "-"}</strong>
          </span>
        </>
      }
      description="Vista personale di profilo corrente, lavoro attivo, check-in aperti e team professionale."
      actions={
        <button className="pf-button-secondary" type="button" onClick={() => loadDashboard()}>
          Aggiorna
        </button>
      }
    >
      {message && <div className="pf-alert warning">{message}</div>}

      <section className="pf-panel pf-performance-overview">
        <div className="pf-performance-spider">
          <div className="pf-panel-header pf-performance-spider-header">
            <div>
              <h2>Grafico spider performance</h2>
              <p className="pf-muted">
                Reale mostra l'esecuzione corrente. Potenziale mostra il prossimo livello raggiungibile.
              </p>
            </div>
            {snapshot && <StatusBadge tone="success">{formatDate(snapshot.createdAt)}</StatusBadge>}
          </div>
          <RadarChart
            areas={radarAree}
            getAreaHref={(area) => `/user/areas/${encodeURIComponent(area.id)}`}
          />
        </div>

        <aside className="pf-performance-actions">
          <div className="pf-panel-header">
            <div>
              <h2>Prossime azioni</h2>
              <p className="pf-muted">Cosa richiede attenzione ora.</p>
            </div>
          </div>
          <div className="pf-stack">
            <Link className="pf-metric-row pf-action-metric" href="/user/plan">
              <span>Attivita da fare</span>
              <strong>{activeItems.length}</strong>
            </Link>
            <Link className="pf-metric-row pf-action-metric" href="/user/questions">
              <span>Check-in aperti</span>
              <strong>{openQuestionSets.length}</strong>
            </Link>
            <Link className="pf-metric-row pf-action-metric" href="/user/performance">
              <span>Storico performance</span>
              <strong>{professionals.length}</strong>
            </Link>
          </div>
        </aside>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Focus per area</h2>
            <p className="pf-muted">Stato corrente per area con accesso diretto a lavori e check-in.</p>
          </div>
        </div>
        <div className="pf-grid">
          {workspace.map((row) => {
            const profile = snapshot?.areas.find((area) => area.areaId === row.area.id);
            const active = row.plan?.items.filter((item) => item.status === "ACTIVE") ?? [];
            return (
              <article
                key={row.area.id}
                className={`pf-card pf-area-focus-card ${active.length ? "attention" : ""}`}
              >
                <div className="pf-area-focus-header">
                  <h3>{row.area.name}</h3>
                  <div className="pf-area-focus-status">
                  <StatusBadge tone={active.length ? "accent" : "neutral"}>
                    {active.length
                      ? `${active.length} ${active.length === 1 ? "attivita" : "attivita"} da fare`
                      : "Nessuna attivita da fare"}
                  </StatusBadge>
                  </div>
                </div>
                <div className="pf-area-score-row">
                  <span className="pf-area-score-item">
                    <small>Reale</small>
                    <strong>{profile?.realR.toFixed(0) ?? "-"}</strong>
                  </span>
                  <span className="pf-area-score-item">
                    <small>Potenziale</small>
                    <strong>{profile?.potentialP.toFixed(0) ?? "-"}</strong>
                  </span>
                </div>
                <div className="pf-area-question-status">
                  <Link href={`/user/questions?areaId=${encodeURIComponent(row.area.id)}`}>
                    Check-in
                  </Link>
                  <StatusBadge tone={row.questionSet ? "warning" : "neutral"}>
                    {row.questionSet ? `${row.questionSet.questions.length} domande` : "Non disponibile"}
                  </StatusBadge>
                </div>
                <div className="pf-actions pf-area-card-actions">
                  <Link className="pf-button-secondary" href={`/user/plan?areaId=${encodeURIComponent(row.area.id)}`}>
                    Apri lavori
                  </Link>
                  <Link className="pf-button-secondary" href={`/user/questions?areaId=${encodeURIComponent(row.area.id)}`}>
                    Check-in
                  </Link>
                  <Link className="pf-button-secondary" href={`/user/areas/${encodeURIComponent(row.area.id)}`}>
                    Dettaglio area
                  </Link>
                </div>
              </article>
            );
          })}
          {!loading && areas.length === 0 && (
            <EmptyState title="Nessuna area configurata" description="Configura le aree prima di usare l'ambiente atleta." />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
