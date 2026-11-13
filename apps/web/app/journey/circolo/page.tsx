"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  type FreeLessonView,
  postJson,
  useResource,
} from "../_account/account-data";
import {
  AccountScreen,
  AccountTopBar,
  PillLink,
} from "../_account/account-shell";
import { definedAreas, useAccountJourney } from "../_account/calibration-state";
import { summaryHref } from "../_account/next-step";
import { ClubStep } from "./club-step";
import { clubsFor, type Place } from "./club-location";
import { LessonBooked } from "./lesson-booked";
import { WhenStep, dayKey, days } from "./when-step";
import { WhereStep } from "./where-step";
import "./circolo.css";

type Step = "where" | "club" | "when";
type Journey = ReturnType<typeof useAccountJourney>["journey"];

/** Aree già Reali: la lezione si sblocca solo quando lo sono tutte. */
const lockedReal = (j: Journey) =>
  j ? definedAreas(j.calibration, j.evaluation?.drivers ?? []).size : 0;
const lockedTitle = (j: Journey) => {
  const total = j?.evaluation?.drivers?.length ?? 0;
  if (!total) return "Rendi Reali tutte le aree per sbloccarla.";
  return `Rendi Reali tutte e ${total === 6 ? "sei" : total} le aree per sbloccarla.`;
};
const STEPS: Step[] = ["where", "club", "when"];

/**
 * Lezione gratuita nella veste della demo PF10, su fondo scuro, in tre passi:
 * «Dove sei?» (posizione del telefono o CAP/città), «Dove giochi?» (circoli
 * a carosello) e «Quando?» (giorno e ora). Con la posizione i circoli sono in
 * ordine di distanza, con i km; con CAP o città sono quelli della città.
 * L'indirizzo dell'atleta resta salvato ma qui non serve. Il consenso a
 * mostrare il livello al coach è nell'informativa accettata all'inizio.
 * La lezione resta una richiesta: il gruppo di livello simile lo compone il
 * circolo, e «Ci vediamo in campo» compare quando il posto è confermato.
 */
