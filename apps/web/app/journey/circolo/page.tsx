"use client";
import { useEffect, useRef, useState } from "react";
import {
  type FreeLessonView,
  type LessonSlot,
  postJson,
  useResource,
} from "../_account/account-data";
import {
  AccountScreen,
  AccountTopBar,
  PillButton,
  PillLink,
} from "../_account/account-shell";
import { useAccountJourney } from "../_account/calibration-state";
import { summaryHref } from "../_account/next-step";

const dayKey = (iso: string) => new Date(iso).toDateString();
const weekday = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { weekday: "short" }).slice(0, 3);
const dayNumber = (iso: string) => new Date(iso).getDate();
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Senza distanza si dice perché, invece di mostrare un numero inventato. */
const NO_DISTANCE = {
  NO_ADDRESS:
    "Non possiamo calcolare quanto distano i circoli: aggiungi il tuo indirizzo nel tuo account.",
  ADDRESS_NOT_LOCATED:
    "Non possiamo calcolare quanto distano i circoli: il tuo indirizzo non è stato riconosciuto, puoi correggerlo nel tuo account.",
};

/** Città e distanza del circolo, nelle parti che conosciamo. */
const clubPlace = (club: { city: string | null; distanceKm: number | null }) =>
  [club.city, club.distanceKm === null ? null : `a ${club.distanceKm} km`]
    .filter(Boolean)
    .join(" · ");

/** Giorni con almeno una lezione in calendario, in ordine. */
function days(slots: LessonSlot[]) {
  const seen = new Map<string, string>();
  for (const s of slots)
    if (!seen.has(dayKey(s.startsAt))) seen.set(dayKey(s.startsAt), s.startsAt);
  return [...seen.entries()];
}

/**
 * Scelta del circolo per la lezione gratuita: il circolo, e se ci sono
 * lezioni in calendario il giorno e l'orario preferiti. Il gruppo di livello
 * simile lo compone il circolo; il coach vede il livello solo con il consenso.
 */
