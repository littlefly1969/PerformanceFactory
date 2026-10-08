"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Club = { id: string; name: string; city: string | null };

export type FreeLessonView =
  | { enabled: false }
  | {
      enabled: true;
      phase:
        | "UNAVAILABLE"
        | "LOCKED"
        | "ELIGIBLE"
        | "DECLINED"
        | "REQUESTED"
        | "ASSIGNED"
        | "ATTENDED"
        | "NO_SHOW"
        | "CLOSED";
      missing: Array<"LEVEL" | "CONFIDENCE">;
      credits: { balance: number; toUnlock: number };
      earn: {
        initialAssessment: number;
        calibrationRound: number;
        microTest: number;
      };
      clubs: Club[];
      attributedClubId: string | null;
      seat: {
        status: string;
        club: { name: string; city: string | null };
        lesson: { startsAt: string; durationMinutes: number } | null;
      } | null;
      microTests: Array<{
        id: string;
        title: string;
        instructions: string;
        areaName: string;
        /** Scritto dall'AI per questo atleta; altrimenti dal catalogo. */
        personal: boolean;
        options: Array<{ value: string; label: string }>;
      }>;
      microTestsLeft: number;
      /** Il server chiede di preparare i micro-test su misura. */
      generateMicroTests: boolean;
    };

const URL = `${API_BASE}/athlete-journey/free-lesson`;

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

const MISSING: Record<string, string> = {
  LEVEL:
    "Serve un livello stimato: rispondi ai round di calibrazione per formare gruppi omogenei.",
  CONFIDENCE:
    "Continua con domande e micro-test: quando il tuo profilo è abbastanza attendibile, la lezione si sblocca.",
};

/**
 * La lezione gratuita come premio per l'interesse dimostrato: si sblocca con
 * un profilo attendibile (regola di eleggibilità), e il feedback del coach
 * chiude R e potenziale. I crediti mostrano solo il percorso fatto (OP-01).
 * `onChanged` avvisa il percorso quando una scelta può chiudere R.
 */
