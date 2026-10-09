"use client";

import { useState } from "react";
import { StatusBadge } from "@/app/components/product-shell";
import { adminRequest } from "../components/admin-request";
import type { Overview, Settings } from "./free-lesson-types";

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
  {
    key: "creditsMicroTest",
    label: "Crediti per micro-test del catalogo (storico)",
    hint: "Solo per gli esiti già riportati nel vecchio pannello della lezione.",
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
        Non sono Token PF: non si comprano e servono solo a sbloccare la
        lezione. I crediti già registrati non cambiano.
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

const emptyTest = {
  areaId: "",
  title: "",
  instructions: "",
  options: [
    { value: "low", label: "", score: 30 },
    { value: "high", label: "", score: 70 },
  ],
};

/** Catalogo dei micro-test: esercizi brevi con esiti, mai sedute di programma. */
export function MicroTestCatalog({
  overview,
  busy,
  run,
}: {
  overview: Overview;
  busy: boolean;
  run: Run;
}) {
  const [draft, setDraft] = useState(emptyTest);
  const setOption = (i: number, change: Partial<(typeof draft.options)[0]>) =>
    setDraft({
      ...draft,
      options: draft.options.map((o, j) => (j === i ? { ...o, ...change } : o)),
    });
  return (
    <article className="pf-panel">
      <div className="pf-panel-header">
        <h2>Micro-test</h2>
      </div>
      <p className="pf-muted">
        Contenuto amministrativo: l&apos;atleta non li riceve in automatico. I
        micro-test dell&apos;assessment li propone e li scrive l&apos;AI come
        passo della calibrazione, per tutti gli atleti.
      </p>
      <div className="pf-stack">
        {overview.microTests.map((test) => (
          <article className="pf-card" key={test.id}>
            <div className="pf-card-top">
              <div>
                <h3>{test.title}</h3>
                <p className="pf-muted">
                  {test.areaName} ·{" "}
                  {test.options
                    .map((o) => `${o.label} (${o.score})`)
                    .join(", ")}
                </p>
              </div>
              <StatusBadge tone={test.isActive ? "success" : "neutral"}>
                {test.isActive ? "Attivo" : "Spento"}
              </StatusBadge>
            </div>
            <p>{test.instructions}</p>
            <button
              className="pf-button-secondary"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    adminRequest(
                      `/admin/free-lessons/micro-tests/${test.id}`,
                      "PATCH",
                      { isActive: !test.isActive },
                    ),
                  test.isActive ? "Micro-test spento." : "Micro-test attivo.",
                )
              }
            >
              {test.isActive ? "Spegni" : "Riattiva"}
            </button>
          </article>
        ))}
      </div>
      <form
        className="pf-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            () =>
              adminRequest("/admin/free-lessons/micro-tests", "POST", draft),
            "Micro-test aggiunto.",
          ).then((ok) => ok && setDraft(emptyTest));
        }}
      >
        <h3>Nuovo micro-test</h3>
        <label className="pf-field">
          Driver
          <select
            className="pf-input"
            required
            value={draft.areaId}
            onChange={(event) =>
              setDraft({ ...draft, areaId: event.target.value })
            }
          >
            <option value="">Scegli</option>
            {overview.areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </label>
        <label className="pf-field">
          Titolo
          <input
            className="pf-input"
            required
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </label>
        <label className="pf-field">
          Istruzioni
          <textarea
            className="pf-input"
            required
            value={draft.instructions}
            onChange={(event) =>
              setDraft({ ...draft, instructions: event.target.value })
            }
          />
        </label>
        {draft.options.map((option, i) => (
          <div className="pf-actions" key={i}>
            <input
              className="pf-input"
              aria-label={`Esito ${i + 1}`}
              placeholder="Esito (es. Meno di 5 su 10)"
              required
              value={option.label}
              onChange={(event) => setOption(i, { label: event.target.value })}
            />
            <input
              className="pf-input"
              aria-label={`Punteggio esito ${i + 1}`}
              type="number"
              value={option.score}
              onChange={(event) =>
                setOption(i, { score: Number(event.target.value) })
              }
            />
          </div>
        ))}
        {draft.options.length < 6 && (
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                options: [
                  ...draft.options,
                  {
                    value: `o${draft.options.length + 1}`,
                    label: "",
                    score: 50,
                  },
                ],
              })
            }
          >
            Aggiungi esito
          </button>
        )}
        <button className="pf-button" type="submit" disabled={busy}>
          Aggiungi micro-test
        </button>
      </form>
    </article>
  );
}
