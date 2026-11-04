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

/**
 * «Dove giochi?» della demo PF10: il luogo scelto in alto, la ricerca per
 * nome e i circoli a carosello con foto, logo e distanza (o città).
 */
export function ClubStep({
  place,
  search,
  selectedId,
  onSelect,
  onPick,
  onChangePlace,
  headingRef,
}: {
  place: Place;
  search: ClubSearch;
  selectedId: string;
  onSelect: (id: string) => void;
  onPick: (id: string) => void;
  onChangePlace: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [query, setQuery] = useState("");
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
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  key={club.id}
                  className={`pf-lz-card${on ? " is-active" : ""}`}
                  aria-label={`${club.name}${clubBadge(club) ? `, ${clubBadge(club)}` : ""}`}
                  onClick={() => (on ? onPick(club.id) : onSelect(club.id))}
                >
                  <ClubPhoto club={club} eager={index < 3} />
                  {clubBadge(club) && (
                    <span className="pf-lz-card-badge">{clubBadge(club)}</span>
                  )}
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
      <div className="pf-acc-footer">
        <PillButton
          tone="lime"
          disabled={!active}
          onClick={() => active && onPick(active.id)}
        >
          Gioco qui
        </PillButton>
      </div>
    </div>
  );
}
