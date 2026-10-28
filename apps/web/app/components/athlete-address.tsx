"use client";
import { useEffect, useId, useRef, useState } from "react";
import { athleteRequest, useAthlete } from "../user/_components/use-athlete";
import "./athlete-address.css";
type Address = {
  street: string;
  postalCode: string;
  city: string;
  province: string;
};
export type AddressView = {
  address: Address | null;
  located: boolean;
  /** Scelto fra i suggerimenti e riconosciuto dal backend. */
  verified?: boolean;
  /** Ricerca assistita attiva: senza, l'indirizzo si scrive a mano. */
  assisted?: boolean;
};
type Suggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string | null;
};
type Part =
  | "COUNTRY"
  | "STREET"
  | "STREET_NUMBER"
  | "POSTAL_CODE"
  | "CITY"
  | "PROVINCE"
  | "LOCATION";
type Resolution =
  | {
      complete: true;
      address: Address;
      formattedAddress: string | null;
      selection: string;
    }
  | { complete: false; missing: Part[]; formattedAddress: string | null };
const empty: Address = {
  street: "",
  postalCode: "",
  city: "",
  province: "",
};
const FIELDS = [
  ["street", "Via e numero civico"],
  ["postalCode", "CAP"],
  ["city", "Città"],
  ["province", "Provincia (sigla, es. AQ)"],
] as const;
const MISSING: Record<Part, string> = {
  COUNTRY: "un indirizzo in Italia",
  STREET: "la via",
  STREET_NUMBER: "il numero civico",
  POSTAL_CODE: "il CAP",
  CITY: "il comune",
  PROVINCE: "la provincia",
  LOCATION: "la posizione",
};
const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;
const SAVED = "Indirizzo salvato. Ora vedi quanto dista ogni circolo.";

/** Un token per ogni ricerca: lo condividono suggerimenti e scelta. */
const newSessionToken = () => crypto.randomUUID().replace(/-/g, "");

const oneLine = (a: Address) =>
  `${a.street}, ${a.postalCode} ${a.city} (${a.province})`;

/**
 * Ricerca assistita: l'atleta scrive, sceglie un suggerimento e salva solo
 * un indirizzo completo riconosciuto dal backend. Cambiare il testo dopo la
 * scelta la annulla. Se il servizio non risponde l'indirizzo salvato resta
 * com'è e la bozza resta nel campo, pronta per un nuovo tentativo.
 */
