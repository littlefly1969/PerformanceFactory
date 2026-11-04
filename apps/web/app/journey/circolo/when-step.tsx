"use client";
import type { LessonSlot } from "../_account/account-data";
import { PillButton } from "../_account/account-shell";
import { clubBadge } from "./club-step";
import type { PlacedClub } from "./club-location";
import { ClubPhoto } from "./club-images";

export const dayKey = (iso: string) => new Date(iso).toDateString();
export const weekday = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { weekday: "short" }).slice(0, 3);
export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

/** «1 ora», «90 minuti». */
export const durationLabel = (minutes: number) =>
  minutes % 60 === 0
    ? `${minutes / 60} ${minutes === 60 ? "ora" : "ore"}`
    : `${minutes} minuti`;

/** Giorni con almeno una lezione in calendario, in ordine. */
export function days(slots: LessonSlot[]) {
  const seen = new Map<string, string>();
  for (const s of slots)
    if (!seen.has(dayKey(s.startsAt))) seen.set(dayKey(s.startsAt), s.startsAt);
  return [...seen.entries()];
}

/** Quattro pallini, il primo è l'atleta: il gruppo è di 4. */
export function GroupMeta({ minutes }: { minutes?: number }) {
  return (
    <div className="pf-lz-group">
      <span className="pf-lz-group-dots" aria-hidden="true">
        <i className="is-me" />
        <i />
        <i />
        <i />
      </span>
      <span>Gruppo di 4{minutes ? ` · ${durationLabel(minutes)}` : ""}</span>
    </div>
  );
}

/**
 * «Quando?» della demo PF10: il circolo scelto in alto, poi i giorni e gli
 * orari in calendario. Con un solo giorno o un solo orario la scelta è già
 * fatta; senza date pubblicate si prenota e il circolo propone il gruppo.
 */
export function WhenStep({
  club,
  slots,
  day,
  slotId,
  onDay,
  onSlot,
  onChangeClub,
  onBook,
  busy,
  booking,
  headingRef,
}: {
  club: PlacedClub;
  slots: LessonSlot[];
  day: string;
  slotId: string;
  onDay: (key: string) => void;
  onSlot: (id: string) => void;
  onChangeClub: () => void;
  onBook: () => void;
  busy: boolean;
  /** Etichetta del pulsante: prima prenotazione o modifica. */
  booking: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const clubDays = days(slots);
  const daySlots = slots.filter((s) => dayKey(s.startsAt) === day);
  const chosen = slots.find((s) => s.id === slotId);
  const minutes = chosen?.durationMinutes ?? slots[0]?.durationMinutes;
  const ready = slots.length === 0 || !!chosen;
  return (
    <div className="pf-lz-step">
      <button type="button" className="pf-lz-chosen" onClick={onChangeClub}>
        <span className="pf-lz-chosen-photo">
          <ClubPhoto club={club} />
        </span>
        <span className="pf-lz-chosen-text">
          <b>{club.name}</b>
          {clubBadge(club) && <small>{clubBadge(club)}</small>}
        </span>
        <span className="pf-lz-change">Cambia</span>
      </button>
      <h1 className="pf-lz-title" tabIndex={-1} ref={headingRef}>
        Quando?
      </h1>
      {clubDays.length ? (
        <>
          <div className="pf-lz-days" role="radiogroup" aria-label="Giorno">
            {clubDays.map(([key, iso]) => (
              <button
                type="button"
                role="radio"
                key={key}
                aria-checked={key === day}
                aria-label={`${weekday(iso)} ${shortDate(iso)}`}
                className={key === day ? "is-on" : undefined}
                onClick={() => onDay(key)}
              >
                <small>{weekday(iso)}</small>
                <b>{new Date(iso).getDate()}</b>
              </button>
            ))}
          </div>
          {day && (
            <div className="pf-lz-times" role="radiogroup" aria-label="Orario">
              {daySlots.map((s) => (
                <button
                  type="button"
                  role="radio"
                  key={s.id}
                  aria-checked={s.id === slotId}
                  className={s.id === slotId ? "is-on" : undefined}
                  onClick={() => onSlot(s.id)}
                >
                  {time(s.startsAt)}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="pf-lz-note">
          Il circolo non ha ancora pubblicato le date: prenota il posto e ti
          proponiamo il primo gruppo adatto a te.
        </p>
      )}
      <GroupMeta minutes={minutes} />
      <p className="pf-lz-fine">
        Un posto a persona, con atleti di livello simile. Se non ti presenti il
        posto gratuito si considera usato.
      </p>
      <div className="pf-acc-footer">
        <PillButton tone="lime" disabled={busy || !ready} onClick={onBook}>
          {booking}
        </PillButton>
      </div>
    </div>
  );
}
