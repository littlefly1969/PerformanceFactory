"use client";
import { useEffect, useRef, useState } from "react";
import { PillButton } from "../_account/account-shell";
import {
  type ClubSearch,
  kmLabel,
  normalize,
  type Place,
  type PlacedClub,
  placeLabel,
} from "./club-location";
import { ClubLogo, ClubPhoto } from "./club-images";
import { PinIcon, SearchIcon } from "./where-step";

/** Etichetta sulla foto: i km con la posizione, la città con CAP o città. */
export const clubBadge = (club: PlacedClub) =>
  club.distanceKm !== null ? kmLabel(club.distanceKm) : (club.city ?? "");

const SCOPE_NOTE = {
  near: null,
  city: null,
  province: (city: string) =>
    `A ${city} non ci sono circoli con la lezione gratuita: ecco quelli della provincia.`,
  all: (city: string) =>
    `A ${city} non ci sono circoli con la lezione gratuita: ecco tutti quelli disponibili.`,
} as const;

export const CLUB_FULL_NOTICE =
  "Questo circolo al momento è al completo: nessun posto per la lezione di prova.";

/** «3 circoli disponibili per la lezione di prova · 2 al completo.» */
export const availabilityLine = (clubs: Array<{ available: boolean }>) => {
  const free = clubs.filter((club) => club.available).length;
  const full = clubs.length - free;
  return `${free} ${free === 1 ? "circolo disponibile" : "circoli disponibili"} per la lezione di prova${full ? ` · ${full} al completo` : ""}.`;
};

/**
 * «Dove giochi?» della demo V11: il luogo scelto in alto, quanti circoli
 * hanno posto, la ricerca per nome e i circoli a carosello con foto,
 * iniziali, distanza (o città) e stato «Disponibile» / «Al completo». Un
 * circolo al completo non si sceglie. In fondo, la rinuncia alla lezione.
 */
