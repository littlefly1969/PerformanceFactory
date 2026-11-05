"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import { DataTable } from "@/app/components/workspace/data-table";
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
  const latestRequest = useRef(0);
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
    const requestId = ++latestRequest.current;
    setLoading(true);
    setMessage(null);
    setSnapshot(null);
    try {
      const [usersRes, inboxRes] = await Promise.all([
        secureFetch(`${API_BASE}/relationships/my-users`, {
          credentials: "include",
        }),
        secureFetch(`${API_BASE}/professional/approvals`, {
          credentials: "include",
        }),
      ]);

      if (requestId !== latestRequest.current) return;
      if (usersRes.status === 401 || inboxRes.status === 401) {
        setMessage(
          "Accedi con un account professionista per aprire questo ambiente.",
        );
        return;
      }

      if (!usersRes.ok) {
        setMessage("Impossibile caricare gli atleti collegati.");
        return;
      }

      const loadedUsers = (await usersRes.json()) as LinkedUser[];
      if (requestId !== latestRequest.current) return;
      const nextSelected = preferredUserId || loadedUsers[0]?.id || "";
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
        const nextSnapshot = profileRes.ok
          ? ((await profileRes.json()) as Snapshot)
          : null;
        if (requestId !== latestRequest.current) return;
        setSnapshot(nextSnapshot);
      } else {
        setSnapshot(null);
      }
    } catch {
      if (requestId === latestRequest.current)
        setMessage("Impossibile aggiornare il riepilogo. Riprova.");
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    return () => {
      latestRequest.current += 1;
    };
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

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Elenco atleti</h2>
            <p className="pf-muted">
              Atleti collegati disponibili per questo professionista.
            </p>
          </div>
        </div>
        <DataTable
          label="Atleti collegati"
          rows={users}
          loading={loading}
          rowKey={(u) => u.id}
          searchText={(u) => u.email}
          empty="Nessun atleta collegato."
          columns={[
            {
              id: "email",
              label: "Atleta",
              value: (u) => u.email,
              render: (u) => (
                <strong>
                  {u.email}
                  <small>{u.id.slice(0, 8)}</small>
                </strong>
              ),
            },
            {
              id: "pending",
              label: "Revisioni in attesa",
              value: (u) =>
                inbox.planItems.filter((p) => p.planRelease.user.id === u.id)
                  .length +
                inbox.questionApprovals.filter(
                  (q) => q.questionSet.user.id === u.id,
                ).length,
              render: (u) => {
                const n =
                  inbox.planItems.filter((p) => p.planRelease.user.id === u.id)
                    .length +
                  inbox.questionApprovals.filter(
                    (q) => q.questionSet.user.id === u.id,
                  ).length;
                return (
                  <StatusBadge tone={n ? "warning" : "success"}>
                    {n ? `${n} in attesa` : "Nessuna"}
                  </StatusBadge>
                );
              },
            },
            {
              id: "actions",
              label: "Azioni",
              render: (u) => (
                <div className="pf-actions">
                  <button
                    type="button"
                    className="pf-button-secondary"
                    aria-pressed={u.id === selectedUserId}
                    onClick={() => changeSelected(u.id)}
                  >
                    {u.id === selectedUserId ? "Selezionato" : "Seleziona"}
                  </button>
                  <Link href={`/professional/users/${u.id}/performance`}>
                    Apri profilo →
                  </Link>
                </div>
              ),
            },
          ]}
        />
      </section>

      <section className="pf-dashboard-grid ws-split">
        <article className="pf-panel pf-focus-panel">
          <div className="pf-panel-header">
            <div>
              <h2>{selectedUser?.email ?? "Atleta selezionato"}</h2>
              <p className="pf-muted">
                Profilo performance visibile solo per atleti collegati e aree di
                competenza.
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
                <Link className="pf-button" href="/professional/approvals">
                  Rivedi approvazioni
                </Link>
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
    </ProductShell>
  );
}
