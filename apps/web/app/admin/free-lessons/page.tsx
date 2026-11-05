"use client";

import { useCallback, useEffect, useState } from "react";
import { ProductShell } from "@/app/components/product-shell";
import { DataTable } from "@/app/components/workspace/data-table";
import { adminRequest } from "../components/admin-request";
import { SettingsPanel } from "./settings-panel";
import { type Overview } from "./free-lesson-types";
import { LessonTable, NewLesson, RequestTable } from "./lesson-tables";

export default function AdminFreeLessonsPage() {
  const [overview, setOverview] = useState<Overview>();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("lessons");
  const load = useCallback(async () => {
    try {
      setOverview(await adminRequest<Overview>("/admin/free-lessons"));
      return true;
    } catch (error) {
      setMessage((error as Error).message);
      return false;
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      const refreshed = await load();
      setMessage(
        refreshed
          ? done
          : `${done} L’elenco non è stato aggiornato: premi Aggiorna.`,
      );
      return true;
    } catch (error) {
      setMessage((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <ProductShell
      eyebrow="Operatività"
      title="Lezioni gratuite"
      description="Organizza il calendario, assegna coach e componi i gruppi dalle richieste degli atleti."
      actions={
        <button
          className="pf-button-secondary"
          type="button"
          onClick={() => void load()}
        >
          Aggiorna
        </button>
      }
      stats={[
        {
          label: "Richieste da collocare",
          value: overview?.requests.length ?? 0,
          tone: "warning",
        },
        {
          label: "Lezioni in programma",
          value:
            overview?.lessons.filter((l) => l.status === "SCHEDULED").length ??
            0,
          tone: "accent",
        },
        {
          label: "Senza coach",
          value:
            overview?.lessons.filter(
              (l) => l.status === "SCHEDULED" && !l.coach,
            ).length ?? 0,
          tone: "warning",
        },
        {
          label: "Circoli abilitati",
          value:
            overview?.clubs.filter((c) => c.freeLessonsEnabled).length ?? 0,
          tone: "success",
        },
      ]}
    >
      {message && (
        <div className="pf-alert" role="status">
          {message}
        </div>
      )}
      {!overview && !message && <p role="status">Caricamento lezioni…</p>}
      {overview && (
        <>
          <div className="ws-tabs" role="group" aria-label="Sezione lezioni">
            {[
              ["lessons", "Calendario"],
              ["requests", `Richieste (${overview.requests.length})`],
              ["clubs", "Circoli"],
              ["settings", "Crediti"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "lessons" && (
            <section className="pf-panel">
              <h2>Calendario lezioni</h2>
              <NewLesson overview={overview} busy={busy} run={run} />
              <LessonTable overview={overview} busy={busy} run={run} />
            </section>
          )}
          {tab === "requests" && (
            <section className="pf-panel">
              <div className="pf-panel-header">
                <h2>Richieste da collocare</h2>
              </div>
              <RequestTable overview={overview} busy={busy} run={run} />
            </section>
          )}
          {tab === "clubs" && (
            <section className="pf-panel">
              <div className="pf-panel-header">
                <h2>Circoli che offrono la lezione</h2>
              </div>
              <DataTable
                label="Circoli abilitati"
                rows={overview.clubs}
                rowKey={(c) => c.id}
                searchText={(c) => `${c.name} ${c.city ?? ""}`}
                columns={[
                  {
                    id: "name",
                    label: "Circolo",
                    value: (c) => c.name,
                    render: (c) => <strong>{c.name}</strong>,
                  },
                  {
                    id: "city",
                    label: "Città",
                    value: (c) => c.city ?? "",
                    render: (c) => c.city || "—",
                  },
                  {
                    id: "enabled",
                    label: "Lezione gratuita",
                    render: (c) => (
                      <label className="pf-checkbox">
                        <input
                          type="checkbox"
                          checked={c.freeLessonsEnabled}
                          disabled={busy}
                          onChange={(e) =>
                            void run(
                              () =>
                                adminRequest(
                                  `/admin/free-lessons/clubs/${c.id}`,
                                  "PATCH",
                                  { freeLessonsEnabled: e.target.checked },
                                ),
                              "Circolo aggiornato.",
                            )
                          }
                        />
                        Abilitata per {c.name}
                      </label>
                    ),
                  },
                ]}
              />
            </section>
          )}
          {tab === "settings" && (
            <SettingsPanel
              key={JSON.stringify(overview.settings)}
              settings={overview.settings}
              busy={busy}
              run={run}
            />
          )}
        </>
      )}
    </ProductShell>
  );
}
