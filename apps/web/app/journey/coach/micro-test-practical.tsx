"use client";
import { useEffect, useState } from "react";
import type { Calibration } from "../journey-types";
import { Pill } from "./micro-test-ui";
import "./micro-test-practical.css";

type Round = NonNullable<Calibration["round"]>;

/** Circonferenza dell'anello del timer (r = 27). */
const RING = 2 * Math.PI * 27;

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * Timer ad anello della demo: avvia, pausa, «Tempo!». Il conto segue
 * l'orologio, non i tick: una scheda in secondo piano non lo rallenta.
 */
export function Timer({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  const [endAt, setEndAt] = useState<number | null>(null);
  useEffect(() => {
    if (endAt === null) return;
    const tick = () => {
      const rest = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setLeft(rest);
      if (rest === 0) setEndAt(null);
    };
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [endAt]);
  const running = endAt !== null;
  const toggle = () => {
    if (running) {
      setLeft(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
      setEndAt(null);
    } else if (left === 0) setLeft(seconds);
    else setEndAt(Date.now() + left * 1000);
  };
  const title = running
    ? "In corso…"
    : left === 0
      ? "Tempo!"
      : left === seconds
        ? "Avvia il timer"
        : "In pausa";
  const hint = running
    ? "Tocca per mettere in pausa"
    : left === 0
      ? "Ora dicci com’è andata"
      : "Tocca quando sei in posizione";
  const dash = `${(((seconds - left) / seconds) * RING).toFixed(1)} ${RING.toFixed(1)}`;
  return (
    <button
      type="button"
      className={`pf-mt-timer${running ? " is-running" : ""}${left === 0 ? " is-done" : ""}`}
      aria-pressed={running}
      onClick={toggle}
    >
      <span className="pf-mt-timer-ring" aria-hidden="true">
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="27" />
          <circle
            cx="32"
            cy="32"
            r="27"
            strokeDasharray={dash}
            transform="rotate(-90 32 32)"
          />
        </svg>
        <b>{clock(left)}</b>
      </span>
      <span className="pf-mt-timer-text">
        <strong aria-live="polite">{title}</strong>
        <small>{hint}</small>
      </span>
    </button>
  );
}

const PLACE = { ON_COURT: "Sul campo", OFF_COURT: "Fuori dal campo" };

/**
 * Prova pratica come la demo V10: luogo e durata, passaggi numerati, timer
 * se la prova è a tempo, «Com'è andata?» con gli esiti a tessere. L'esito lo
 * riporta l'atleta. I test scritti prima dei passaggi mostrano le istruzioni.
 */
export function Practical({
  round,
  onDone,
  onSkip,
  onExit,
}: {
  round: Round;
  onDone: (answers: Record<string, string>) => Promise<void>;
  onSkip: () => Promise<void>;
  onExit: () => void;
}) {
  const q = round.questions[0];
  const test = q.microTest!;
  const [value, setValue] = useState<string>();
  const [busy, setBusy] = useState(false);
  const run = (task: () => Promise<void>) => {
    setBusy(true);
    void task().finally(() => setBusy(false));
  };
  const steps = test.steps ?? [];
  const kicker = [
    "Pratico",
    test.setting ? PLACE[test.setting] : null,
    test.durationMinutes ? `${test.durationMinutes} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="pf-mt pf-mt-practical" aria-labelledby="pf-mt-prac">
      <div className="pf-mt-prac-head">
        <span className="pf-mt-kicker is-lime">{kicker}</span>
        <button
          type="button"
          className="pf-mt-exit"
          disabled={busy}
          onClick={onExit}
        >
          Esci
        </button>
      </div>
      <h2 id="pf-mt-prac" className="pf-mt-prac-title">
        {test.title ?? q.text}
      </h2>
      {steps.length ? (
        <ol className="pf-mt-prac-steps">
          {steps.map((step, i) => (
            <li key={i} style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
              <span aria-hidden="true">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      ) : (
        <p className="pf-mt-muted">{test.instructions}</p>
      )}
      {test.timerSeconds ? <Timer seconds={test.timerSeconds} /> : null}
      {test.safetyNotes && (
        <p className="pf-mt-muted">
          <strong>Sicurezza:</strong> {test.safetyNotes}
        </p>
      )}
      <span className="pf-mt-kicker is-spaced" id="pf-mt-outcome">
        {test.question || "Com’è andata?"}
      </span>
      <div
        className="pf-mt-tiles"
        role="radiogroup"
        aria-labelledby="pf-mt-outcome"
      >
        {q.options.map((o) => (
          <button
            type="button"
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            disabled={busy}
            className={value === o.value ? "is-selected" : undefined}
            onClick={() => setValue(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <Pill
        disabled={busy || value === undefined}
        onClick={() => run(() => onDone({ [q.id]: value! }))}
      >
        Salva il risultato
      </Pill>
      <button
        type="button"
        className="pf-mt-link"
        disabled={busy}
        onClick={() => run(onSkip)}
      >
        Non posso farlo ora
      </button>
    </section>
  );
}