export default function ClubPage() {
  useAccountJourney();
  const {
    data: view,
    error,
    setData,
  } = useResource<FreeLessonView>("/athlete-journey/free-lesson");
  const [clubId, setClubId] = useState("");
  const [day, setDay] = useState("");
  const [slotId, setSlotId] = useState("");
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // Esito dell'ultima azione riuscita, con il ritorno al riepilogo.
  const [done, setDone] = useState("");
  const outcome = useRef<HTMLElement>(null);
  useEffect(() => {
    if (done) outcome.current?.focus();
  }, [done]);

  const call = async (path: string, success: string, body: unknown = {}) => {
    setBusy(true);
    setMessage("");
    setDone("");
    try {
      setData(
        await postJson<FreeLessonView>(
          `/athlete-journey/free-lesson${path}`,
          body,
        ),
      );
      setDone(success);
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Operazione non riuscita.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const top = (
    <AccountTopBar title="Lezione gratuita" back="/journey/profilo" />
  );
  if (!view?.enabled || view.phase === "UNAVAILABLE")
    return (
      <AccountScreen top={top}>
        <h1 className="pf-acc-title">Scegli il circolo</h1>
        {error && <p className="pf-acc-error">{error}</p>}
        {view && (
          <p>
            Nella tua zona non ci sono ancora circoli che offrono la lezione
            gratuita. La tua R si chiude con le tue risposte.
          </p>
        )}
      </AccountScreen>
    );

  const { phase, clubs, slots, seat } = view;
  const selected = clubId || view.attributedClubId || clubs[0]?.id || "";
  const clubSlots = slots.filter((s) => s.partnerId === selected);
  const clubDays = days(clubSlots);
  const chosenDay = day && clubDays.some(([k]) => k === day) ? day : "";
  const daySlots = clubSlots.filter((s) => dayKey(s.startsAt) === chosenDay);
  const canRequest =
    phase === "ELIGIBLE" || phase === "DECLINED" || phase === "REQUESTED";
  const footer = canRequest ? (
    <PillButton
      tone="lime"
      disabled={busy || !share || !selected}
      onClick={() =>
        void call(
          "/request",
          phase === "REQUESTED"
            ? "Richiesta aggiornata."
            : "Richiesta inviata: il circolo compone il gruppo.",
          {
            partnerId: selected,
            shareWithCoach: share,
            ...(slotId && daySlots.some((s) => s.id === slotId)
              ? { lessonId: slotId }
              : {}),
          },
        )
      }
    >
      {phase === "REQUESTED" ? "Aggiorna la richiesta" : "Richiedi il posto"}
    </PillButton>
  ) : undefined;

  return (
    <AccountScreen top={top} footer={footer}>
      <h1 className="pf-acc-title">Scegli il circolo</h1>
      <p className="pf-acc-lead">
        Il gruppo sarà di 4 persone con un livello simile al tuo.
      </p>
      {message && (
        <p className="pf-acc-error" role="alert">
          {message}
        </p>
      )}
      {done && (
        <section
          className="pf-acc-card"
          role="status"
          tabIndex={-1}
          ref={outcome}
          aria-label="Esito"
        >
          <p>{done}</p>
          <PillLink href={summaryHref("lezione")}>Torna al riepilogo</PillLink>
        </section>
      )}
      {phase === "LOCKED" && (
        <section className="pf-acc-card">
          <p>
            La lezione si sblocca quando il tuo profilo è abbastanza
            attendibile: continua con le domande e i micro-test.
          </p>
          <PillLink href="/journey/calibrazione">
            Continua la calibrazione
          </PillLink>
        </section>
      )}
      {(phase === "REQUESTED" || phase === "ASSIGNED") && seat && (
        <section className="pf-acc-card" role="status">
          <span className="pf-acc-kicker">
            {phase === "ASSIGNED" ? "Posto confermato" : "Richiesta inviata"}
          </span>
          <p>
            {seat.club.name}
            {seat.club.city ? `, ${seat.club.city}` : ""}
            {phase === "ASSIGNED" && seat.lesson
              ? ` · ${when(seat.lesson.startsAt)}, ${seat.lesson.durationMinutes} minuti.`
              : ". Il circolo compone il gruppo e ti avvisiamo appena c’è la data."}
          </p>
          <button
            type="button"
            className="pf-acc-link"
            disabled={busy}
            onClick={() => void call("/withdraw", "Hai rinunciato al posto.")}
          >
            Rinuncia al posto
          </button>
        </section>
      )}
      {canRequest && (
        <>
          <div className="pf-acc-clubs" role="radiogroup" aria-label="Circolo">
            {clubs.map((club) => (
              <button
                type="button"
                role="radio"
                key={club.id}
                aria-checked={club.id === selected}
                className={`pf-acc-club${club.id === selected ? " is-selected" : ""}`}
                onClick={() => {
                  setClubId(club.id);
                  setDay("");
                  setSlotId("");
                }}
              >
                <b>{club.name}</b>
                {clubPlace(club) && <small>{clubPlace(club)}</small>}
              </button>
            ))}
          </div>
          {view.distance?.reason && (
            <p className="pf-acc-muted">
              {NO_DISTANCE[view.distance.reason]}{" "}
              <a className="pf-acc-link" href="/account/indirizzo?da=circolo">
                Completa l’indirizzo nel tuo account
              </a>
            </p>
          )}
          <span className="pf-acc-kicker">Giorno</span>
          {clubDays.length ? (
            <div className="pf-acc-days" role="radiogroup" aria-label="Giorno">
              {clubDays.map(([key, iso]) => (
                <button
                  type="button"
                  role="radio"
                  key={key}
                  aria-checked={key === chosenDay}
                  className={key === chosenDay ? "is-selected" : undefined}
                  onClick={() => {
                    setDay(key);
                    setSlotId("");
                  }}
                >
                  <small>{weekday(iso)}</small>
                  <b>{dayNumber(iso)}</b>
                </button>
              ))}
            </div>
          ) : (
            <p className="pf-acc-muted">
              Il circolo non ha ancora pubblicato le date: richiedi il posto e
              ti proponiamo il primo gruppo adatto a te.
            </p>
          )}
          {chosenDay && (
            <>
              <span className="pf-acc-kicker">Orario</span>
              <div
                className="pf-acc-times"
                role="radiogroup"
                aria-label="Orario"
              >
                {daySlots.map((s) => (
                  <button
                    type="button"
                    role="radio"
                    key={s.id}
                    aria-checked={s.id === slotId}
                    className={s.id === slotId ? "is-selected" : undefined}
                    onClick={() => setSlotId(s.id)}
                  >
                    {time(s.startsAt)}
                  </button>
                ))}
              </div>
            </>
          )}
          <section className="pf-acc-rules">
            <span className="pf-acc-kicker">Regole</span>
            <p>
              Un posto a persona, in un gruppo di 4. Giorno e orario sono la tua
              preferenza: il gruppo lo compone il circolo. Se non ti presenti,
              il posto gratuito si considera usato.
            </p>
            <label>
              <input
                type="checkbox"
                checked={share}
                onChange={(event) => setShare(event.target.checked)}
              />
              Il coach della lezione può vedere nome, livello stimato e aree.
              Non riceve email né telefono.
            </label>
          </section>
          {phase === "ELIGIBLE" && (
            <button
              type="button"
              className="pf-acc-link"
              disabled={busy}
              onClick={() =>
                void call("/decline", "Hai scelto di non fare la lezione.")
              }
            >
              Preferisco non fare la lezione
            </button>
          )}
        </>
      )}
      {phase === "ATTENDED" && (
        <p>
          Lezione fatta: il feedback del coach è entrato nella tua valutazione.
        </p>
      )}
      {phase === "NO_SHOW" && (
        <p>
          Non risulti presente alla lezione: il posto gratuito è stato usato.
        </p>
      )}
      {phase === "CLOSED" && (
        <p>
          La calibrazione è chiusa: la lezione gratuita serviva a completarla.
        </p>
      )}
    </AccountScreen>
  );
}
