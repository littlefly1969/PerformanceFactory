"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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

type Area = { id: string; name: string };

type SnapshotArea = {
  areaId: string;
  realR: number;
  potentialP: number;
  area?: Area;
};

type Snapshot = {
  id: string;
  rankingGlobal: number;
  reason: string;
  createdAt: string;
  areas: SnapshotArea[];
};

type PlanItem = {
  id: string;
  status: string;
  title: string;
  body: string;
};

type Piano = {
  id: string;
  version: number;
  areaId: string;
  items: PlanItem[];
};

type QuestionSet = {
  id: string;
  status: string;
  areaId?: string;
  questions: Array<{
    id: string;
    text: string;
    orderIndex: number;
  }>;
};

const formatStatus = (status: string) =>
  ({
    ACTIVE: "attivo",
    COMPLETED: "completato",
    CLOSED: "chiuso",
    PENDING: "in attesa",
    PUBLISHED: "pubblicato",
  })[status] ?? status.replace(/_/g, " ").toLowerCase();

const formatScore = (value?: number) =>
  typeof value === "number" ? value.toFixed(0) : "-";

export default function UserAreaDetailPage() {
  const params = useParams<{ areaId: string }>();
  const areaId = params.areaId;
  const [areas, setAree] = useState<Area[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [plan, setPlan] = useState<Piano | null>(null);
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedArea = useMemo(
    () =>
      snapshot?.areas.find((area) => area.areaId === areaId) ??
      (areas.find((area) => area.id === areaId)
        ? { areaId, realR: 0, potentialP: 0, area: areas.find((area) => area.id === areaId) }
        : undefined),
    [areaId, areas, snapshot],
  );

  const activeItems = useMemo(
    () => plan?.items.filter((item) => item.status === "ACTIVE") ?? [],
    [plan],
  );

  const loadArea = async () => {
    setLoading(true);
    setMessage(null);

    if (await redirectIfOnboardingRequired()) {
      return;
    }

    const [areasRes, profileRes, planRes, questionRes] = await Promise.all([
      secureFetch(`${API_BASE}/areas`, { credentials: "include" }),
      secureFetch(`${API_BASE}/performance/profile/current`, { credentials: "include" }),
      secureFetch(`${API_BASE}/user/plan/current?areaId=${encodeURIComponent(areaId)}`, { credentials: "include" }),
      secureFetch(`${API_BASE}/user/questions/current?areaId=${encodeURIComponent(areaId)}`, { credentials: "include" }),
    ]);

    if ([areasRes, profileRes, planRes, questionRes].some((response) => response.status === 401)) {
      setMessage("Accedi come atleta per vedere il dettaglio area.");
      setLoading(false);
      return;
    }

    setAree(areasRes.ok ? ((await areasRes.json()) as Area[]) : []);
    setSnapshot(profileRes.ok ? ((await profileRes.json()) as Snapshot) : null);
    setPlan(planRes.ok ? ((await planRes.json()) as Piano) : null);
    setQuestionSet(questionRes.ok ? ((await questionRes.json()) as QuestionSet) : null);

    if (!profileRes.ok && !areasRes.ok) {
      setMessage("Impossibile caricare i dati dell'area.");
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadArea();
  }, [areaId]);

  const areaName = selectedArea?.area?.name ?? "Area";
  const scoreGap =
    typeof selectedArea?.potentialP === "number" && typeof selectedArea?.realR === "number"
      ? Math.max(0, Math.round(selectedArea.potentialP - selectedArea.realR))
      : 0;

  return (
    <ProductShell
      eyebrow="Ambiente atleta"
      title={areaName}
      description="Dettaglio della tua performance per questa area, con valori reali, potenziali, allenamenti e questionari disponibili."
      actions={
        <div className="pf-header-actions">
          <Link className="pf-button-secondary" href="/user">
            La tua performance
          </Link>
          <button className="pf-button-secondary" type="button" onClick={loadArea}>
            Aggiorna
          </button>
        </div>
      }
      stats={[
        {
          label: "Reale",
          value: loading ? "..." : formatScore(selectedArea?.realR),
          tone: "accent",
        },
        {
          label: "Potenziale",
          value: loading ? "..." : formatScore(selectedArea?.potentialP),
          tone: "success",
        },
        {
          label: "Differenza",
          value: loading ? "..." : scoreGap,
          tone: "warning",
        },
      ]}
    >
      {message && <div className="pf-alert warning">{message}</div>}

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Dettaglio area</h2>
            <p className="pf-muted">
              Reale fotografa il livello attuale in {areaName}. Potenziale indica il margine raggiungibile nel prossimo ciclo di lavoro.
            </p>
          </div>
          <StatusBadge tone="accent">{areaName}</StatusBadge>
        </div>
        <div className="pf-grid">
          <article className="pf-card">
            <h3>Reale</h3>
            <p className="pf-muted">
              Valore corrente calcolato dalle risposte e dagli ultimi dati disponibili per questa area.
            </p>
            <strong className="pf-score-value">{formatScore(selectedArea?.realR)}</strong>
          </article>
          <article className="pf-card">
            <h3>Potenziale</h3>
            <p className="pf-muted">
              Stima del livello verso cui orientare allenamenti e questionari di questa area.
            </p>
            <strong className="pf-score-value">{formatScore(selectedArea?.potentialP)}</strong>
          </article>
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Allenamenti disponibili</h2>
            <p className="pf-muted">Allenamenti da fare collegati solo a questa area.</p>
          </div>
          <Link className="pf-button-secondary" href={`/user/plan?areaId=${encodeURIComponent(areaId)}`}>
            Apri allenamenti
          </Link>
        </div>
        <div className="pf-stack">
          {activeItems.map((item) => (
            <article key={item.id} className="pf-card pf-active-plan-card">
              <div className="pf-card-top">
                <h3>{item.title}</h3>
                <StatusBadge tone="accent">{formatStatus(item.status)}</StatusBadge>
              </div>
              <p className="pf-active-plan-body">{item.body}</p>
            </article>
          ))}
          {!loading && activeItems.length === 0 && (
            <EmptyState
              title="Nessun allenamento da fare"
              description="Non ci sono allenamenti attivi pubblicati per questa area."
            />
          )}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Questionari disponibili</h2>
            <p className="pf-muted">Questionari aperti collegati solo a questa area.</p>
          </div>
          <Link className="pf-button-secondary" href={`/user/questions?areaId=${encodeURIComponent(areaId)}`}>
            Apri questionari
          </Link>
        </div>
        {questionSet ? (
          <article className="pf-card">
            <div className="pf-card-top">
              <div>
                <h3>{questionSet.questions.length} domande</h3>
                <p className="pf-muted">Stato: {formatStatus(questionSet.status)}</p>
              </div>
              <StatusBadge tone="warning">Da rispondere</StatusBadge>
            </div>
            <div className="pf-stack">
              {questionSet.questions.slice(0, 3).map((question) => (
                <div key={question.id} className="pf-work-row">
                  <span>
                    <strong>{question.orderIndex}. {question.text}</strong>
                  </span>
                </div>
              ))}
            </div>
          </article>
        ) : (
          !loading && (
            <EmptyState
              title="Nessun questionario disponibile"
              description="Non ci sono questionari aperti pubblicati per questa area."
            />
          )
        )}
      </section>
    </ProductShell>
  );
}
