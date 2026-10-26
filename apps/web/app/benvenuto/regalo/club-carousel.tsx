"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/app/lib/api";

export type GiftClub = {
  id: string;
  name: string;
  city: string | null;
  /** Percorsi relativi alla base dell'API, versionati dal back office. */
  logoUrl: string | null;
  photoUrl: string | null;
};

/** Pausa tra un circolo e il successivo, e dopo un tocco dell'atleta. */
export const CAROUSEL_STEP_MS = 3500;
const RESUME_AFTER_TOUCH_MS = 8000;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Circoli affiliati che girano da soli, con il vicino visibile ai lati.
 * Lo scorrimento a mano resta libero (scroll-snap); un tocco ferma
 * l'avanzamento automatico per qualche secondo.
 */
export function ClubCarousel({ clubs }: { clubs: GiftClub[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActiveState] = useState(0);
  const activeRef = useRef(0);
  const pausedUntil = useRef(0);

  const setActive = useCallback((index: number) => {
    activeRef.current = index;
    setActiveState(index);
  }, []);

  const show = useCallback(
    (index: number) => {
      const container = track.current;
      const card = container?.children[index] as HTMLElement | undefined;
      if (!container || !card) return;
      container.scrollTo?.({
        left: card.offsetLeft - (container.clientWidth - card.clientWidth) / 2,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      setActive(index);
    },
    [setActive],
  );

  useEffect(() => {
    if (clubs.length < 2 || prefersReducedMotion()) return;
    const timer = window.setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      show((activeRef.current + 1) % clubs.length);
    }, CAROUSEL_STEP_MS);
    return () => window.clearInterval(timer);
  }, [clubs.length, show]);

  const onScroll = () => {
    const container = track.current;
    if (!container) return;
    const center = container.scrollLeft + container.clientWidth / 2;
    let nearest = 0;
    let distance = Infinity;
    Array.from(container.children).forEach((child, index) => {
      const card = child as HTMLElement;
      const gap = Math.abs(card.offsetLeft + card.clientWidth / 2 - center);
      if (gap < distance) [nearest, distance] = [index, gap];
    });
    setActive(nearest);
  };

  const pause = () => {
    pausedUntil.current = Date.now() + RESUME_AFTER_TOUCH_MS;
  };

  return (
    <div
      className="pf-gift-carousel"
      role="region"
      aria-roledescription="carosello"
      aria-label="Circoli affiliati"
    >
      <div
        ref={track}
        className="pf-gift-track"
        onScroll={onScroll}
        onPointerDown={pause}
        onFocus={pause}
      >
        {clubs.map((club, index) => (
          <article
            key={club.id}
            className={`pf-gift-club${index === active ? " is-active" : ""}`}
            role="group"
            aria-roledescription="circolo"
            aria-label={`${index + 1} di ${clubs.length}: ${club.name}`}
            aria-current={index === active || undefined}
          >
            {club.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- immagine dall'API, già ridimensionata
              <img
                className="pf-gift-photo"
                src={`${API_BASE}${club.photoUrl}`}
                alt=""
                loading={index < 3 ? "eager" : "lazy"}
              />
            ) : (
              <span className="pf-gift-photo pf-gift-photo-empty" />
            )}
            <div className="pf-gift-club-id">
              {club.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- immagine dall'API, già ridimensionata
                <img
                  className="pf-gift-logo"
                  src={`${API_BASE}${club.logoUrl}`}
                  alt={`Logo ${club.name}`}
                />
              ) : (
                <span className="pf-gift-logo pf-gift-logo-empty" aria-hidden>
                  {initials(club.name)}
                </span>
              )}
              <div>
                <strong>{club.name}</strong>
                {club.city && <span>{club.city}</span>}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
