"use client";
import { useState, type ReactNode } from "react";
import { postJson, useResource } from "./account-data";
import { AccountScreen, PillButton } from "./account-shell";

type Value = string | number;

export type AvailabilityForm = {
  ready: boolean;
  questions: {
    key: string;
    label: string;
    options: { value: Value; label: string }[];
    value: Value | null;
  }[];
};

export const AVAILABILITY_PATH = "/athlete-journey/availability";

/** «2 giorni» → «2», «120+ minuti» → «120+»: il testo intero resta per i lettori. */
const short = (label: string) => label.split(" ")[0] || label;

/**
 * Giorni e durata prima del programma. Non sono più domande dell'assessment:
 * se mancano li chiediamo qui, prima del pagamento o, per chi ha già pagato,
 * prima di creare il piano, e poi si riparte da dove si era.
 */
export function AvailabilityStep({
  top,
  lead,
  action,
  onSaved,
}: {
  top?: ReactNode;
  lead: string;
  /** Testo del pulsante: cosa succede dopo il salvataggio. */
  action: string;
  onSaved: (form: AvailabilityForm) => void;
}) {
  const { data, error: loadError } =
    useResource<AvailabilityForm>(AVAILABILITY_PATH);
  const [picked, setPicked] = useState<Record<string, Value>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const questions = data?.questions ?? [];
  const value = (key: string) =>
    picked[key] ?? questions.find((q) => q.key === key)?.value ?? null;
  const complete =
    questions.length > 0 && questions.every((q) => value(q.key) !== null);

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      const form = await postJson<AvailabilityForm>(AVAILABILITY_PATH, {
        answers: Object.fromEntries(
          questions.map((q) => [q.key, value(q.key)]),
        ),
      });
      onSaved(form);
    } catch (e) {
      setMessage(
        e instanceof Error && e.message
          ? e.message
          : "Non è stato possibile salvare. Riprova.",
      );
      setBusy(false);
    }
  };

  return (
    <AccountScreen
      top={top}
      footer={
        <PillButton
          tone="lime"
          disabled={!complete || busy}
          onClick={() => void save()}
        >
          {busy ? "Salvataggio…" : action}
        </PillButton>
      }
    >
      <span className="pf-acc-kicker">La tua disponibilità</span>
      <h1 className="pf-acc-title is-small">Quanto tempo hai per allenarti?</h1>
      <p>{lead}</p>
      {questions.map((q) => (
        <fieldset key={q.key} className="pf-acc-fieldset">
          <legend>{q.label}</legend>
          <div
            className="pf-acc-segment"
            role="radiogroup"
            aria-label={q.label}
          >
            {q.options.map((o) => {
              const on = String(value(q.key)) === String(o.value);
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={o.label}
                  className={on ? "is-selected" : undefined}
                  disabled={busy}
                  onClick={() => {
                    setMessage("");
                    setPicked((p) => ({ ...p, [q.key]: o.value }));
                  }}
                >
                  {short(o.label)}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <p className="pf-acc-muted">
        Puoi cambiarli quando vuoi dal tuo profilo.
      </p>
      {(message || loadError) && (
        <p className="pf-acc-error" role="alert">
          {message || loadError}
        </p>
      )}
    </AccountScreen>
  );
}