function AddressSearch({ onSaved }: { onSaved: (view: AddressView) => void }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<Extract<
    Resolution,
    { complete: true }
  > | null>(null);
  const [problem, setProblem] = useState("");
  const [failed, setFailed] = useState<null | (() => void)>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const token = useRef(newSessionToken());
  const latest = useRef(0);
  /** Testo messo nel campo dalla scelta: non è una nuova ricerca. */
  const picked = useRef<string | null>(null);
  const list = useId();
  const optionId = (i: number) => `${list}-${i}`;

  async function search(text: string) {
    const request = ++latest.current;
    setLoading(true);
    setFailed(null);
    setProblem("");
    try {
      const data = await athleteRequest<{ suggestions: Suggestion[] }>(
        "/athlete/address/suggestions",
        { input: text, sessionToken: token.current },
      );
      // Una risposta arrivata dopo una ricerca più recente non vale più.
      if (request !== latest.current) return;
      setSuggestions(data.suggestions);
      setOpen(true);
      setActive(-1);
    } catch (error) {
      if (request !== latest.current) return;
      setSuggestions([]);
      setOpen(false);
      setProblem(unavailable(error));
      setFailed(() => () => void search(text));
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }

  useEffect(() => {
    const text = query.trim();
    if (chosen || query === picked.current) return;
    if (text.length < MIN_CHARS) {
      latest.current++;
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => void search(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `search` legge solo ref e setter: la ricerca dipende dal testo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, chosen]);

  async function choose(suggestion: Suggestion) {
    const request = ++latest.current;
    setOpen(false);
    picked.current = suggestion.text;
    setQuery(suggestion.text);
    setLoading(true);
    setFailed(null);
    setProblem("");
    try {
      const result = await athleteRequest<Resolution>(
        "/athlete/address/resolve",
        { placeId: suggestion.placeId, sessionToken: token.current },
      );
      if (request !== latest.current) return;
      // La sessione di ricerca si chiude con la scelta: la prossima è nuova.
      token.current = newSessionToken();
      if (result.complete) setChosen(result);
      else
        setProblem(
          `Questo risultato non è un indirizzo completo: manca ${result.missing
            .map((part) => MISSING[part])
            .join(", ")}. Scrivi via e numero civico e scegli di nuovo.`,
        );
    } catch (error) {
      if (request !== latest.current) return;
      setProblem(unavailable(error));
      setFailed(() => () => void choose(suggestion));
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }

  async function save() {
    if (!chosen || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const saved = await athleteRequest<AddressView>(
        "/athlete/address/selection",
        { selection: chosen.selection },
      );
      onSaved(saved);
      setChosen(null);
      picked.current = null;
      setQuery("");
      setMessage(SAVED);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Non è stato possibile salvare. Riprova.",
      );
    } finally {
      setSaving(false);
    }
  }

  function keyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !suggestions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      void choose(suggestions[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const expanded = open && suggestions.length > 0;
  return (
    <form
      className="pf-address-search"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label>
        Cerca il tuo indirizzo
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={list}
          aria-activedescendant={
            expanded && active >= 0 ? optionId(active) : undefined
          }
          autoComplete="off"
          placeholder="Via e numero civico, città"
          value={query}
          onChange={(event) => {
            // Ogni risposta ancora in volo (ricerca o scelta) non vale più.
            latest.current++;
            picked.current = null;
            setLoading(false);
            setFailed(null);
            setQuery(event.target.value);
            // Il testo cambiato annulla la scelta: va riconosciuto di nuovo.
            setChosen(null);
            setMessage("");
          }}
          onKeyDown={keyDown}
        />
      </label>
      {expanded && (
        <div className="pf-address-results">
          <ul id={list} role="listbox" aria-label="Indirizzi suggeriti">
            {suggestions.map((s, i) => (
              <li
                key={s.placeId}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className={i === active ? "is-active" : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void choose(s)}
              >
                <b>{s.mainText}</b>
                {s.secondaryText && <small>{s.secondaryText}</small>}
              </li>
            ))}
          </ul>
          <p className="pf-address-attribution">
            Suggerimenti da <span translate="no">Google Maps</span>
          </p>
        </div>
      )}
      {open && !loading && !suggestions.length && !problem && (
        <p role="status">
          Nessun indirizzo trovato: controlla via, numero civico e città.
        </p>
      )}
      {loading && <p role="status">Cerchiamo…</p>}
      {problem && (
        <p role="alert" className="pf-address-problem">
          {problem}{" "}
          {failed && (
            <button type="button" className="pf-acc-link" onClick={failed}>
              Riprova
            </button>
          )}
        </p>
      )}
      {chosen && (
        <div className="pf-address-chosen" role="status">
          <span className="pf4-kicker">Indirizzo riconosciuto</span>
          <strong>{oneLine(chosen.address)}</strong>
          <p className="pf-address-attribution">
            Dati da <span translate="no">Google Maps</span>
          </p>
        </div>
      )}
      <button className="pf4-cta" disabled={!chosen || saving}>
        {saving ? "Salvataggio…" : "Salva indirizzo →"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

const unavailable = (error: unknown) =>
  `${
    error instanceof Error
      ? error.message
      : "Il servizio indirizzi non risponde."
  } Il tuo indirizzo salvato resta com’è.`;

/** Indirizzo scritto a mano: resta finché la ricerca assistita non è attiva. */
function AddressForm({
  initial,
  onSaved,
}: {
  initial: AddressView;
  onSaved: (view: AddressView) => void;
}) {
  const [form, setForm] = useState<Address>(initial.address ?? empty);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const saved = await athleteRequest<AddressView>("/athlete/address", form);
      onSaved(saved);
      setMessage(
        saved.located
          ? SAVED
          : "Indirizzo salvato, ma non lo abbiamo riconosciuto: la distanza dai circoli resta non calcolabile. Controlla via, CAP e città.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Non è stato possibile salvare. Riprova.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="pf4-availability-form">
      {FIELDS.map(([field, label]) => (
        <label key={field}>
          {label}
          <input
            required
            value={form[field]}
            onChange={(e) => setForm({ ...form, [field]: e.target.value })}
          />
        </label>
      ))}
      <button className="pf4-cta" disabled={busy}>
        {busy ? "Salvataggio…" : "Salva indirizzo →"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

function summary(view: AddressView | undefined) {
  if (!view?.address)
    return "Senza indirizzo non possiamo calcolare quanto dista un circolo e non possiamo consigliarti quello più vicino per la lezione gratuita.";
  if (!view.located)
    return view.assisted
      ? "Il tuo indirizzo è salvato ma non lo abbiamo riconosciuto, quindi la distanza dai circoli non la possiamo calcolare. Cercalo qui sotto e scegli il tuo tra i suggerimenti."
      : "Il tuo indirizzo è salvato ma non lo abbiamo riconosciuto, quindi la distanza dai circoli non la possiamo calcolare. Prova a correggere via, CAP e città.";
  return "Il tuo indirizzo è a posto: quando scegli il circolo per la lezione gratuita vedi quanto dista.";
}

/** Indirizzo dell'atleta; `onSaved` aggiorna chi mostra le distanze. */
export function AthleteAddress({ onSaved }: { onSaved?: () => void } = {}) {
  const { data, error, reload } = useAthlete<AddressView>("/athlete/address");
  const [saved, setSaved] = useState<AddressView>();
  const view = saved ?? data;
  const done = (next: AddressView) => {
    setSaved(next);
    onSaved?.();
  };
  return (
    <section className="pf4-athlete-section">
      <span className="pf4-kicker">Dove abiti</span>
      <h2>Per dirti quanto dista un circolo.</h2>
      <p>{summary(view)}</p>
      {view?.address && view.assisted && (
        <p className="pf-address-current">
          <span className="pf4-kicker">Indirizzo salvato</span>
          <strong>{oneLine(view.address)}</strong>
          {!view.verified && (
            <small>
              Per cambiarlo cerca il nuovo indirizzo e sceglilo tra i
              suggerimenti.
            </small>
          )}
        </p>
      )}
      {view &&
        (view.assisted ? (
          <AddressSearch onSaved={done} />
        ) : (
          <AddressForm initial={view} onSaved={done} />
        ))}
      {error && <button onClick={reload}>Riprova a caricare</button>}
    </section>
  );
}
