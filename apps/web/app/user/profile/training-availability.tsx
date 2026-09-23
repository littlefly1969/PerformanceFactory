"use client";
import { useState } from "react";
import { athleteRequest, useAthlete } from "../_components/use-athlete";
type Availability = {
  currentFrequency: string | null;
  daysPerWeek: number | null;
  sessionDurationMinutes: number | null;
  programDurationWeeks: number | null;
  preferredDays: number[];
};
function AvailabilityForm({ initial }: { initial: Availability }) {
  const [frequency, setFrequency] = useState(
    ["0_1", "2_3", "4_5", "6_PLUS"].includes(initial.currentFrequency ?? "")
      ? initial.currentFrequency!
      : "",
  );
  const [days, setDays] = useState(initial.daysPerWeek?.toString() ?? "");
  const [minutes, setMinutes] = useState(
    initial.sessionDurationMinutes?.toString() ?? "",
  );
  const [weeks, setWeeks] = useState(
    initial.programDurationWeeks?.toString() ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await athleteRequest("/athlete/training/availability", {
        currentFrequency: frequency,
        daysPerWeek: Number(days),
        sessionDurationMinutes: Number(minutes),
        programDurationWeeks: Number(weeks),
        preferredDays: initial.preferredDays,
      });
      setMessage(
        "Disponibilità salvata. La useremo per i prossimi allenamenti.",
      );
    } catch {
      setMessage("Non è stato possibile salvare. Riprova.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="pf4-availability-form">
      <label>
        Quante volte ti alleni abitualmente?
        <select
          required
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
        >
          <option value="">Seleziona</option>
          {[
            ["0_1", "0–1"],
            ["2_3", "2–3"],
            ["4_5", "4–5"],
            ["6_PLUS", "6 o più"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label} volte a settimana
            </option>
          ))}
        </select>
      </label>
      <label>
        Quanti giorni alla settimana puoi realisticamente allenarti?
        <select required value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="">Seleziona</option>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <option key={d} value={d}>
              {d} {d === 1 ? "giorno" : "giorni"}
            </option>
          ))}
        </select>
      </label>
      <label>
        Quanto tempo puoi dedicare a una sessione?
        <select
          required
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        >
          <option value="">Seleziona</option>
          {[30, 45, 60, 90, 120].map((m) => (
            <option key={m} value={m}>
              {m === 120 ? "120+" : m} minuti
            </option>
          ))}
        </select>
      </label>
      <label>
        Durata del programma
        <select
          required
          value={weeks}
          onChange={(e) => setWeeks(e.target.value)}
        >
          <option value="">Seleziona</option>
          {[4, 12, 52].map((w) => (
            <option key={w} value={w}>
              {w} settimane
            </option>
          ))}
        </select>
      </label>
      <button className="pf4-cta" disabled={busy}>
        {busy ? "Salvataggio…" : "Salva disponibilità →"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
export function TrainingAvailability() {
  const { data, error, reload } = useAthlete<Availability>(
    "/athlete/training/availability",
  );
  return (
    <section className="pf4-athlete-section">
      <span className="pf4-kicker">La tua disponibilità</span>
      <h2>Un programma che trova spazio nella tua settimana.</h2>
      <p>
        Puoi aggiornare questi dati quando cambiano i tuoi impegni. Gli
        allenamenti già pubblicati restano nel calendario.
      </p>
      {data && <AvailabilityForm initial={data} />}{" "}
      {error && <button onClick={reload}>Riprova a caricare</button>}
    </section>
  );
}
