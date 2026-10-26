"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SubscriberShell } from "../../../../_components/subscriber-shell";
import { useAthlete } from "../../../../_components/use-athlete";
import type { Exercise, Session } from "../../../../_components/athlete-types";
import {
  sessionSteps,
  twoDigits,
} from "../../../../_components/session-format";
import { useCountdown } from "./use-countdown";
import { SessionFinish } from "./session-finish";

type Outcome = "DONE" | "SKIPPED";
type Run = { index: number; outcomes: Outcome[]; startedAt: number };

const storageKey = (id: string) => `pf-session-run:${id}`;
function loadRun(id: string): Run | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(id));
    const run = raw ? (JSON.parse(raw) as Run) : null;
    return run && Number.isInteger(run.index) && Array.isArray(run.outcomes)
      ? run
      : null;
  } catch {
    return null;
  }
}
function saveRun(id: string, run: Run | null) {
  try {
    if (run) window.sessionStorage.setItem(storageKey(id), JSON.stringify(run));
    else window.sessionStorage.removeItem(storageKey(id));
  } catch {
    // Lo stato resta in memoria: si perde solo ricaricando la pagina.
  }
}

function Progress({
  index,
  total,
  exit,
}: {
  index: number;
  total: number;
  exit: string;
}) {
  return (
    <div className="pfs-run-top">
      <div className="pfs-run-count">
        <span>
          {twoDigits(index + 1)} / {twoDigits(total)}
        </span>
        <Link href={exit}>Esci</Link>
      </div>
      <div className="pfs-segments" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i
            key={i}
            className={
              i < index ? "is-done" : i === index ? "is-current" : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function ExerciseStep({
  step,
  onDone,
  onSkip,
}: {
  step: Exercise;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [technique, setTechnique] = useState(false);
  const timer = useCountdown(step.workSeconds ?? 0);
  return (
    <>
      <figure className="pfs-video" aria-label="Video dimostrativo">
        <span>Video demo · Placeholder</span>
        <figcaption>
          {step.demo || `Qui comparirà il video di ${step.name.toLowerCase()}.`}
        </figcaption>
      </figure>
      <h1 className="pfs-title">{step.name}</h1>
      <p className="pfs-prescription">{step.prescription}</p>
      {step.cue && <p className="pfs-cue">{step.cue}</p>}
      {step.demo && (
        <button
          className="pfs-link pfs-technique"
          aria-expanded={technique}
          onClick={() => setTechnique((v) => !v)}
        >
          Vedi la tecnica <span aria-hidden="true">→</span>
        </button>
      )}
      {technique && <p className="pfs-cue">{step.demo}</p>}
      {!!step.workSeconds && (
        <div className="pfs-work-timer">
          <strong aria-live="polite">{timer.remaining}</strong>
          <small>secondi</small>
          <button
            className="pfs-link"
            onClick={timer.running ? timer.pause : timer.start}
          >
            {timer.running
              ? "Pausa"
              : timer.remaining === 0
                ? "Ancora una serie"
                : timer.remaining < step.workSeconds
                  ? "Riprendi"
                  : "Avvia il timer"}
          </button>
        </div>
      )}
      <div className="pfs-run-actions">
        <button className="pfs-cta" onClick={onDone}>
          Fatto
        </button>
        <button className="pfs-link" onClick={onSkip}>
          Salta questo esercizio
        </button>
      </div>
    </>
  );
}

function RestStep({
  seconds,
  next,
  onEnd,
}: {
  seconds: number;
  next: Exercise;
  onEnd: () => void;
}) {
  const timer = useCountdown(seconds, true);
  useEffect(() => {
    if (timer.remaining === 0) onEnd();
  }, [timer.remaining, onEnd]);
  return (
    <>
      <div className="pfs-rest">
        <strong aria-live="polite">{timer.remaining}</strong>
        <small>secondi</small>
      </div>
      <div className="pfs-rest-next">
        <span className="pfs-kicker">Prossimo</span>
        <h2>{next.name}</h2>
        <p>{next.prescription}</p>
        <button className="pfs-ghost" onClick={onEnd}>
          Salta il riposo
        </button>
      </div>
    </>
  );
}

export function SessionPlayer({ id }: { id: string }) {
  const router = useRouter();
  const {
    data: session,
    error,
    reload,
  } = useAthlete<Session>(
    `/athlete/training/sessions/${encodeURIComponent(id)}`,
  );
  const [run, setRun] = useState<Run>(() => ({
    index: 0,
    outcomes: [],
    startedAt: Date.now(),
  }));
  const [resting, setResting] = useState(false);
  useEffect(() => {
    const saved = loadRun(id);
    if (saved) setRun(saved);
  }, [id]);
  const steps = session ? sessionSteps(session) : [];
  const finished = session !== undefined && run.outcomes.length >= steps.length;
  const record = (outcome: Outcome) => {
    const next = {
      ...run,
      outcomes: [...run.outcomes.slice(0, run.index), outcome],
    };
    const isLast = run.index >= steps.length - 1;
    const rest = steps[run.index]?.restSeconds ?? session?.restSeconds ?? 0;
    if (!isLast) next.index = run.index + 1;
    setRun(next);
    saveRun(id, next);
    setResting(!isLast && outcome === "DONE" && rest > 0);
  };
  const endRest = useCallback(() => setResting(false), []);
  const exit = `/user/training/sessions/${id}`;
  if (session && !session.canAct)
    return (
      <SubscriberShell back={exit} kicker="Sessione">
        <h1 className="pfs-title">{session.title}</h1>
        <p className="pfs-lead">Questa sessione è già conclusa.</p>
        <Link className="pfs-cta" href="/user">
          Torna alla home
        </Link>
      </SubscriberShell>
    );
  if (session && finished)
    return (
      <SessionFinish
        session={session}
        steps={steps}
        outcomes={run.outcomes}
        startedAt={run.startedAt}
        onSaved={() => {
          saveRun(id, null);
          router.push("/user");
        }}
      />
    );
  const step = steps[run.index];
  const restSeconds =
    steps[run.index - 1]?.restSeconds ?? session?.restSeconds ?? 0;
  return (
    <SubscriberShell
      tone={resting ? "dark" : "light"}
      error={error}
      reload={reload}
      loading={!session}
    >
      {session && step && (
        <div className="pfs-run">
          {resting ? (
            <>
              <div className="pfs-run-count">
                <span>
                  {twoDigits(run.index)} / {twoDigits(steps.length)}
                </span>
                Riposo
              </div>
              <RestStep
                key={`rest-${run.index}`}
                seconds={restSeconds}
                next={step}
                onEnd={endRest}
              />
            </>
          ) : (
            <>
              <Progress index={run.index} total={steps.length} exit={exit} />
              <ExerciseStep
                key={`step-${run.index}`}
                step={step}
                onDone={() => record("DONE")}
                onSkip={() => record("SKIPPED")}
              />
            </>
          )}
        </div>
      )}
    </SubscriberShell>
  );
}
