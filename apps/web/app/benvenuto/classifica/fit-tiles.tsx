"use client";
import { useState } from "react";

export type FitOption = { value: string; label: string };
export type FitValues = {
  padelCurrent: string;
  padelBest: string;
  tennisCurrent: string;
  tennisBest: string;
};
/** «Nessuna classifica»: la voce che chiude ogni lista, lato server. */
export const NONE = "NONE";

/** La migliore non può essere più bassa dell'attuale: lista fino all'attuale. */
export function bestOptions(options: FitOption[], current: string) {
  const index = options.findIndex((o) => o.value === current);
  return index < 0 ? options : options.slice(0, index + 1);
}

/** Categoria del tennis: 1ª, 2ª, 3ª, 4ª o nessuna (valori «2.4», «4.NC»…). */
const category = (value: string) => (value === NONE ? "0" : value.charAt(0));

/** Testo grande della scheda: «1ª» per le fasce e le categorie. */
const ordinal = (label: string) => {
  const match = /^(\d)ª/.exec(label);
  return match ? `${match[1]}ª` : null;
};

function Tile({
  big,
  caption,
  label,
  selected,
  open = false,
  disabled,
  onClick,
}: {
  big?: string;
  caption?: string;
  label?: string;
  selected: boolean;
  open?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`pf-fit-tile${big ? " is-big" : ""}${selected ? " is-selected" : ""}${open ? " is-open" : ""}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {big ? (
        <>
          <b>{big}</b>
          {caption && <small>{caption}</small>}
        </>
      ) : (
        label
      )}
    </button>
  );
}

/**
 * Schede della classifica (demo PF10). Padel: quattro fasce, poi «Non
 * agonistica» e «Nessuna classifica». Tennis: categorie 1ª-4ª e, dentro la
 * categoria aperta, le sottocategorie. Le voci arrivano dal server.
 */
export function FitTiles({
  sport,
  title,
  options,
  allowed = options,
  value,
  onChange,
}: {
  sport: "PADEL" | "TENNIS";
  title: string;
  options: FitOption[];
  allowed?: FitOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const ok = (v: string) => allowed.some((o) => o.value === v);
  const pick = (v: string) => onChange(value === v ? "" : v);
  const [openCategory, setOpenCategory] = useState(
    value && value !== NONE ? category(value) : "",
  );
  if (sport === "PADEL") {
    const bands = options.filter((o) => ordinal(o.label));
    const other = options.filter((o) => !ordinal(o.label) && ok(o.value));
    return (
      <fieldset className="pf-fit-group">
        <legend>{title}</legend>
        <div className="pf-fit-grid is-four">
          {bands.map((o) => (
            <Tile
              key={o.value}
              big={ordinal(o.label)!}
              caption="fascia"
              selected={value === o.value}
              disabled={!ok(o.value)}
              onClick={() => pick(o.value)}
            />
          ))}
        </div>
        {other.length > 0 && (
          <div className="pf-fit-grid is-two">
            {other.map((o) => (
              <Tile
                key={o.value}
                label={o.label.replace(/^Fascia non agonistica$/, "Non agonistica")}
                selected={value === o.value}
                disabled={false}
                onClick={() => pick(o.value)}
              />
            ))}
          </div>
        )}
      </fieldset>
    );
  }
  const categories = ["1", "2", "3", "4", "0"].map((c) => {
    const items = options.filter((o) => category(o.value) === c);
    return { c, items, enabled: items.some((o) => ok(o.value)) };
  });
  const open = categories.find(
    (k) => k.c === openCategory && k.items.length > 1,
  );
  return (
    <fieldset className="pf-fit-group">
      <legend>{title}</legend>
      <div className="pf-fit-grid is-five">
        {categories
          .filter((k) => k.items.length > 0)
          .map(({ c, items, enabled }) => (
            <Tile
              key={c}
              big={c === "0" ? "—" : `${c}ª`}
              caption={c === "0" ? "nessuna" : "cat."}
              selected={!!value && category(value) === c}
              open={openCategory === c && items.length > 1}
              disabled={!enabled}
              onClick={() => {
                setOpenCategory(c);
                if (items.length === 1) pick(items[0].value);
              }}
            />
          ))}
      </div>
      {open && (
        <div className="pf-fit-grid is-subs">
          {open.items.map((o) => (
            <Tile
              key={o.value}
              label={o.label}
              selected={value === o.value}
              disabled={!ok(o.value)}
              onClick={() => pick(o.value)}
            />
          ))}
        </div>
      )}
    </fieldset>
  );
}