export default function ClubPage() {
  const { journey: j } = useAccountJourney();
  const {
    data: view,
    error,
    setData,
  } = useResource<FreeLessonView>("/athlete-journey/free-lesson");
  const [step, setStep] = useState<Step>("where");
  const [place, setPlace] = useState<Place | null>(null);
  const [clubId, setClubId] = useState("");
  const [day, setDay] = useState("");
  const [slotId, setSlotId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  // Esito dell'ultima azione senza prenotazione (rinuncia, annullamento).
  const [done, setDone] = useState("");
  const outcome = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (message) alert.current?.focus();
  }, [message]);
  useEffect(() => {
    if (done) outcome.current?.focus();
  }, [done]);

  const go = (next: Step) => {
    setStep(next);
    setMessage("");
    window.requestAnimationFrame(() => heading.current?.focus());
  };

  const call = async (path: string, body: unknown = {}, success = "") => {
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
      setEditing(false);
      setStep(place ? "club" : "where");
      setDone(success);
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Operazione non riuscita.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const index = STEPS.indexOf(step);
  const back = () => go(STEPS[index - 1]!);
  const top = (
    <AccountTopBar title="Lezione gratuita" back="/journey/profilo" />
  );

  if (!view?.enabled || view.phase === "UNAVAILABLE")
    return (
      <AccountScreen top={top} tone="dark">
        <h1 className="pf-lz-title">Lezione gratuita</h1>
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
  const booked = (phase === "REQUESTED" || phase === "ASSIGNED") && !!seat;
  const canRequest =
    (phase === "ELIGIBLE" || phase === "DECLINED" || phase === "REQUESTED") &&
    (!booked || editing);
  const search = place ? clubsFor(clubs, place) : null;
  // Il circolo da cui arriva l'atleta (QR) è il primo proposto, se ha posto.
  const fallbackId =
    search?.clubs.find((c) => c.id === view.attributedClubId && c.available)
      ?.id ??
    search?.clubs[0]?.id ??
    "";
  const selectedId = search?.clubs.some((c) => c.id === clubId)
    ? clubId
    : fallbackId;
  const club = search?.clubs.find((c) => c.id === selectedId);
  const clubSlots = slots.filter((s) => s.partnerId === selectedId);
  const clubDays = days(clubSlots);
  // Un solo giorno o un solo orario: la scelta è già fatta.
  const chosenDay = clubDays.some(([k]) => k === day)
    ? day
    : clubDays.length === 1
      ? clubDays[0]![0]
      : "";
  const daySlots = clubSlots.filter((s) => dayKey(s.startsAt) === chosenDay);
  const chosenSlot =
    daySlots.find((s) => s.id === slotId) ??
    (daySlots.length === 1 ? daySlots[0] : undefined);

  // Rinuncia (demo V11): si torna al profilo, dove il banner permette di
  // cambiare idea finché la calibrazione è aperta.
  const decline =
    phase === "ELIGIBLE"
      ? () =>
          void call("/decline").then(
            (ok) =>
              ok && window.location.assign(summaryHref("lezione-rifiutata")),
          )
      : undefined;

  const book = () =>
    void call("/request", {
      partnerId: selectedId,
      ...(chosenSlot ? { lessonId: chosenSlot.id } : {}),
    });

  const progress = canRequest && (
    <div className="pf-lz-progress" aria-hidden="true">
      {STEPS.map((s, i) => (
        <i
          key={s}
          className={`${i <= index ? "is-done" : ""}${i === index ? " is-now" : ""}`}
        />
      ))}
    </div>
  );

  // Indietro: il passo prima; dalla modifica, la prenotazione; altrimenti il profilo.
  const backAction =
    canRequest && index > 0
      ? back
      : canRequest && editing
        ? () => setEditing(false)
        : null;
  return (
    <AccountScreen
      top={
        <header className="pf-acc-top pf-lz-top">
          {backAction ? (
            <button type="button" aria-label="Indietro" onClick={backAction}>
              ←
            </button>
          ) : (
            <Link href="/journey/profilo" aria-label="Indietro">
              ←
            </Link>
          )}
          {progress || <span>Lezione gratuita</span>}
        </header>
      }
      tone="dark"
    >
      <div className="pf-lz">
        {message && (
          <p className="pf-acc-error" role="alert" tabIndex={-1} ref={alert}>
            {message}
          </p>
        )}
        {done && (
          <section
            className="pf-lz-outcome"
            role="status"
            tabIndex={-1}
            ref={outcome}
            aria-label="Esito"
          >
            <p>{done}</p>
            <Link className="pf-lz-inline" href={summaryHref("lezione")}>
              Torna al riepilogo
            </Link>
          </section>
        )}
        {phase === "LOCKED" && (
          <div className="pf-lz-step">
            <span className="pf-acc-kicker is-lime">Lezione gratuita</span>
            <h1 className="pf-lz-title">Non ancora disponibile.</h1>
            <p className="pf-lz-lead">{lockedTitle(j)}</p>
            {j?.evaluation?.drivers?.length ? (
              <p className="pf-lz-note">
                Aree Reali {lockedReal(j)}/{j.evaluation.drivers.length}
              </p>
            ) : null}
            <PillLink href="/journey/calibrazione" tone="lime">
              Continua la calibrazione
            </PillLink>
          </div>
        )}
        {booked && !editing && (
          <LessonBooked
            phase={phase as "REQUESTED" | "ASSIGNED"}
            seat={seat}
            slots={slots}
            busy={busy}
            homeHref={summaryHref("lezione")}
            onChange={() => {
              setEditing(true);
              setStep(place ? "club" : "where");
            }}
            onWithdraw={() =>
              void call(
                "/withdraw",
                {},
                "Prenotazione annullata. La lezione di prova resta sbloccata.",
              )
            }
          />
        )}
        {canRequest && step === "where" && (
          <WhereStep
            headingRef={heading}
            onPlace={(next) => {
              setPlace(next);
              setClubId("");
              setDay("");
              setSlotId("");
              go("club");
            }}
          />
        )}
        {canRequest && step === "club" && place && search && (
          <ClubStep
            headingRef={heading}
            place={place}
            search={search}
            selectedId={selectedId}
            onSelect={(id) => {
              setClubId(id);
              setDay("");
              setSlotId("");
            }}
            onPick={(id) => {
              if (id !== selectedId) {
                setClubId(id);
                setDay("");
                setSlotId("");
              }
              go("when");
            }}
            onChangePlace={() => go("where")}
            onDecline={decline}
            busy={busy}
          />
        )}
        {canRequest && step === "when" && club && (
          <WhenStep
            headingRef={heading}
            club={club}
            slots={clubSlots}
            day={chosenDay}
            slotId={chosenSlot?.id ?? ""}
            onDay={(key) => {
              setDay(key);
              setSlotId("");
            }}
            onSlot={setSlotId}
            onChangeClub={() => go("club")}
            onBook={book}
            busy={busy}
            booking={
              phase === "REQUESTED"
                ? "Aggiorna la prenotazione"
                : "Prenota il posto"
            }
          />
        )}
        {canRequest && step === "where" && decline && (
          <button
            type="button"
            className="pf-acc-link pf-lz-decline"
            disabled={busy}
            onClick={decline}
          >
            Non voglio fare la lezione di prova
          </button>
        )}
        {phase === "ATTENDED" && (
          <p>
            Lezione fatta: il feedback del coach è entrato nella tua
            valutazione.
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
      </div>
    </AccountScreen>
  );
}
