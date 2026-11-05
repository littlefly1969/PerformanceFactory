"use client";

import { useState } from "react";
import { adminRequest } from "../components/admin-request";
import type { Settings } from "./free-lesson-types";

type Run = (action: () => Promise<unknown>, done: string) => Promise<boolean>;

const SETTINGS: { key: keyof Settings; label: string; hint: string }[] = [
  {
    key: "creditsToUnlock",
    label: "Traguardo visivo dei crediti",
    hint: "Solo la barra di progresso dell'atleta: la lezione si sblocca con la regola di eleggibilità in Calibrazione.",
  },
  {
    key: "creditsInitialAssessment",
    label: "Crediti per la prima valutazione",
    hint: "Assessment iniziale completato e valutato.",
  },
  {
    key: "creditsCalibrationRound",
    label: "Crediti per passo di calibrazione",
    hint: "Ogni passo risposto e valutato, domande o micro-test dell'AI.",
  },
];

/** Parametri dei crediti (A8-D02 aperto): valgono per i crediti registrati da ora. */
export function SettingsPanel({
  settings,
  busy,
  run,
}: {
  settings: Settings;
  busy: boolean;
  run: Run;
}) {
  const [draft, setDraft] = useState(settings);
  return (
    <article className="pf-panel">
      <div className="pf-panel-header">
        <h2>Crediti di interazione</h2>
      </div>
      <p className="pf-muted">
        Non sono Token PF: mostrano il progresso. La lezione si sblocca con le
        regole di Calibrazione. I crediti già registrati non cambiano.
      </p>
      <div className="pf-stack">
        {SETTINGS.map((field) => (
          <label className="pf-field" key={field.key}>
            {field.label}
            <input
              className="pf-input"
              type="number"
              min={0}
              value={draft[field.key]}
              onChange={(event) =>
                setDraft({ ...draft, [field.key]: Number(event.target.value) })
              }
            />
            <span className="pf-field-hint">{field.hint}</span>
          </label>
        ))}
        <button
          className="pf-button"
          type="button"
          disabled={busy}
          onClick={() =>
            void run(
              () => adminRequest("/admin/free-lessons/config", "PUT", draft),
              "Parametri salvati.",
            )
          }
        >
          Salva parametri
        </button>
      </div>
    </article>
  );
}
