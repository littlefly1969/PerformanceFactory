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

type Plan = {
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
  plan?: Plan;
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
  return parsed.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

const avg = (items: number[]) => {
  if (!items.length) {
    return 0;
  }
  return Math.round(items.reduce((sum, item) => sum + item, 0) / items.length);
};

export default function AthleteDashboardPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [workspace, setWorkspace] = useState<AreaWorkspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const radarAreas = useMemo(
    () =>
      snapshot?.areas.map((area) => ({
        id: area.areaId,
        label: area.area?.name ?? "Area",
        real: area.realR,
        potential: area.potentialP,
      })) ?? [],
    [snapshot],
  );

  const realAverage = useMemo(() => avg(radarAreas.map((area) => area.real)), [radarAreas]);
  const potentialAverage = useMemo(() => avg(radarAreas.map((area) => area.potential)), [radarAreas]);
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
      setMessage("Sign in as an athlete to open this workspace.");
      setLoading(false);
      return;
    }

    const loadedAreas = areasRes.ok ? ((await areasRes.json()) as Area[]) : [];
    setAreas(loadedAreas);
    setProfessionals(prosRes.ok ? ((await prosRes.json()) as Professional[]) : []);
    setSnapshot(profileRes.ok ? ((await profileRes.json()) as Snapshot) : null);

    const rows = await Promise.all(
      loadedAreas.map(async (area) => {
        const [planRes, questionRes] = await Promise.all([
          secureFetch(`${API_BASE}/user/plan/current?areaId=${encodeURIComponent(area.id)}`, { credentials: "include" }),
          secureFetch(`${API_BASE}/user/questions/current?areaId=${encodeURIComponent(area.id)}`, { credentials: "include" }),
        ]);

        return {
          area,
          plan: planRes.ok ? ((await planRes.json()) as Plan) : undefined,
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
      eyebrow="Athlete workspace"
      title="My performance dashboard"
      description="A personal view of current profile, active work, open check-ins, and the professional team around the athlete."
      actions={
        <button className="pf-button-secondary" type="button" onClick={() => loadDashboard()}>
          Refresh
        </button>
      }
      stats={[
        { label: "Real average", value: loading ? "..." : realAverage || "-", tone: "accent" },
        { label: "Potential average", value: loading ? "..." : potentialAverage || "-", tone: "success" },
        { label: "Active work", value: loading ? "..." : activeItems.length, tone: "warning" },
      ]}
    >
      {message && <div className="pf-alert warning">{message}</div>}

      <section className="pf-dashboard-grid">
        <article className="pf-panel pf-focus-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Performance spider</h2>
              <p className="pf-muted">
                Real shows current execution. Potential shows the next reachable level.
              </p>
            </div>
            {snapshot && <StatusBadge tone="success">{formatDate(snapshot.createdAt)}</StatusBadge>}
          </div>
          <RadarChart areas={radarAreas} />
        </article>

        <aside className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Next actions</h2>
              <p className="pf-muted">What needs attention now.</p>
            </div>
          </div>
          <div className="pf-stack">
            <div className="pf-metric-row">
              <span>Active plan items</span>
              <strong>{activeItems.length}</strong>
            </div>
            <div className="pf-metric-row">
              <span>Open questionnaires</span>
              <strong>{openQuestionSets.length}</strong>
            </div>
            <div className="pf-metric-row">
              <span>Professionals</span>
              <strong>{professionals.length}</strong>
            </div>
            <div className="pf-actions">
              <Link className="pf-button" href="/user/plan">Open plan</Link>
              <Link className="pf-button-secondary" href="/user/questions">Answer check-in</Link>
            </div>
          </div>
        </aside>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Area focus</h2>
            <p className="pf-muted">Current state by area with direct access to work and check-ins.</p>
          </div>
        </div>
        <div className="pf-grid">
          {workspace.map((row) => {
            const profile = snapshot?.areas.find((area) => area.areaId === row.area.id);
            const active = row.plan?.items.filter((item) => item.status === "ACTIVE") ?? [];
            return (
              <article key={row.area.id} className="pf-card">
                <div className="pf-card-top">
                  <div>
                    <h3>{row.area.name}</h3>
                    <p className="pf-muted">
                      Real {profile?.realR.toFixed(0) ?? "-"} · Potential {profile?.potentialP.toFixed(0) ?? "-"}
                    </p>
                  </div>
                  <StatusBadge tone={active.length ? "accent" : "neutral"}>
                    {active.length ? `${active.length} active` : "No active work"}
                  </StatusBadge>
                </div>
                {active[0] && (
                  <p>
                    <strong>{active[0].title}</strong><br />
                    <span className="pf-muted">{active[0].body}</span>
                  </p>
                )}
                <div className="pf-row">
                  <span>Questionnaire</span>
                  <StatusBadge tone={row.questionSet ? "warning" : "neutral"}>
                    {row.questionSet ? `${row.questionSet.questions.length} questions` : "Not available"}
                  </StatusBadge>
                </div>
              </article>
            );
          })}
          {!loading && areas.length === 0 && (
            <EmptyState title="No areas configured" description="Seed areas before using the athlete workspace." />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
