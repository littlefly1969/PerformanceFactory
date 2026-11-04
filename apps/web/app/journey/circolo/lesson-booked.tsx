"use client";
import { useState } from "react";
import type { LessonSlot } from "../_account/account-data";
import { PillButton, PillLink } from "../_account/account-shell";
import { ClubLogo, ClubPhoto } from "./club-images";
import { GroupMeta, shortDate, time, weekday } from "./when-step";

export type BookedSeat = {
  status: string;
  club: {
    id?: string;
    name: string;
    city: string | null;
    logoUrl?: string | null;
    photoUrl?: string | null;
  };
  preferredLessonId: string | null;
  lesson: { startsAt: string; durationMinutes: number } | null;
};

const icsDate = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** Evento .ics della lezione confermata, da aggiungere al calendario. */
export function calendarFile(
  club: { name: string; city: string | null },
  lesson: { startsAt: string; durationMinutes: number },
) {
  const start = new Date(lesson.startsAt);
  const end = new Date(start.getTime() + lesson.durationMinutes * 60_000);
  const text = (value: string) => value.replace(/([,;\\])/g, "\\$1");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Performance Factory//Lezione gratuita//IT",
    "BEGIN:VEVENT",
    `UID:lezione-${start.getTime()}@performancefactory`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${text(`Lezione gratuita · ${club.name}`)}`,
    ...(club.city ? [`LOCATION:${text(`${club.name}, ${club.city}`)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function addToCalendar(
  club: BookedSeat["club"],
  lesson: NonNullable<BookedSeat["lesson"]>,
) {
  const url = URL.createObjectURL(
    new Blob([calendarFile(club, lesson)], { type: "text/calendar" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "lezione-gratuita.ics";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Esito della prenotazione nella veste della demo PF10 (S13): «Ci vediamo in
 * campo.» con il biglietto del circolo quando il posto è confermato;
 * «Richiesta inviata.» con giorno e ora scelti finché il circolo compone il
 * gruppo. Dal riquadro in basso si cambia circolo o orario (solo prima della
 * conferma) o si annulla.
 */
export function LessonBooked({
  phase,
  seat,
  slots,
  busy,
  homeHref,
  onChange,
  onWithdraw,
}: {
  phase: "REQUESTED" | "ASSIGNED";
  seat: BookedSeat;
  slots: LessonSlot[];
  busy: boolean;
  homeHref: string;
  onChange: () => void;
  onWithdraw: () => void;
}) {
  const [sheet, setSheet] = useState<"" | "menu" | "cancel">("");
  const confirmed = phase === "ASSIGNED" && !!seat.lesson;
  const preferred = slots.find((s) => s.id === seat.preferredLessonId);
  const when = confirmed ? seat.lesson : (preferred ?? null);
  const club = {
    name: seat.club.name,
    logoUrl: seat.club.logoUrl ?? null,
    photoUrl: seat.club.photoUrl ?? null,
  };
  return (
    <section className="pf-lz-step pf-lz-ok" aria-labelledby="pf-lz-ok-title">
      <span
        className={`pf-lz-ok-mark${confirmed ? "" : " is-waiting"}`}
        aria-hidden="true"
      >
        {confirmed ? (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 12.5 L9.5 18 L20 6.5"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M12 7v5l3 2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </span>
      <h1 id="pf-lz-ok-title" className="pf-lz-title">
        {confirmed ? "Ci vediamo in campo." : "Richiesta inviata."}
      </h1>
      <div className="pf-lz-ticket">
        <div className="pf-lz-ticket-photo">
          <ClubPhoto club={club} />
          <span className="pf-lz-ticket-id">
            <ClubLogo club={club} />
            <b>{seat.club.name}</b>
          </span>
        </div>
        {when ? (
          <dl>
            <div>
              <dt>{weekday(when.startsAt)}</dt>
              <dd>{shortDate(when.startsAt)}</dd>
            </div>
            <div>
              <dt>Ore</dt>
              <dd className="is-lime">{time(when.startsAt)}</dd>
            </div>
          </dl>
        ) : (
          <p className="pf-lz-ticket-wait">
            Il circolo compone il gruppo e ti avvisiamo appena c’è la data.
          </p>
        )}
      </div>
      <GroupMeta minutes={when?.durationMinutes} />
      <div className="pf-lz-edit">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M12 7v5l3 2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span>
          {confirmed
            ? "Il circolo ha confermato il tuo posto. Se non puoi più venire, annulla per liberarlo."
            : when
              ? "Giorno e ora sono la tua scelta: il circolo conferma il gruppo e ti avvisiamo."
              : "Puoi cambiare circolo o orario finché il circolo non conferma."}
        </span>
        <button
          type="button"
          className="pf-lz-edit-open"
          disabled={busy}
          onClick={() => setSheet("menu")}
        >
          Modifica
        </button>
      </div>
      <div className="pf-acc-footer">
        <PillLink href={homeHref} tone="lime">
          Torna alla Home
        </PillLink>
        {confirmed && seat.lesson && (
          <PillButton
            tone="outline"
            arrow={false}
            onClick={() => addToCalendar(seat.club, seat.lesson!)}
          >
            Aggiungi al calendario
          </PillButton>
        )}
      </div>
      {sheet && (
        <>
          <div className="pf-lz-scrim" onClick={() => setSheet("")} />
          <div
            className="pf-lz-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pf-lz-sheet-title"
          >
            <span className="pf-lz-sheet-handle" aria-hidden="true" />
            {sheet === "menu" ? (
              <>
                <h2 id="pf-lz-sheet-title">Hai cambiato idea?</h2>
                <p>
                  {confirmed
                    ? "Puoi annullare fino all’inizio della lezione."
                    : "Puoi cambiare o annullare finché il circolo non conferma il gruppo."}
                </p>
                {!confirmed && (
                  <button
                    type="button"
                    className="pf-lz-sheet-row"
                    onClick={() => {
                      setSheet("");
                      onChange();
                    }}
                  >
                    <i className="is-lime" aria-hidden="true">
                      ⇄
                    </i>
                    <span>
                      <b>Cambia circolo o orario</b>
                      <small>
                        La richiesta attuale resta finché non confermi la nuova.
                      </small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                )}
                <button
                  type="button"
                  className="pf-lz-sheet-row"
                  onClick={() => setSheet("cancel")}
                >
                  <i className="is-danger" aria-hidden="true">
                    ×
                  </i>
                  <span>
                    <b>Annulla la prenotazione</b>
                    <small>La lezione di prova resta sbloccata.</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="pf-lz-sheet-close"
                  onClick={() => setSheet("")}
                >
                  Chiudi
                </button>
              </>
            ) : (
              <>
                <h2 id="pf-lz-sheet-title">
                  {when
                    ? `Annulli la lezione di ${weekday(when.startsAt).toLowerCase()} ${shortDate(when.startsAt)} alle ${time(when.startsAt)}?`
                    : "Annulli la richiesta?"}
                </h2>
                <p>
                  Il posto torna libero per gli altri. Puoi prenotare di nuovo
                  quando vuoi.
                </p>
                <button
                  type="button"
                  className="pf-lz-sheet-danger"
                  disabled={busy}
                  onClick={() => {
                    setSheet("");
                    onWithdraw();
                  }}
                >
                  Sì, annulla
                </button>
                <PillButton
                  tone="lime"
                  arrow={false}
                  onClick={() => setSheet("")}
                >
                  No, la tengo
                </PillButton>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
