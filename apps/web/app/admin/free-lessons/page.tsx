"use client";

import { useCallback, useEffect, useState } from "react";
import { ProductShell, StatusBadge } from "@/app/components/product-shell";
import { adminRequest } from "../components/admin-request";
import { MicroTestCatalog, SettingsPanel } from "./catalog";
import { type Overview, athleteLabel, dateTime } from "./free-lesson-types";

const emptyLesson = {
  partnerId: "",
  startsAt: "",
  coachId: "",
  capacity: 4,
  levelLabel: "",
};

/**
 * Lezione gratuita (A4.8, A7.2): circoli che la offrono, lezioni, gruppi
 * composti a mano per livello. Regole operative aperte (A4-D04, A7-D01).
 */
export default function AdminFreeLessonsPage() {
  const [overview, setOverview] = useState<Overview>();
  const [lesson, setLesson] = useState(emptyLesson);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOverview(await adminRequest<Overview>("/admin/free-lessons"));
    } catch (error) {
      setMessage((error as Error).message);
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
      setMessage(done);
      await load();
      return true;
    } catch (error) {
      setMessage((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const enabledClubs =
    overview?.clubs.filter((c) => c.freeLessonsEnabled) ?? [];
  const open = overview?.lessons.filter((l) => l.status === "SCHEDULED") ?? [];

  return (
    <ProductShell
      eyebrow="Amministrazione percorso"
      title="Lezione gratuita"
      description="Un posto per atleta in una lezione di un'ora in gruppo da 4, prima che R si chiuda. Il gruppo si compone a mano tra le richieste dello stesso circolo, per livello simile. Si attiva per gli atleti dal flag free_lesson in Rilasci."
      actions={
        <button className="pf-button-secondary" type="button" onClick={load}>
          Aggiorna
        </button>
      }
      stats={[
        {
          label: "Richieste",
          value: overview?.requests.length ?? 0,
          tone: "warning",
        },
        { label: "Lezioni in programma", value: open.length, tone: "accent" },
        {
          label: "Circoli attivi",
          value: enabledClubs.length,
          tone: "success",
        },
      ]}
    >
      {message && <div className="pf-alert warning">{message}</div>}
      {overview && (
        <section className="pf-dashboard-grid">
          <article className="pf-panel">
            <div className="pf-panel-header">
              <h2>Richieste da collocare</h2>
            </div>
            {overview.requests.length === 0 && (
              <p className="pf-muted">Nessuna richiesta aperta.</p>
            )}
            <div className="pf-stack">
              {overview.requests.map((request) => {
                const lessons = open.filter(
                  (l) => l.partnerId === request.partnerId,
                );
                return (
                  <article className="pf-card" key={request.userId}>
                    <h3>{athleteLabel(request)}</h3>
                    <p className="pf-muted">
                      {request.club}
                      {request.deadlineAt &&
                        ` · calibrazione fino a ${dateTime(request.deadlineAt)}`}
                    </p>
                    <select
                      className="pf-input"
                      aria-label={`Lezione per ${request.name || request.email}`}
                      disabled={busy || !lessons.length}
                      value=""
                      onChange={(event) =>
                        void run(
                          () =>
                            adminRequest(
                              `/admin/free-lessons/lessons/${event.target.value}/seats`,
                              "POST",
                              { userId: request.userId },
                            ),
                          "Posto assegnato.",
                        )
                      }
                    >
                      <option value="">
                        {lessons.length
                          ? "Assegna a una lezione"
                          : "Nessuna lezione in questo circolo"}
                      </option>
                      {lessons.map((l) => (
                        <option key={l.id} value={l.id}>
                          {dateTime(l.startsAt)} ·{" "}
                          {l.levelLabel ?? "livello misto"} · {l.seats.length}/
                          {l.capacity}
                        </option>
                      ))}
                    </select>
                  </article>
                );
              })}
            </div>
          </article>

          <article className="pf-panel">
            <div className="pf-panel-header">
              <h2>Lezioni</h2>
            </div>
            <div className="pf-stack">
              {overview.lessons.map((l) => (
                <article className="pf-card" key={l.id}>
                  <div className="pf-card-top">
                    <div>
                      <h3>
                        {l.club} · {dateTime(l.startsAt)}
                      </h3>
                      <p className="pf-muted">
                        {l.levelLabel ?? "Livello misto"} · {l.seats.length}/
                        {l.capacity} posti ·{" "}
                        {l.coach
                          ? (l.coach.firstName ?? l.coach.email)
                          : "coach da assegnare"}
                      </p>
                    </div>
                    <StatusBadge
                      tone={l.status === "SCHEDULED" ? "accent" : "success"}
                    >
                      {l.status === "SCHEDULED" ? "In programma" : "Svolta"}
                    </StatusBadge>
                  </div>
                  <ul>
                    {l.seats.map((seat) => (
                      <li key={seat.userId}>
                        {athleteLabel(seat)} · {seat.status}{" "}
                        {seat.status === "ASSIGNED" &&
                          l.status === "SCHEDULED" && (
                            <button
                              className="pf-button-secondary"
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () =>
                                    adminRequest(
                                      `/admin/free-lessons/lessons/${l.id}/seats/${seat.userId}`,
                                      "DELETE",
                                    ),
                                  "Atleta tolto dal gruppo.",
                                )
                              }
                            >
                              Togli
                            </button>
                          )}
                      </li>
                    ))}
                  </ul>
                  {l.status === "SCHEDULED" && (
                    <div className="pf-actions">
                      <select
                        className="pf-input"
                        aria-label="Coach"
                        disabled={busy}
                        value={l.coach?.id ?? ""}
                        onChange={(event) =>
                          void run(
                            () =>
                              adminRequest(
                                `/admin/free-lessons/lessons/${l.id}/coach`,
                                "PATCH",
                                { coachId: event.target.value || null },
                              ),
                            "Coach aggiornato.",
                          )
                        }
                      >
                        <option value="">Nessun coach</option>
                        {overview.coaches.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.firstName ?? c.email}
                          </option>
                        ))}
                      </select>
                      <button
                        className="pf-button-secondary"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              adminRequest(
                                `/admin/free-lessons/lessons/${l.id}/cancel`,
                                "POST",
                              ),
                            "Lezione annullata: i posti tornano richieste.",
                          )
                        }
                      >
                        Annulla lezione
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
            <form
              className="pf-stack"
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  () =>
                    adminRequest("/admin/free-lessons/lessons", "POST", {
                      partnerId: lesson.partnerId,
                      startsAt: new Date(lesson.startsAt).toISOString(),
                      capacity: lesson.capacity,
                      ...(lesson.coachId ? { coachId: lesson.coachId } : {}),
                      ...(lesson.levelLabel.trim()
                        ? { levelLabel: lesson.levelLabel.trim() }
                        : {}),
                    }),
                  "Lezione creata.",
                ).then((ok) => ok && setLesson(emptyLesson));
              }}
            >
              <h3>Nuova lezione</h3>
              <label className="pf-field">
                Circolo
                <select
                  className="pf-input"
                  required
                  value={lesson.partnerId}
                  onChange={(event) =>
                    setLesson({ ...lesson, partnerId: event.target.value })
                  }
                >
                  <option value="">Scegli</option>
                  {enabledClubs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pf-field">
                Data e ora
                <input
                  className="pf-input"
                  type="datetime-local"
                  required
                  value={lesson.startsAt}
                  onChange={(event) =>
                    setLesson({ ...lesson, startsAt: event.target.value })
                  }
                />
              </label>
              <label className="pf-field">
                Coach
                <select
                  className="pf-input"
                  value={lesson.coachId}
                  onChange={(event) =>
                    setLesson({ ...lesson, coachId: event.target.value })
                  }
                >
                  <option value="">Da assegnare</option>
                  {overview.coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName ?? c.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pf-field">
                Livello del gruppo
                <input
                  className="pf-input"
                  placeholder="Es. Intermedio"
                  value={lesson.levelLabel}
                  onChange={(event) =>
                    setLesson({ ...lesson, levelLabel: event.target.value })
                  }
                />
              </label>
              <label className="pf-field">
                Posti
                <input
                  className="pf-input"
                  type="number"
                  min={1}
                  max={8}
                  value={lesson.capacity}
                  onChange={(event) =>
                    setLesson({
                      ...lesson,
                      capacity: Number(event.target.value),
                    })
                  }
                />
              </label>
              <button className="pf-button" type="submit" disabled={busy}>
                Crea lezione
              </button>
            </form>
          </article>

          <article className="pf-panel">
            <div className="pf-panel-header">
              <h2>Circoli</h2>
            </div>
            <div className="pf-stack">
              {overview.clubs.map((club) => (
                <label className="pf-field" key={club.id}>
                  <span>
                    <input
                      type="checkbox"
                      checked={club.freeLessonsEnabled}
                      disabled={busy}
                      onChange={(event) =>
                        void run(
                          () =>
                            adminRequest(
                              `/admin/free-lessons/clubs/${club.id}`,
                              "PATCH",
                              { freeLessonsEnabled: event.target.checked },
                            ),
                          "Circolo aggiornato.",
                        )
                      }
                    />{" "}
                    {club.name}
                    {club.city ? `, ${club.city}` : ""}
                  </span>
                </label>
              ))}
            </div>
          </article>

          <SettingsPanel
            key={JSON.stringify(overview.settings)}
            settings={overview.settings}
            busy={busy}
            run={run}
          />
          <MicroTestCatalog overview={overview} busy={busy} run={run} />
        </section>
      )}
    </ProductShell>
  );
}
