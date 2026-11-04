"use client";
import { useEffect, useRef, useState } from "react";
import { postJson } from "../_account/account-data";
import { PillButton } from "../_account/account-shell";
import type { Area, Place } from "./club-location";

/** Suggerimento per CAP o città: già risolto, o da risolvere con Google. */
export type AreaSuggestion = {
  placeId: string | null;
  main: string;
  secondary: string | null;
  area: Area | null;
};

const SUGGEST_DELAY_MS = 300;
const AREA_PATH = "/athlete-journey/free-lesson/area";

/** Token della sessione di ricerca: uno per ricerca, chiuso dalla scelta. */
const newSessionToken = () =>
  globalThis.crypto?.randomUUID?.().replace(/-/g, "") ??
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;

type GeoState = "idle" | "asking" | "denied" | "unavailable";

/**
 * «Dove sei?» della demo PF10: la posizione del telefono, in giallo, per i
 * circoli vicini con i km; oppure CAP o città, per i circoli di quella città.
 * La posizione resta nel browser: al server non arriva.
 */
export function WhereStep({
  onPlace,
  headingRef,
}: {
  onPlace: (place: Place) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AreaSuggestion[]>([]);
  const [searched, setSearched] = useState("");
  const [geo, setGeo] = useState<GeoState>("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const session = useRef(newSessionToken());
  const typed = query.trim();

  useEffect(() => {
    if (typed.length < 2) {
      setSuggestions([]);
      setSearched("");
      return;
    }
    let alive = true;
    const timer = window.setTimeout(async () => {
      try {
        const { suggestions: rows } = await postJson<{
          suggestions: AreaSuggestion[];
        }>(`${AREA_PATH}/suggestions`, {
          input: typed,
          sessionToken: session.current,
        });
        if (alive) {
          setSuggestions(rows ?? []);
          setSearched(typed);
        }
      } catch {
        if (alive) {
          setSuggestions([]);
          setSearched(typed);
        }
      }
    }, SUGGEST_DELAY_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [typed]);

  const chooseArea = (area: Area) => {
    session.current = newSessionToken();
    onPlace({ kind: "area", area });
  };

  const pick = async (suggestion: AreaSuggestion) => {
    setMessage("");
    if (suggestion.area) return chooseArea(suggestion.area);
    if (!suggestion.placeId) return;
    setBusy(true);
    try {
      const { area } = await postJson<{ area: Area | null }>(
        `${AREA_PATH}/resolve`,
        { placeId: suggestion.placeId, sessionToken: session.current },
      );
      if (area) chooseArea(area);
      else
        setMessage("Non troviamo questa zona: prova con un altro CAP o città.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ricerca non riuscita.");
    } finally {
      setBusy(false);
    }
  };

  /** «Cerca i circoli» senza scegliere: il primo suggerimento, o la città scritta. */
  const search = () => {
    if (!typed) return;
    const [first] = searched === typed ? suggestions : [];
    if (first) return void pick(first);
    if (/^\d+$/.test(typed))
      return setMessage(
        "Non troviamo questo CAP: controllalo o scrivi la città.",
      );
    chooseArea({ city: typed, postalCode: null, province: null });
  };

  const askPosition = () => {
    setMessage("");
    if (!navigator.geolocation) return setGeo("unavailable");
    setGeo("asking");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setGeo("idle");
        onPlace({
          kind: "position",
          coords: { latitude: coords.latitude, longitude: coords.longitude },
        });
      },
      (error) =>
        setGeo(
          error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
        ),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  return (
    <div className="pf-lz-step">
      <span className="pf-acc-kicker is-lime">Lezione gratuita</span>
      <h1 className="pf-lz-title" tabIndex={-1} ref={headingRef}>
        Dove sei?
      </h1>
      <button
        type="button"
        className="pf-lz-geo"
        onClick={askPosition}
        disabled={geo === "asking"}
      >
        <span className="pf-lz-geo-icon" aria-hidden="true">
          <PinIcon />
        </span>
        <span className="pf-lz-geo-text">
          <b>
            {geo === "asking"
              ? "Cerco la tua posizione…"
              : "Usa la mia posizione"}
          </b>
          <small>Solo per trovare i circoli vicini.</small>
        </span>
        <span aria-hidden="true">→</span>
      </button>
      <div className="pf-lz-or" aria-hidden="true">
        <span>oppure</span>
      </div>
      <form
        className="pf-lz-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <SearchIcon />
        <input
          className="pf-lz-input"
          type="text"
          inputMode="search"
          autoComplete="postal-code"
          placeholder="CAP o città"
          aria-label="CAP o città"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setMessage("");
          }}
        />
      </form>
      {typed.length >= 2 && searched === typed && suggestions.length > 0 && (
        <ul className="pf-lz-sugg" aria-label="Zone trovate">
          {suggestions.map((s, index) => (
            <li key={`${s.placeId ?? s.main}-${index}`}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void pick(s)}
              >
                <b>{s.main}</b>
                {s.secondary && <span>{s.secondary}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {(geo === "denied" || geo === "unavailable") && (
        <p className="pf-lz-note" role="status">
          {geo === "denied"
            ? "Posizione non consentita: scrivi CAP o città."
            : "Posizione non disponibile: scrivi CAP o città."}
        </p>
      )}
      {message && (
        <p className="pf-lz-note" role="alert">
          {message}
        </p>
      )}
      <div className="pf-acc-footer">
        <PillButton tone="lime" disabled={!typed || busy} onClick={search}>
          Cerca i circoli
        </PillButton>
      </div>
    </div>
  );
}

export function PinIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg
      className="pf-lz-search-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
