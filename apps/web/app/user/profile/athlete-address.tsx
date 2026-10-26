"use client";
import { useState } from "react";
import { athleteRequest, useAthlete } from "../_components/use-athlete";
type Address = {
  street: string;
  postalCode: string;
  city: string;
  province: string;
};
type AddressView = { address: Address | null; located: boolean };
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
          ? "Indirizzo salvato. Ora vedi quanto dista ogni circolo."
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
export function AthleteAddress() {
  const { data, error, reload } = useAthlete<AddressView>("/athlete/address");
  const [saved, setSaved] = useState<AddressView>();
  const view = saved ?? data;
  return (
    <section className="pf4-athlete-section">
      <span className="pf4-kicker">Dove abiti</span>
      <h2>Per dirti quanto dista un circolo.</h2>
      <p>
        {view?.address && view.located
          ? "Il tuo indirizzo è a posto: nel pannello della lezione gratuita vedi la distanza di ogni circolo."
          : view?.address
            ? "Il tuo indirizzo è salvato ma non lo abbiamo riconosciuto, quindi la distanza dai circoli non la possiamo calcolare. Prova a correggere via, CAP e città."
            : "Senza indirizzo non possiamo calcolare quanto dista un circolo e non possiamo consigliarti quello più vicino per la lezione gratuita."}
      </p>
      {view && <AddressForm initial={view} onSaved={setSaved} />}{" "}
      {error && <button onClick={reload}>Riprova a caricare</button>}
    </section>
  );
}
