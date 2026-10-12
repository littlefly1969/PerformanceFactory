"use client";
import { useState } from "react";
import { athleteRequest, useAthlete } from "../user/_components/use-athlete";

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
  { sport: "PADEL", name: "padel", prefix: "padel" },
  { sport: "TENNIS", name: "tennis", prefix: "tennis" },
];

/** La migliore non può essere più bassa dell'attuale: lista fino all'attuale. */
function bestOptions(options: Option[], current: string) {
  const index = options.findIndex((o) => o.value === current);
  return index < 0 ? options : options.slice(0, index + 1);
}

function RankingForm({
  view,
  onSaved,
}: {
  view: FitRankingView;
  onSaved: (next: FitRankingView) => void;
}) {
  const [values, setValues] = useState<Values>(
    view.ranking
      ? { ...view.ranking, cardNumber: view.ranking.cardNumber ?? "" }
      : EMPTY,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    view.recalculationPending
      ? "La tua R non è ancora stata ricalcolata con l'ultima classifica: salva di nuovo per riprovare."
      : "",
  );
  const set = (field: keyof Values, value: string) =>
    setValues((v) => {
      const next = { ...v, [field]: value };
      // Attuale più alta della migliore: la migliore sale con lei.
      for (const { sport, prefix } of SPORTS) {
        const allowed = bestOptions(
          view.options[sport],
          next[`${prefix}Current`],
        );
        if (
          next[`${prefix}Best`] &&
          !allowed.some((o) => o.value === next[`${prefix}Best`])
        )
          next[`${prefix}Best`] = next[`${prefix}Current`];
      }
      return next;
    });
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const next = await athleteRequest<FitRankingView>(
        "/athlete-journey/fit-ranking",
        values,
      );
      onSaved(next);
      setMessage(
        next.recalculationPending
          ? "Classifica salvata, ma non siamo riusciti a ricalcolare la tua R. Salva di nuovo per riprovare."
          : "Classifica salvata. Se è cambiata, la tua R è stata ricalcolata.",
      );
    } catch (e) {
      setMessage(
        (e as Error).message ||
          "Non è stato possibile salvare la classifica. Riprova.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="pf4-availability-form">
      {SPORTS.map(({ sport, name, prefix }) => (
        <fieldset key={sport}>
          <legend>Classifica FIT di {name}</legend>
          <label>
            Attuale
            <select
              required
              value={values[`${prefix}Current`]}
              onChange={(e) => set(`${prefix}Current`, e.target.value)}
            >
              <option value="">Seleziona</option>
              {view.options[sport].map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Migliore di sempre
            <select
              required
              value={values[`${prefix}Best`]}
              onChange={(e) => set(`${prefix}Best`, e.target.value)}
            >
              <option value="">Seleziona</option>
              {bestOptions(view.options[sport], values[`${prefix}Current`]).map(
                (o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ),
              )}
            </select>
          </label>
        </fieldset>
      ))}
      <label>
        Numero di tessera FIT (facoltativo)
        <input
          value={values.cardNumber}
          maxLength={30}
          onChange={(e) => set("cardNumber", e.target.value)}
        />
      </label>
      <button className="pf4-cta" disabled={busy}>
        {busy ? "Salvataggio…" : "Salva classifica →"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

/**
 * Classifica FIT sempre correggibile dall'atleta: una classifica cambiata fa
 * ricalcolare la R.
 */
export function FitRankingEditor({ onSaved }: { onSaved?: () => void }) {
  const { data, error, reload } = useAthlete<FitRankingView>(
    "/athlete-journey/fit-ranking",
  );
  const [view, setView] = useState<FitRankingView>();
  const current = view ?? data;
  return (
    <section className="pf4-athlete-section pf4-fit-ranking">
      <span className="pf4-kicker">La tua classifica FIT</span>
      <h2>Padel e tennis, attuale e migliore di sempre.</h2>
      <p>
        La usiamo in ogni valutazione. Se cambia, aggiornala qui: ricalcoliamo
        la tua R con le risposte che ci hai già dato.
      </p>
      {current && (
        <RankingForm
          view={current}
          onSaved={(next) => {
            setView(next);
            onSaved?.();
          }}
        />
      )}
      {error && <button onClick={reload}>Riprova a caricare</button>}
    </section>
  );
}
