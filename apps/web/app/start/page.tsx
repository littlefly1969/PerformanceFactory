"use client";
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../lib/api";
import type { DiscoveryConfiguration, DiscoveryDraft } from "./discovery-types";
import {
  answerValid,
  DRAFT_KEY,
  optionsFor,
  questionValue,
  restoreDraft,
  setAnswer,
} from "./discovery-state";
import { DiscoveryQuestionRenderer } from "./question-renderer";
import { PF4Shell } from "./pf4-shell";
import { Registration } from "./registration";
import { PreliminaryResult } from "./preliminary-result";

export default function StartPage() {
  const [config, setConfig] = useState<DiscoveryConfiguration>();
  const [draft, setDraft] = useState<DiscoveryDraft>();
  const [error, setError] = useState("");
  const [registering, setRegistering] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach(clearTimeout);
    };
  }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/public/athlete-discovery`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Discovery non disponibile. Riprova tra poco.");
        const configuration: DiscoveryConfiguration = await response.json();
        let raw: string | null = null;
        try {
          raw = sessionStorage.getItem(DRAFT_KEY);
          sessionStorage.setItem(DRAFT_KEY, raw ?? "null");
        } catch {
          setStorageWarning(true);
        }
        setConfig(configuration);
        setDraft(restoreDraft(raw, configuration));
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Connessione non disponibile",
          );
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!draft) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* Storage warning is set by the initial availability check. */
    }
  }, [draft]);
  useEffect(() => {
    heading.current?.focus();
  }, [draft?.currentStep]);
  if (!config || !draft)
    return (
      <PF4Shell>
        <div className="pf4-body">
          <h1>{error || "Prepariamo il tuo percorso…"}</h1>
          {error && (
            <button
              className="pf4-cta"
              onClick={() => window.location.reload()}
            >
              Riprova
            </button>
          )}
        </div>
      </PF4Shell>
    );
  const steps = [
    "intro",
    ...config.questions.map((q) => q.id),
    "result",
    "registration",
  ];
  const index = steps.indexOf(draft.currentStep);
  const question = config.questions.find((q) => q.id === draft.currentStep);
  const move = (delta: number) => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    setDraft({ ...draft, currentStep: steps[index + delta] });
  };
  const autoAdvance =
    question && ["single_choice", "boolean"].includes(question.type);
  const label = question
    ? `${String(index).padStart(2, "0")} / ${String(config.questions.length).padStart(2, "0")} · Discovery`
    : draft.currentStep === "registration"
      ? "Il tuo percorso"
      : "Performance Factory";
  return (
    <PF4Shell
      label={label}
      progress={Math.min(index, config.questions.length)}
      total={index > 0 ? config.questions.length : 0}
      onBack={index > 0 && !registering ? () => move(-1) : undefined}
    >
      {storageWarning && (
        <p role="status" className="pf4-storage">
          Il browser non permette di salvare la bozza. Non ricaricare questa
          pagina.
        </p>
      )}
      {draft.currentStep === "intro" && (
        <div className="pf4-intro pf4-body">
          <svg
            aria-label="Performance Factory"
            role="img"
            viewBox="0 0 50.762 42.004"
            width="54"
            height="45"
          >
            <path
              d="M6.21 42 9.518 25.148H36.27c.782 0 1.454-.553 1.606-1.32l2.407-12.274c.136-.704-.403-1.356-1.119-1.356H0L1.174 4.221A5.23 5.23 0 0 1 6.31 0h34.272c6.405 0 11.22 5.84 9.987 12.119L47.63 27.094a10.247 10.247 0 0 1-10.042 8.255H17.91l-1.307 6.655Z"
              fill="currentColor"
            />
          </svg>
          <p className="pf4-kicker">Performance Factory</p>
          <h1 ref={heading} tabIndex={-1}>
            Eleva la tua performance.
          </h1>
          <p>
            Il tuo sport. I tuoi obiettivi.
            <br />
            Un primo passo per conoscerti meglio.
          </p>
          <button className="pf4-cta" onClick={() => move(1)}>
            Inizia il percorso →
          </button>
          <p className="pf4-login">
            Hai già un account? <a href="/login">Accedi</a>
          </p>
        </div>
      )}
      {question && (
        <>
          <section className="pf4-body pf4-question" key={question.id}>
            <h1 ref={heading} tabIndex={-1}>
              {question.title}
            </h1>
            {question.description && <p>{question.description}</p>}
            <DiscoveryQuestionRenderer
              question={question}
              options={optionsFor(question, draft)}
              value={questionValue(draft, question)}
              onChange={(value) => {
                const updated = setAnswer(draft, question, value);
                setDraft(updated);
                timers.current.forEach(clearTimeout);
                timers.current.clear();
                if (autoAdvance && answerValid(question, updated)) {
                  const timer = setTimeout(() => {
                    timers.current.delete(timer);
                    setDraft((current) =>
                      current?.currentStep === question.id
                        ? { ...current, currentStep: steps[index + 1] }
                        : current,
                    );
                  }, 240);
                  timers.current.add(timer);
                }
              }}
            />
          </section>
          {!autoAdvance && (
            <footer className="pf4-footer">
              <button
                className="pf4-cta"
                disabled={!answerValid(question, draft)}
                onClick={() => move(1)}
              >
                Continua
              </button>
            </footer>
          )}
        </>
      )}
      {draft.currentStep === "result" && (
        <PreliminaryResult
          config={config}
          draft={draft}
          onContinue={() => move(1)}
        />
      )}
      {draft.currentStep === "registration" && (
        <Registration draft={draft} onBusyChange={setRegistering} />
      )}
    </PF4Shell>
  );
}
