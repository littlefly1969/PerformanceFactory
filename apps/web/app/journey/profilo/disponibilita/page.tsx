"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  athleteRequest,
  useAthlete,
} from "../../../user/_components/use-athlete";
import {
  AccountScreen,
  AccountTopBar,
  PillButton,
} from "../../_account/account-shell";
import { summaryHref } from "../../_account/next-step";
import {
  AVAILABILITY_PATH,
  type Availability,
  DURATIONS,
  FREQUENCIES,
  WEEKDAYS,
} from "../_profile/availability";
import "../_profile/profile.css";
import "../_profile/profile-edit.css";

type Draft = {
  frequency: string;
  /** Indici 0-6 da lunedì; vuoti finché l'atleta non li tocca. */
  days: number[];
  daysPerWeek: number | null;
  minutes: number | null;
};

const fromServer = (a: Availability | undefined): Draft => ({
  frequency: FREQUENCIES.some((f) => f.value === a?.currentFrequency)
    ? a!.currentFrequency!
    : "",
  days: (a?.preferredDays ?? []).map((d) => d - 1),
  daysPerWeek: a?.daysPerWeek ?? null,
  minutes: DURATIONS.some((d) => d.value === a?.sessionDurationMinutes)
    ? a!.sessionDurationMinutes
    : null,
});

/**
 * La tua disponibilità (demo PF10): frequenza abituale, i giorni in cui puoi
 * allenarti (il loro numero sono i giorni a settimana) e la durata di una
 * sessione. Si salva nelle voci del profilo che il programma legge.
 */
export default function AvailabilityPage() {
  const router = useRouter();
  const { data, error: loadError } =
    useAthlete<Availability>(AVAILABILITY_PATH);
  const [edited, setEdited] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // Arrivati dalla creazione del programma (dopo l'abbonamento) si torna lì.
  const [fromSubscription, setFromSubscription] = useState(false);
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("poi") === "abbonamento"
    )
      setFromSubscription(true);
  }, []);
  const draft = edited ?? fromServer(data);
  const set = (next: Partial<Draft>) => {
    setMessage("");
    setEdited({ ...draft, ...next });
  };
  const toggleDay = (i: number) => {
    const days = draft.days.includes(i)
      ? draft.days.filter((d) => d !== i)
      : [...draft.days, i].sort();
    set({ days, daysPerWeek: days.length || null });
  };
  const count = draft.days.length || draft.daysPerWeek || 0;

  const save = async () => {
    if (!draft.frequency || !count || !draft.minutes) {
      setMessage(
        !draft.frequency
          ? "Indica quante volte ti alleni abitualmente."
          : "Indica almeno giorni e minuti a sessione.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await athleteRequest<Availability>(AVAILABILITY_PATH, {
        currentFrequency: draft.frequency,
        daysPerWeek: count,
        sessionDurationMinutes: draft.minutes,
        preferredDays: draft.days.map((d) => d + 1),
      });
      router.push(
        fromSubscription ? "/abbonamento" : summaryHref("disponibilita"),
      );
    } catch (e) {
      setMessage(
        (e as Error).message || "Non è stato possibile salvare. Riprova.",
      );
      setBusy(false);
    }
  };

  return (
    <AccountScreen
      top={
        <AccountTopBar
          title="La tua disponibilità"
          back={fromSubscription ? "/abbonamento" : "/journey/profilo"}
        />
      }
      footer={
        <PillButton
          tone="lime"
          disabled={busy || data === undefined}
          onClick={() => void save()}
        >
          {busy ? "Salvataggio…" : "Salva disponibilità"}
        </PillButton>
      }
    >
      <div className="pf-edit">
        <h1>La tua disponibilità</h1>
        <p className="pf-edit-lead">Puoi aggiornare questi dati quando vuoi.</p>
        <fieldset className="pf-edit-q">
          <legend>Quante volte ti alleni abitualmente?</legend>
          <div className="pf-edit-grid is-two">
            {FREQUENCIES.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`pf-edit-tile is-row${draft.frequency === f.value ? " is-on" : ""}`}
                aria-pressed={draft.frequency === f.value}
                onClick={() =>
                  set({ frequency: draft.frequency === f.value ? "" : f.value })
                }
              >
                <b>{f.n}</b>
                <span>volte a settimana</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="pf-edit-q">
          <legend>
            Quanti giorni alla settimana puoi realisticamente allenarti?
          </legend>
          <div className="pf-edit-days">
            <p>
              <b>{count || "—"}</b>
              <span>
                {count
                  ? count === 1
                    ? "giorno a settimana"
                    : "giorni a settimana"
                  : "tocca i giorni in cui puoi allenarti"}
              </span>
            </p>
            <div className="pf-edit-week">
              {WEEKDAYS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  className={draft.days.includes(i) ? "is-on" : undefined}
                  aria-pressed={draft.days.includes(i)}
                  aria-label={DAY_NAMES[i]}
                  onClick={() => toggleDay(i)}
                >
                  <i />
                  <span aria-hidden="true">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </fieldset>
        <fieldset className="pf-edit-q">
          <legend>Quanto tempo puoi dedicare a una sessione?</legend>
          <div className="pf-edit-grid is-five">
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                className={`pf-edit-tile is-col${draft.minutes === d.value ? " is-on" : ""}`}
                aria-pressed={draft.minutes === d.value}
                onClick={() =>
                  set({ minutes: draft.minutes === d.value ? null : d.value })
                }
              >
                <b>{d.n}</b>
                <span>min</span>
              </button>
            ))}
          </div>
        </fieldset>
        {(message || loadError) && (
          <p className="pf-acc-error" role="alert">
            {message || loadError}
          </p>
        )}
      </div>
    </AccountScreen>
  );
}

const DAY_NAMES = [
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
];
