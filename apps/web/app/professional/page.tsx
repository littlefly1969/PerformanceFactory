"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import { RadarChart } from "@/app/components/radar-chart";
import { API_BASE, secureFetch } from "@/app/lib/api";

type LinkedUser = {
  id: string;
  email: string;
  role: string;
};

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

type InboxResponse = {
  planItems: Array<{
    id: string;
    title: string;
    area?: { name: string };
    planRelease: { user: { id: string; email: string } };
  }>;
  questionApprovals: Array<{
    id: string;
    area?: { name: string };
    questionSet: { user: { id: string; email: string } };
  }>;
};

const formatDate = (value?: string) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

export default function ProfessionalDashboardPage() {
  const [users, setUsers] = useState<LinkedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [inbox, setInbox] = useState<InboxResponse>({
    planItems: [],
    questionApprovals: [],
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

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

  const highestGap = useMemo(() => {
    const sorted = radarAreas
      .map((area) => ({
        ...area,
        gap: Math.max(0, area.potential - area.real),
      }))
      .sort((a, b) => b.gap - a.gap);
    return sorted[0] ?? null;
  }, [radarAreas]);

  const totalPending = useMemo(
    () => inbox.planItems.length + inbox.questionApprovals.length,
    [inbox],
  );

  const loadDashboard = async (preferredUserId?: string) => {
    setLoading(true);
    setMessage(null);

    const [usersRes, inboxRes] = await Promise.all([
      secureFetch(`${API_BASE}/relationships/my-users`, {
        credentials: "include",
      }),
      secureFetch(`${API_BASE}/professional/approvals`, {
        credentials: "include",
      }),
    ]);

    if (usersRes.status === 401 || inboxRes.status === 401) {
      setMessage("Sign in as a professional to open this workspace.");
      setLoading(false);
      return;
    }

    if (!usersRes.ok) {
      setMessage("Unable to load linked athletes.");
      setLoading(false);
      return;
    }

    const loadedUsers = (await usersRes.json()) as LinkedUser[];
    const nextSelected =
      preferredUserId || selectedUserId || loadedUsers[0]?.id || "";
    setUsers(loadedUsers);
    setSelectedUserId(nextSelected);
    setInbox(
      inboxRes.ok
        ? ((await inboxRes.json()) as InboxResponse)
        : { planItems: [], questionApprovals: [] },
    );

    if (nextSelected) {
      const profileRes = await secureFetch(
        `${API_BASE}/performance/profile/current?userId=${encodeURIComponent(nextSelected)}`,
        { credentials: "include" },
      );
      setSnapshot(
        profileRes.ok ? ((await profileRes.json()) as Snapshot) : null,
      );
    } else {
      setSnapshot(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const changeSelected = (userId: string) => {
    setSelectedUserId(userId);
    void loadDashboard(userId);
  };

  return (
    <ProductShell
      eyebrow="Professional workspace"
      title="Athlete summary"
      description="See linked athletes, pending approval load, performance profile, and jump into the right operational page without searching."
      actions={
        <div className="pf-header-actions">
          <Link className="pf-button" href="/professional/approvals">
            Review queue
          </Link>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadDashboard()}
          >
            Refresh
          </button>
        </div>
      }
      stats={[
        {
          label: "Linked athletes",
          value: loading ? "..." : users.length,
          tone: "accent",
        },
        {
          label: "Pending reviews",
          value: loading ? "..." : totalPending,
          tone: "warning",
        },
        {
          label: "Current ranking",
          value: snapshot?.rankingGlobal ?? "-",
          tone: "success",
        },
      ]}
    >
      {message && <div className="pf-alert warning">{message}</div>}

      <section className="pf-dashboard-grid">
        <article className="pf-panel pf-focus-panel">
          <div className="pf-panel-header">
            <div>
              <h2>{selectedUser?.email ?? "Selected athlete"}</h2>
              <p className="pf-muted">
                Performance profile visible only for linked athletes and
                competent areas.
              </p>
            </div>
            {snapshot && (
              <StatusBadge tone="success">
                {formatDate(snapshot.createdAt)}
              </StatusBadge>
            )}
          </div>
          <RadarChart areas={radarAreas} />
        </article>

        <aside className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Coaching focus</h2>
              <p className="pf-muted">
                Highest opportunity area and pending review load.
              </p>
            </div>
          </div>
          {highestGap ? (
            <div className="pf-stack">
              <div className="pf-score-card">
                <span>Largest gap</span>
                <strong>{highestGap.label}</strong>
                <p className="pf-muted">
                  Real {highestGap.real.toFixed(0)} · Potential{" "}
                  {highestGap.potential.toFixed(0)} · Gap{" "}
                  {highestGap.gap.toFixed(0)}
                </p>
              </div>
              <div className="pf-actions">
                <Link className="pf-button" href="/professional/approvals">Review approvals</Link>
                {selectedUserId && (
                  <>
                    <Link
                      className="pf-button-secondary"
                      href={`/professional/users/${selectedUserId}/performance`}
                    >
                      Full profile
                    </Link>
                    <Link
                      className="pf-button-secondary"
                      href={`/professional/users/${selectedUserId}/performance?view=plans`}
                    >
                      Lavori storici
                    </Link>
                    <Link
                      className="pf-button-secondary"
                      href={`/professional/users/${selectedUserId}/performance?view=questions`}
                    >
                      Questionari storici
                    </Link>
                  </>
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              title="No performance snapshot"
              description="The athlete needs to close a published questionnaire before a profile is available."
            />
          )}
        </aside>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Roster</h2>
            <p className="pf-muted">
              Linked athletes available to this professional.
            </p>
          </div>
        </div>
        <div className="pf-grid">
          {users.map((user) => {
            const selected = user.id === selectedUserId;
            const pendingPlan = inbox.planItems.filter(
              (item) => item.planRelease.user.id === user.id,
            ).length;
            const pendingQuestions = inbox.questionApprovals.filter(
              (item) => item.questionSet.user.id === user.id,
            ).length;
            return (
              <button
                key={user.id}
                className={`pf-roster-card ${selected ? "selected" : ""}`}
                type="button"
                onClick={() => changeSelected(user.id)}
              >
                <span>
                  <strong>{user.email}</strong>
                  <small>{user.id.slice(0, 8)}</small>
                </span>
                <StatusBadge
                  tone={pendingPlan + pendingQuestions ? "warning" : "success"}
                >
                  {pendingPlan + pendingQuestions
                    ? `${pendingPlan + pendingQuestions} pending`
                    : "Clear"}
                </StatusBadge>
              </button>
            );
          })}
          {!loading && users.length === 0 && (
            <EmptyState
              title="No linked athletes"
              description="Link athletes from the admin workspace or seed demo data."
            />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
