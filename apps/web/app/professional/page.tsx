"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  return parsed.toLocaleDateString("it-IT", {
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

  const highestGap = useMemo(() => {
    const sorted = radarAree
      .map((area) => ({
        ...area,
        gap: Math.max(0, area.potential - area.real),
      }))
      .sort((a, b) => b.gap - a.gap);
    return sorted[0] ?? null;
  }, [radarAree]);

  const totalPending = useMemo(
    () => inbox.planItems.length + inbox.questionApprovals.length,
    [inbox],
  );

  const loadDashboard = useCallback(async (preferredUserId?: string) => {
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
      setMessage("Accedi con un account professionista per aprire questo ambiente.");
      setLoading(false);
      return;
    }

    if (!usersRes.ok) {
      setMessage("Impossibile caricare gli atleti collegati.");
      setLoading(false);
      return;
    }

    const loadedUsers = (await usersRes.json()) as LinkedUser[];
    const nextSelected =
      preferredUserId || loadedUsers[0]?.id || "";
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
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const changeSelected = (userId: string) => {
    setSelectedUserId(userId);
    void loadDashboard(userId);
  };

  return (
    <ProductShell
      eyebrow="Ambiente professionista"
      title="Riepilogo atleti"
      description="Vedi atleti collegati, approvazioni pendenti, profilo performance e accesso rapido alle aree operative."
      actions={
        <div className="pf-header-actions">
          <Link className="pf-button" href="/professional/approvals">
            Coda revisioni
          </Link>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadDashboard(selectedUserId)}
          >
            Aggiorna
          </button>
        </div>
      }
      stats={[
        {
          label: "Atleti collegati",
          value: loading ? "..." : users.length,
          tone: "accent",
        },
        {
          label: "Revisioni in attesa",
          value: loading ? "..." : totalPending,
          tone: "warning",
        },
        {
          label: "Ranking corrente",
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
              <h2>{selectedUser?.email ?? "Atleta selezionato"}</h2>
              <p className="pf-muted">
                Profilo performance visibile solo per atleti collegati e
                aree di competenza.
              </p>
            </div>
            {snapshot && (
              <StatusBadge tone="success">
                {formatDate(snapshot.createdAt)}
              </StatusBadge>
            )}
          </div>
          <RadarChart areas={radarAree} />
        </article>

        <aside className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Focus professionista</h2>
              <p className="pf-muted">
                Area con maggiore opportunita e carico revisioni pendenti.
              </p>
            </div>
          </div>
          {highestGap ? (
            <div className="pf-stack">
              <div className="pf-score-card">
                <span>Gap principale</span>
                <strong>{highestGap.label}</strong>
                <p className="pf-muted">
                  Reale {highestGap.real.toFixed(0)} - Potenziale{" "}
                  {highestGap.potential.toFixed(0)} - Gap{" "}
                  {highestGap.gap.toFixed(0)}
                </p>
              </div>
              <div className="pf-actions">
                <Link className="pf-button" href="/professional/approvals">Rivedi approvazioni</Link>
                {selectedUserId && (
                  <Link
                    className="pf-button-secondary"
                    href={`/professional/users/${selectedUserId}/performance`}
                  >
                    Profilo atleta
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Nessuno snapshot performance"
              description="L'atleta deve chiudere un questionario pubblicato prima che il profilo sia disponibile."
            />
          )}
        </aside>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Elenco atleti</h2>
            <p className="pf-muted">
              Atleti collegati disponibili per questo professionista.
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
                    ? `${pendingPlan + pendingQuestions} in attesa`
                    : "Libero"}
                </StatusBadge>
              </button>
            );
          })}
          {!loading && users.length === 0 && (
            <EmptyState
              title="Nessun atleta collegato"
              description="Collega atleti dall'ambiente amministratore o dai dati demo."
            />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
