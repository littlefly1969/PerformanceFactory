"use client";
import { useState } from "react";
import { athleteRequest, useAthlete } from "../user/_components/use-athlete";
import "./fit-ranking.css";

type Sport = "PADEL" | "TENNIS";
type Option = { value: string; label: string };
type Values = {
  padelCurrent: string;
  padelBest: string;
  tennisCurrent: string;
  tennisBest: string;
  cardNumber: string;
};
export type FitRankingView = {
  ranking: (Omit<Values, "cardNumber"> & { cardNumber: string | null }) | null;
  options: Record<Sport, Option[]>;
  recalculationPending: boolean;
};

const EMPTY: Values = {
  padelCurrent: "",
  padelBest: "",
  tennisCurrent: "",
  tennisBest: "",
  cardNumber: "",
};
const SPORTS: { sport: Sport; name: string; prefix: "padel" | "tennis" }[] = [
  { sport: "PADEL", name: "Padel", prefix: "padel" },
  { sport: "TENNIS", name: "Tennis", prefix: "tennis" },
];
/** Nessuna classifica: la voce che chiude ogni lista, lato server. */
const NONE = "NONE";

/** La migliore non può essere più bassa dell'attuale: lista fino all'attuale. */
function bestOptions(options: Option[], current: string) {
  const index = options.findIndex((o) => o.value === current);
  return index < 0 ? options : options.slice(0, index + 1);
}

const labelOf = (options: Option[], value: string) =>
  options.find((o) => o.value === value)?.label ?? "—";

/** Riga di sintesi: una classifica per sport, senza aprire il modulo. */
function Summary({ view }: { view: FitRankingView }) {
  if (!view.ranking) return <p>Non l’hai ancora indicata.</p>;
  return (
    <dl className="pf-fit-summary">
      {SPORTS.map(({ sport, name, prefix }) => (
        <div key={sport}>
          <dt>{name}</dt>
          <dd>
            {labelOf(view.options[sport], view.ranking![`${prefix}Current`])}
            <span>
              best{" "}
              {labelOf(view.options[sport], view.ranking![`${prefix}Best`])}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RankingForm({
  view,
  onSaved,
  onClose,
}: {
  view: FitRankingView;
  onSaved: (next: FitRankingView) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Values>(
    view.ranking
      ? { ...view.ranking, cardNumber: view.ranking.cardNumber ?? "" }
      : EMPTY,
  );
  const [card, setCard] = useState(!!view.ranking?.cardNumber);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    view.recalculationPending
      ? "La tua R non è ancora stata ricalcolata con l'ultima classifica: salva di nuovo per riprovare."
      : "",
  );
  const set = (next: Partial<Values>) =>
    setValues((v) => {
      const merged = { ...v, ...next };
      // Attuale più alta della migliore: la migliore sale con lei.
      for (const { sport, prefix } of SPORTS) {
        const allowed = bestOptions(
          view.options[sport],
          merged[`${prefix}Current`],
        );
        if (
          merged[`${prefix}Best`] &&
          !allowed.some((o) => o.value === merged[`${prefix}Best`])
        )
          merged[`${prefix}Best`] = merged[`${prefix}Current`];
      }
      return merged;
    });
  async function save(next: Values) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const saved = await athleteRequest<FitRankingView>(
        "/athlete-journey/fit-ranking",
        next,
      );
      onSaved(saved);
      setMessage(
        saved.recalculationPending
          ? "Classifica salvata, ma non siamo riusciti a ricalcolare la tua R. Salva di nuovo per riprovare."
          : "",
      );
      if (!saved.recalculationPending) onClose();
    } catch (e) {
      setMessage(
        (e as Error).message ||
          "Non è stato possibile salvare la classifica. Riprova.",
      );
    } finally {
      setBusy(false);
    }
  }
  const complete = SPORTS.every(
    ({ prefix }) => values[`${prefix}Current`] && values[`${prefix}Best`],
  );
  return (
    <form
      className="pf-fit-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save(values);
      }}
    >
      {SPORTS.map(({ sport, name, prefix }) => (
        <div className="pf-fit-row" key={sport}>
          <span>{name}</span>
          <label>
            <small>Attuale</small>
            <select
              required
              value={values[`${prefix}Current`]}
              onChange={(e) =>
                set({ [`${prefix}Current`]: e.target.value } as Partial<Values>)
              }
            >
              <option value="">—</option>
              {view.options[sport].map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <small>Migliore</small>
            <select
              required
              value={values[`${prefix}Best`]}
              onChange={(e) =>
                set({ [`${prefix}Best`]: e.target.value } as Partial<Values>)
              }
            >
              <option value="">—</option>
              {bestOptions(view.options[sport], values[`${prefix}Current`]).map(
                (o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
      ))}
      {card ? (
        <label className="pf-fit-card">
          <small>Numero di tessera FIT (facoltativo)</small>
          <input
            value={values.cardNumber}
            maxLength={30}
            autoComplete="off"
            onChange={(e) => set({ cardNumber: e.target.value })}
          />
        </label>
      ) : (
        <button
          type="button"
          className="pf-fit-link"
          onClick={() => setCard(true)}
        >
          Aggiungi il numero di tessera
        </button>
      )}
      <div className="pf-fit-actions">
        <button className="pf-fit-save" disabled={busy || !complete}>
          {busy ? "Salvataggio…" : "Salva"}
        </button>
        <button
          type="button"
          className="pf-fit-link"
          disabled={busy}
          onClick={() =>
            void save({
              ...EMPTY,
              padelCurrent: NONE,
              padelBest: NONE,
              tennisCurrent: NONE,
              tennisBest: NONE,
              cardNumber: values.cardNumber,
            })
          }
        >
          Non ho classifiche
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

/**
 * Classifica FIT: dato di configurazione del profilo, non una domanda del
 * percorso. Si vede in una riga e si corregge quando serve; se cambia dopo la
 * valutazione, la R viene ricalcolata.
 */
export function FitRankingEditor({
  onSaved,
  tone = "light",
}: {
  onSaved?: () => void;
  tone?: "light" | "dark";
}) {
  const { data, error, reload } = useAthlete<FitRankingView>(
    "/athlete-journey/fit-ranking",
  );
  const [view, setView] = useState<FitRankingView>();
  const current = view ?? data;
  const [open, setOpen] = useState(false);
  return (
    <section className={`pf-fit pf-fit-${tone}`}>
      <div className="pf-fit-head">
        <div>
          <span className="pf-fit-kicker">Classifica FIT</span>
          {current && <Summary view={current} />}
        </div>
        {current && (
          <button
            type="button"
            className="pf-fit-link"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Chiudi" : current.ranking ? "Modifica" : "Aggiungi"}
          </button>
        )}
      </div>
      {current?.recalculationPending && !open && (
        <p role="status">
          La tua R non è ancora stata ricalcolata con l’ultima classifica.
        </p>
      )}
      {current && open && (
        <RankingForm
          view={current}
          onClose={() => setOpen(false)}
          onSaved={(next) => {
            setView(next);
            onSaved?.();
          }}
        />
      )}
      {error && (
        <button type="button" className="pf-fit-link" onClick={reload}>
          Riprova a caricare
        </button>
      )}
    </section>
  );
}
