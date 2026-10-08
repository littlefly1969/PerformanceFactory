"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Participant = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  level: string | null;
  drivers: Array<{ areaId: string; name: string }>;
  feedback: Array<{ areaId: string; rating: number }>;
};

type Lesson = {
  id: string;
  club: { name: string; city: string | null };
  startsAt: string;
  durationMinutes: number;
  levelLabel: string | null;
  status: string;
  started: boolean;
  participants: Participant[];
};

type Response = {
  ratings: Array<{ value: number; label: string }>;
  lessons: Lesson[];
};

const LEVELS: Record<string, string> = {
  BEGINNER: "Principiante",
  INTERMEDIATE: "Intermedio",
  ADVANCED: "Avanzato",
  COMPETITIVE: "Agonista",
  PRO: "Professionista",
};

/** Il driver tecnico-tattico è quello su cui la lezione pesa di più (A4.8). */
const isTechnical = (name: string) => /tecnic/i.test(name);

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await secureFetch(
    `${API_BASE}/professional/lessons${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    },
  );
  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  if (!response.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(". ")
        : (data.message ?? "Operazione non riuscita."),
    );
  return data as T;
}

function FeedbackForm({
  lesson,
  participant,
  ratings,
  busy,
  onSubmit,
  onNoShow,
}: {
  lesson: Lesson;
  participant: Participant;
  ratings: Response["ratings"];
  busy: boolean;
  onSubmit: (body: unknown) => void;
  onNoShow: () => void;
}) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const chosen = Object.entries(scores);
  return (
    <form
      className="pf-stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          userId: participant.userId,
          ratings: chosen.map(([areaId, rating]) => ({ areaId, rating })),
          ...(note.trim() ? { note: note.trim() } : {}),
        });
      }}
    >
      {participant.drivers
        .filter((d) => isTechnical(d.name))
        .concat(participant.drivers.filter((d) => !isTechnical(d.name)))
        .map((driver) => (
          <label className="pf-field" key={driver.areaId}>
            {driver.name}
            {isTechnical(driver.name) ? " (principale)" : " (facoltativo)"}
            <select
              className="pf-input"
              value={scores[driver.areaId] ?? ""}
              onChange={(event) => {
                const next = { ...scores };
                if (event.target.value)
                  next[driver.areaId] = Number(event.target.value);
                else delete next[driver.areaId];
                setScores(next);
              }}
            >
              <option value="">Non valutato</option>
              {ratings.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.value} · {r.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      <label className="pf-field">
        Nota per l&apos;atleta e per PF
        <textarea
          className="pf-input"
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="pf-actions">
        <button
          className="pf-button"
          type="submit"
          disabled={busy || !lesson.started || !chosen.length}
        >
          Invia feedback
        </button>
        <button
          className="pf-button-secondary"
          type="button"
          disabled={busy || !lesson.started}
          onClick={onNoShow}
        >
          Assente
        </button>
      </div>
    </form>
  );
}

/**
 * Lezioni gratuite del coach: vede solo i partecipanti, con livello stimato
 * e driver; il feedback entra come fonte distinta nella valutazione.
 */
export default function ProfessionalLessonsPage() {
  const [data, setData] = useState<Response>();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await request<Response>(""));
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (path: string, body: unknown, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await request(path, body);
      setMessage(done);
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProductShell
      eyebrow="Circolo"
      title="Lezioni gratuite"
      description="Gruppi da 4 atleti in calibrazione. Dopo la lezione dai un voto da 1 a 5 almeno sul driver tecnico-tattico: entra nella loro valutazione accanto alle loro risposte, senza sostituirle."
    >
      {message && <div className="pf-alert warning">{message}</div>}
      {data && data.lessons.length === 0 && (
        <EmptyState
          title="Nessuna lezione"
          description="Le lezioni assegnate a te compaiono qui."
        />
      )}
      <div className="pf-stack">
        {data?.lessons.map((lesson) => (
          <article className="pf-panel" key={lesson.id}>
            <div className="pf-panel-header">
              <h2>
                {lesson.club.name} ·{" "}
                {new Date(lesson.startsAt).toLocaleString("it-IT", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </h2>
              <StatusBadge
                tone={lesson.status === "COMPLETED" ? "success" : "accent"}
              >
                {lesson.status === "COMPLETED" ? "Chiusa" : "In programma"}
              </StatusBadge>
            </div>
            <p className="pf-muted">
              {lesson.levelLabel ?? "Livello misto"} · {lesson.durationMinutes}{" "}
              minuti
              {!lesson.started &&
                " · il feedback si apre all'inizio della lezione"}
            </p>
            <div className="pf-stack">
              {lesson.participants.map((p) => (
                <article className="pf-card" key={p.userId}>
                  <h3>
                    {[p.firstName, p.lastName].filter(Boolean).join(" ") ||
                      "Atleta"}{" "}
                    · {p.level ? LEVELS[p.level] : "livello non stimato"}
                  </h3>
                  {p.status === "ASSIGNED" ? (
                    <FeedbackForm
                      lesson={lesson}
                      participant={p}
                      ratings={data.ratings}
                      busy={busy}
                      onSubmit={(body) =>
                        void run(
                          `/${lesson.id}/feedback`,
                          body,
                          "Feedback inviato.",
                        )
                      }
                      onNoShow={() =>
                        void run(
                          `/${lesson.id}/no-show`,
                          { userId: p.userId },
                          "Assenza registrata.",
                        )
                      }
                    />
                  ) : (
                    <p className="pf-muted">
                      {p.status === "NO_SHOW"
                        ? "Assente"
                        : `Feedback inviato: ${p.feedback
                            .map((f) => {
                              const driver = p.drivers.find(
                                (d) => d.areaId === f.areaId,
                              );
                              return `${driver?.name ?? "driver"} ${f.rating}/5`;
                            })
                            .join(", ")}`}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </article>
        ))}
      </div>
    </ProductShell>
  );
}
