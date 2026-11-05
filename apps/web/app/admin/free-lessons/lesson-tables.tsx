"use client";

import { useState } from "react";
import { DataTable } from "@/app/components/workspace/data-table";
import { StatusBadge } from "@/app/components/product-shell";
import { adminRequest } from "../components/admin-request";
import { type Overview, athleteLabel, dateTime } from "./free-lesson-types";

export type Run = (
  action: () => Promise<unknown>,
  done: string,
) => Promise<boolean>;
type Props = { overview: Overview; busy: boolean; run: Run };
const coachName = (coach: Overview["coaches"][number] | null) =>
  coach ? coach.firstName || coach.email : "Da assegnare";

export function LessonTable({ overview, busy, run }: Props) {
  const [club, setClub] = useState("");
  const [status, setStatus] = useState("SCHEDULED");
  const [day, setDay] = useState("");
  const rows = overview.lessons.filter(
    (l) =>
      (!club || l.partnerId === club) &&
      (!status || l.status === status) &&
      (!day || new Date(l.startsAt).toLocaleDateString("sv-SE") === day),
  );
  return (
    <DataTable
      label="Lezioni"
      rows={rows}
      rowKey={(l) => l.id}
      initialSort={{ id: "date", direction: "asc" }}
      searchText={(l) =>
        `${l.club} ${l.levelLabel ?? ""} ${coachName(l.coach)} ${dateTime(l.startsAt)}`
      }
      filters={
        <>
          <select
            aria-label="Filtra lezioni per circolo"
            value={club}
            onChange={(e) => setClub(e.target.value)}
          >
            <option value="">Tutti i circoli</option>
            {overview.clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Stato lezioni"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="SCHEDULED">In programma</option>
            <option value="COMPLETED">Svolte</option>
            <option value="">Tutti gli stati</option>
          </select>
          <label className="ws-filter-date">
            Giorno{" "}
            <input
              className="pf-input"
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
        </>
      }
      columns={[
        {
          id: "date",
          label: "Data e ora",
          value: (l) => new Date(l.startsAt).getTime(),
          render: (l) => <strong>{dateTime(l.startsAt)}</strong>,
        },
        {
          id: "club",
          label: "Circolo",
          value: (l) => l.club,
          render: (l) => l.club,
        },
        {
          id: "level",
          label: "Livello",
          value: (l) => l.levelLabel ?? "",
          render: (l) => l.levelLabel || "Misto",
        },
        {
          id: "coach",
          label: "Coach",
          value: (l) => coachName(l.coach),
          render: (l) => coachName(l.coach),
        },
        {
          id: "seats",
          label: "Posti",
          value: (l) => l.seats.length,
          render: (l) => (
            <StatusBadge
              tone={l.seats.length >= l.capacity ? "warning" : "neutral"}
            >
              {l.seats.length} / {l.capacity}
            </StatusBadge>
          ),
        },
        {
          id: "status",
          label: "Stato",
          value: (l) => l.status,
          render: (l) => (
            <StatusBadge tone={l.status === "SCHEDULED" ? "accent" : "success"}>
              {l.status === "SCHEDULED" ? "In programma" : "Svolta"}
            </StatusBadge>
          ),
        },
      ]}
      renderDetails={(l) => (
        <div className="pf-stack">
          <h3>
            Gruppo · {l.club} · {dateTime(l.startsAt)}
          </h3>
          {l.seats.length ? (
            <ul>
              {l.seats.map((seat) => (
                <li key={seat.userId}>
                  {athleteLabel(seat)} · {seat.status}{" "}
                  {seat.status === "ASSIGNED" && l.status === "SCHEDULED" && (
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
          ) : (
            <p className="pf-muted">
              Nessun atleta assegnato a questa lezione.
            </p>
          )}
          {l.status === "SCHEDULED" && (
            <div className="pf-actions">
              <label className="pf-field">
                Coach della lezione
                <select
                  className="pf-input"
                  aria-label={`Coach per ${l.club} ${dateTime(l.startsAt)}`}
                  disabled={busy}
                  value={l.coach?.id ?? ""}
                  onChange={(e) =>
                    void run(
                      () =>
                        adminRequest(
                          `/admin/free-lessons/lessons/${l.id}/coach`,
                          "PATCH",
                          { coachId: e.target.value || null },
                        ),
                      "Coach aggiornato.",
                    )
                  }
                >
                  <option value="">Nessun coach</option>
                  {overview.coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {coachName(c)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="pf-button-secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Annullare la lezione di ${l.club} del ${dateTime(l.startsAt)}? Gli atleti torneranno nelle richieste da collocare.`,
                    )
                  )
                    void run(
                      () =>
                        adminRequest(
                          `/admin/free-lessons/lessons/${l.id}/cancel`,
                          "POST",
                        ),
                      "Lezione annullata: i posti tornano richieste.",
                    );
                }}
              >
                Annulla lezione
              </button>
            </div>
          )}
        </div>
      )}
    />
  );
}

export function RequestTable({ overview, busy, run }: Props) {
  return (
    <DataTable
      label="Richieste"
      rows={overview.requests}
      rowKey={(r) => r.userId}
      searchText={(r) =>
        `${r.name ?? ""} ${r.email ?? ""} ${r.club} ${athleteLabel(r)}`
      }
      columns={[
        {
          id: "athlete",
          label: "Atleta e livello",
          value: (r) => r.name || r.email || r.userId,
          render: (r) => <strong>{athleteLabel(r)}</strong>,
        },
        {
          id: "club",
          label: "Circolo",
          value: (r) => r.club,
          render: (r) => r.club,
        },
        {
          id: "preferred",
          label: "Preferenza",
          render: (r) => {
            const p = overview.lessons.find(
              (l) => l.id === r.preferredLessonId,
            );
            return p ? dateTime(p.startsAt) : "Non indicata";
          },
        },
        {
          id: "deadline",
          label: "Scadenza calibrazione",
          value: (r) => (r.deadlineAt ? new Date(r.deadlineAt).getTime() : 0),
          render: (r) => (r.deadlineAt ? dateTime(r.deadlineAt) : "—"),
        },
        {
          id: "assign",
          label: "Assegna posto",
          render: (r) => {
            const lessons = overview.lessons.filter(
              (l) =>
                l.partnerId === r.partnerId &&
                l.status === "SCHEDULED" &&
                new Date(l.startsAt).getTime() > Date.now() &&
                l.seats.length < l.capacity,
            );
            return (
              <select
                className="pf-input"
                value=""
                aria-label={`Lezione per ${r.name || r.email || r.userId}`}
                disabled={busy || !lessons.length}
                onChange={(e) =>
                  void run(
                    () =>
                      adminRequest(
                        `/admin/free-lessons/lessons/${e.target.value}/seats`,
                        "POST",
                        { userId: r.userId },
                      ),
                    "Posto assegnato.",
                  )
                }
              >
                <option value="">
                  {lessons.length
                    ? "Scegli lezione…"
                    : "Nessun posto disponibile"}
                </option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {dateTime(l.startsAt)} · {l.levelLabel ?? "Misto"} ·{" "}
                    {l.seats.length}/{l.capacity}
                    {l.id === r.preferredLessonId ? " · preferita" : ""}
                  </option>
                ))}
              </select>
            );
          },
        },
      ]}
      empty="Nessuna richiesta da collocare."
    />
  );
}

const emptyLesson = {
  partnerId: "",
  startsAt: "",
  coachId: "",
  capacity: 4,
  levelLabel: "",
};
export function NewLesson({ overview, busy, run }: Props) {
  const [draft, setDraft] = useState(emptyLesson);
  return (
    <details className="ws-create">
      <summary>+ Nuova lezione</summary>
      <form
        className="ws-form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              adminRequest("/admin/free-lessons/lessons", "POST", {
                partnerId: draft.partnerId,
                startsAt: new Date(draft.startsAt).toISOString(),
                capacity: draft.capacity,
                ...(draft.coachId ? { coachId: draft.coachId } : {}),
                ...(draft.levelLabel.trim()
                  ? { levelLabel: draft.levelLabel.trim() }
                  : {}),
              }),
            "Lezione creata.",
          ).then((ok) => {
            if (ok) setDraft(emptyLesson);
          });
        }}
      >
        <label className="pf-field">
          Circolo
          <select
            className="pf-input"
            required
            value={draft.partnerId}
            onChange={(e) => setDraft({ ...draft, partnerId: e.target.value })}
          >
            <option value="">Scegli circolo</option>
            {overview.clubs
              .filter((c) => c.freeLessonsEnabled)
              .map((c) => (
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
            required
            type="datetime-local"
            value={draft.startsAt}
            onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
          />
        </label>
        <label className="pf-field">
          Coach
          <select
            className="pf-input"
            value={draft.coachId}
            onChange={(e) => setDraft({ ...draft, coachId: e.target.value })}
          >
            <option value="">Da assegnare</option>
            {overview.coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {coachName(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="pf-field">
          Livello del gruppo
          <input
            className="pf-input"
            placeholder="Es. Intermedio"
            value={draft.levelLabel}
            onChange={(e) => setDraft({ ...draft, levelLabel: e.target.value })}
          />
        </label>
        <label className="pf-field">
          Posti
          <input
            className="pf-input"
            type="number"
            min={1}
            max={8}
            required
            value={draft.capacity}
            onChange={(e) =>
              setDraft({ ...draft, capacity: Number(e.target.value) })
            }
          />
        </label>
        <button className="pf-button" type="submit" disabled={busy}>
          Crea lezione
        </button>
      </form>
    </details>
  );
}