export function ClubStep({
  place,
  search,
  selectedId,
  onSelect,
  onPick,
  onChangePlace,
  onDecline,
  busy = false,
  headingRef,
}: {
  place: Place;
  search: ClubSearch;
  selectedId: string;
  onSelect: (id: string) => void;
  onPick: (id: string) => void;
  onChangePlace: () => void;
  /** «Non voglio fare la lezione di prova»; senza, il link non c'è. */
  onDecline?: () => void;
  busy?: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [query, setQuery] = useState("");
  // Avviso del circolo al completo, finché non se ne sceglie un altro.
  const [fullNotice, setFullNotice] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  // Durante lo scorrimento automatico il centro passa su altri circoli.
  const autoScrollUntil = useRef(0);
  const wanted = normalize(query);
  const list = wanted
    ? search.clubs.filter((club) => normalize(club.name).includes(wanted))
    : search.clubs;
  const active = list.find((club) => club.id === selectedId) ?? list[0];
  const activeIndex = active ? list.indexOf(active) : -1;
  const note =
    place.kind === "area" && SCOPE_NOTE[search.scope]
      ? SCOPE_NOTE[search.scope]!(place.area.city)
      : null;

  // Il circolo attivo resta al centro del carosello.
  useEffect(() => {
    const container = track.current;
    const card = container?.children[activeIndex] as HTMLElement | undefined;
    if (!container || !card) return;
    const left =
      card.offsetLeft - (container.clientWidth - card.clientWidth) / 2;
    if (Math.abs(container.scrollLeft - left) <= 4) return;
    autoScrollUntil.current = Date.now() + 700;
    container.scrollTo?.({ left, behavior: "smooth" });
  }, [activeIndex]);

  /** Dopo uno scorrimento a mano diventa attivo il circolo più vicino al centro. */
  const onScroll = () => {
    const container = track.current;
    if (!container || !container.clientWidth) return;
    if (Date.now() < autoScrollUntil.current) return;
    const center = container.scrollLeft + container.clientWidth / 2;
    let nearest = -1;
    let gap = Infinity;
    Array.from(container.children).forEach((child, index) => {
      const card = child as HTMLElement;
      const d = Math.abs(card.offsetLeft + card.clientWidth / 2 - center);
      if (d < gap) [nearest, gap] = [index, d];
    });
    const club = list[nearest];
    if (club && club.id !== active?.id) onSelect(club.id);
  };

  return (
    <div className="pf-lz-step">
      <div className="pf-lz-place">
        <button
          type="button"
          className="pf-lz-place-pill"
          onClick={onChangePlace}
        >
          <PinIcon size={15} />
          <span>{placeLabel(place)}</span>
        </button>
        <button type="button" className="pf-lz-change" onClick={onChangePlace}>
          Cambia
        </button>
      </div>
      <h1 className="pf-lz-title" tabIndex={-1} ref={headingRef}>
        Dove giochi?
      </h1>
      {search.clubs.length > 0 && (
        <p className="pf-lz-lead is-small">{availabilityLine(search.clubs)}</p>
      )}
      {note && <p className="pf-lz-note">{note}</p>}
      {search.clubs.length > 1 && (
        <div className="pf-lz-search is-small">
          <SearchIcon />
          <input
            className="pf-lz-input"
            type="text"
            inputMode="search"
            placeholder="Cerca tra i circoli"
            aria-label="Cerca tra i circoli"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      )}
      {list.length === 0 ? (
        <div className="pf-lz-empty">
          {search.clubs.length
            ? "Nessun circolo con questo nome."
            : "Nessun circolo offre ancora la lezione gratuita."}
        </div>
      ) : (
        <>
          <div
            ref={track}
            className="pf-lz-cards"
            role="radiogroup"
            aria-label="Circolo"
            onScroll={onScroll}
          >
            {list.map((club, index) => {
              const on = club.id === active?.id;
              const state = club.available ? "Disponibile" : "Al completo";
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  key={club.id}
                  className={`pf-lz-card${on ? " is-active" : ""}${club.available ? "" : " is-full"}`}
                  aria-label={`${club.name}${clubBadge(club) ? `, ${clubBadge(club)}` : ""}, ${state}`}
                  onClick={() => {
                    setFullNotice(false);
                    if (!on) return onSelect(club.id);
                    if (club.available) onPick(club.id);
                    else setFullNotice(true);
                  }}
                >
                  <ClubPhoto club={club} eager={index < 3} />
                  {clubBadge(club) && (
                    <span className="pf-lz-card-badge">{clubBadge(club)}</span>
                  )}
                  <span
                    className={`pf-lz-card-state${club.available ? " is-free" : ""}`}
                    aria-hidden="true"
                  >
                    <i />
                    {state}
                  </span>
                  <span className="pf-lz-card-id">
                    <ClubLogo club={club} />
                    <b>{club.name}</b>
                  </span>
                </button>
              );
            })}
          </div>
          {list.length > 1 && (
            <div className="pf-lz-dots" aria-hidden="true">
              {list.map((club) => (
                <span
                  key={club.id}
                  className={club.id === active?.id ? "is-on" : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}
      {fullNotice && active && !active.available && (
        <p className="pf-lz-note" role="status">
          {CLUB_FULL_NOTICE}
        </p>
      )}
      <div className="pf-acc-footer">
        <PillButton
          tone="lime"
          disabled={!active}
          aria-disabled={active && !active.available ? true : undefined}
          onClick={() => {
            if (!active) return;
            if (active.available) onPick(active.id);
            else setFullNotice(true);
          }}
        >
          {active && !active.available ? "Al completo" : "Gioco qui"}
        </PillButton>
        {onDecline && (
          <button
            type="button"
            className="pf-acc-link pf-lz-decline"
            disabled={busy}
            onClick={onDecline}
          >
            Non voglio fare la lezione di prova
          </button>
        )}
      </div>
    </div>
  );
}