export function FreeLessonPanel({
  refreshKey,
  onChanged,
}: {
  refreshKey: string;
  onChanged?: () => void;
}) {
  const [view, setView] = useState<FreeLessonView>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [clubId, setClubId] = useState("");
  const [share, setShare] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const generated = useRef<string | null>(null);

  const call = useCallback(async (path = "", body?: unknown) => {
    setBusy(true);
    setMessage(null);
    const response = await secureFetch(`${URL}${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    setBusy(false);
    const data = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    if (!response.ok) {
      setMessage(
        Array.isArray(data.message)
          ? data.message.join(". ")
          : (data.message ?? "Operazione non riuscita."),
      );
      return false;
    }
    setView(data as FreeLessonView);
    return true;
  }, []);

  useEffect(() => {
    void call();
  }, [call, refreshKey]);

  // Una richiesta di micro-test su misura per stato del percorso, mai in loop.
  const wantsTests = view?.enabled === true && view.generateMicroTests;
  useEffect(() => {
    if (!wantsTests || generated.current === refreshKey) return;
    generated.current = refreshKey;
    setPreparing(true);
    void call("/micro-tests/generate", {}).finally(() => setPreparing(false));
  }, [call, wantsTests, refreshKey]);

  if (!view?.enabled || view.phase === "UNAVAILABLE") return null;
  const { credits, earn, seat } = view;
  const percent = credits.toUnlock
    ? Math.min(100, Math.round((credits.balance / credits.toUnlock) * 100))
    : 100;
  const selected = clubId || view.attributedClubId || view.clubs[0]?.id || "";
  const where = seat
    ? `${seat.club.name}${seat.club.city ? `, ${seat.club.city}` : ""}`
    : "";

  return (
    <section
      className="pf4-body pf4-free-lesson"
      aria-labelledby="pf4-free-lesson-title"
    >
      <span className="pf4-kicker">Lezione gratuita al circolo</span>
      <h2 id="pf4-free-lesson-title">
        {view.phase === "ATTENDED"
          ? "Lezione fatta."
          : view.phase === "ASSIGNED"
            ? "Il tuo posto è confermato."
            : "Un'ora di padel in gruppo da 4, con un coach."}
      </h2>
      {message && (
        <p className="pf4-error" role="alert">
          {message}
        </p>
      )}
      {(view.phase === "LOCKED" || view.phase === "ELIGIBLE") && (
        <>
          <p>
            Il coach ti vede giocare e il suo giudizio chiude la tua R e il tuo
            potenziale. La sblocchi con un profilo attendibile: risposte
            coerenti e micro-test. I crediti segnano il percorso fatto: +
            {earn.initialAssessment} con la prima valutazione, +
            {earn.calibrationRound} per ogni round di domande, +{earn.microTest}{" "}
            per ogni micro-test.
          </p>
          <div
            className="pf4-credits"
            role="progressbar"
            aria-label="Crediti per la lezione"
            aria-valuemin={0}
            aria-valuemax={credits.toUnlock}
            aria-valuenow={Math.min(credits.balance, credits.toUnlock)}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <p>
            <strong>
              {credits.balance} di {credits.toUnlock} crediti
            </strong>
          </p>
          {view.missing.map((m) => (
            <p key={m}>{MISSING[m]}</p>
          ))}
        </>
      )}
      {view.phase === "DECLINED" && (
        <p>
          Hai scelto di non fare la lezione: la tua R si chiude con le tue
          risposte. Se cambi idea, puoi ancora richiedere il posto.
        </p>
      )}
      {(view.phase === "ELIGIBLE" || view.phase === "DECLINED") && (
        <form
          className="pf4-free-lesson-request"
          onSubmit={(event) => {
            event.preventDefault();
            void call("/request", {
              partnerId: selected,
              shareWithCoach: share,
            });
          }}
        >
          <label>
            Circolo
            <select
              value={selected}
              onChange={(event) => setClubId(event.target.value)}
            >
              {view.clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                  {club.city ? `, ${club.city}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={share}
              onChange={(event) => setShare(event.target.checked)}
            />{" "}
            Il coach della lezione può vedere nome, livello stimato e driver.
            Non riceve email né telefono.
          </label>
          <button className="pf4-cta" disabled={busy || !share || !selected}>
            Richiedi il posto →
          </button>
        </form>
      )}
      {view.phase === "ELIGIBLE" && (
        <>
          <p>
            La tua R e il tuo potenziale si chiudono dopo la lezione. Se
            preferisci non farla, si chiudono con le tue risposte.
          </p>
          <button
            className="pf4-link"
            type="button"
            disabled={busy}
            onClick={() =>
              void call("/decline", {}).then((ok) => ok && onChanged?.())
            }
          >
            Preferisco non fare la lezione
          </button>
        </>
      )}
      {view.phase === "REQUESTED" && (
        <p>
          Richiesta inviata a {where}. Il circolo compone gruppi di livello
          simile: ti avvisiamo appena c&apos;è una data.
        </p>
      )}
      {view.phase === "ASSIGNED" && seat?.lesson && (
        <p>
          {when(seat.lesson.startsAt)} presso {where},{" "}
          {seat.lesson.durationMinutes} minuti in gruppo da 4. La tua R si
          chiude dopo il feedback del coach.
        </p>
      )}
      {(view.phase === "REQUESTED" || view.phase === "ASSIGNED") && (
        <button
          className="pf4-link"
          type="button"
          disabled={busy}
          onClick={() =>
            void call("/withdraw", {}).then((ok) => ok && onChanged?.())
          }
        >
          Rinuncia al posto
        </button>
      )}
      {view.phase === "ATTENDED" && (
        <p>Il feedback del coach è entrato nella tua valutazione.</p>
      )}
      {view.phase === "NO_SHOW" && (
        <p>
          Non risulti presente alla lezione: il posto gratuito è stato usato.
        </p>
      )}
      {view.phase === "CLOSED" && (
        <p>
          La calibrazione è chiusa: la lezione gratuita serviva a completarla.
        </p>
      )}
      {preparing && view.microTests.length === 0 && (
        <p role="status">Preparo i micro-test su misura per te…</p>
      )}
      {view.microTests.length > 0 && (
        <div className="pf4-micro-tests">
          <h3>Micro-test di oggi</h3>
          {view.microTests.map((test) => (
            <fieldset key={test.id}>
              <legend>
                {test.title} · {test.areaName}
                {test.personal ? " · su misura" : ""}
              </legend>
              <p>{test.instructions}</p>
              <div className="pf4-options">
                {test.options.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className="pf4-option"
                    disabled={busy}
                    onClick={() =>
                      void call(`/micro-tests/${test.id}`, {
                        value: option.value,
                      })
                    }
                  >
                    <span>{option.label}</span>
                    <span className="pf4-dot" />
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}
    </section>
  );
}
