"use client";
import { useEffect, useState } from "react";
import { API_BASE } from "../../lib/api";
import { PF4Shell } from "../../start/pf4-shell";
import { DiscoveryQuestionRenderer } from "../../start/question-renderer";
import {
  pruneHiddenAnswers,
  visibleQuestions,
} from "../../start/discovery-branches";
import {
  answerValid,
  emptyDraft,
  optionsFor,
  questionValue,
  setAnswer,
} from "../../start/discovery-state";
import type {
  DiscoveryConfiguration,
  DiscoveryDraft,
} from "../../start/discovery-types";

const END = "end";

/**
 * Percorre la configurazione pubblica con lo stesso motore di /start: rami,
 * validazione e renderer sono quelli reali. Ogni salvataggio admin e gia
 * operativo, quindi l'anteprima coincide con cio che vedono i nuovi atleti.
 */
export function DiscoveryPreview() {
  const [config, setConfig] = useState<DiscoveryConfiguration>();
  const [draft, setDraft] = useState<DiscoveryDraft>();
  const [change, setChange] = useState<{ from: number; to: number }>();
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`${API_BASE}/public/athlete-discovery`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Discovery non disponibile: controlla la configurazione.",
          );
        const loaded = (await response.json()) as DiscoveryConfiguration;
        setConfig(loaded);
        setDraft(start(loaded));
      })
      .catch((failure: Error) => setError(failure.message));
  }, []);
  if (!config || !draft)
    return (
      <PF4Shell label="Anteprima discovery">
        <div className="pf4-body">
          <h1>{error || "Carichiamo la discovery…"}</h1>
        </div>
      </PF4Shell>
    );
  const questions = visibleQuestions(config.questions, draft);
  const index = questions.findIndex((q) => q.id === draft.currentStep);
  const question = questions[index];
  const go = (step: number) =>
    setDraft({
      ...draft,
      currentStep: step < questions.length ? questions[step].id : END,
    });
  return (
    <PF4Shell
      label={`Anteprima · ${question ? `${String(index + 1).padStart(2, "0")} / ${String(questions.length).padStart(2, "0")}` : "fine"}`}
      progress={question ? index + 1 : questions.length}
      total={questions.length}
      onBack={
        index !== 0
          ? () => go(question ? index - 1 : questions.length - 1)
          : undefined
      }
    >
      <p className="pf4-storage" role="status">
        Percorso corrente{" "}
        {question ? `${index + 1} / ${questions.length}` : "completato"} ·
        Domande visibili in questo ramo: {questions.length}
        {change && ` · Domande visibili: ${change.from} → ${change.to}`}
      </p>
      {question ? (
        <>
          <section className="pf4-body pf4-question" key={question.id}>
            <h1>{question.title}</h1>
            {question.description && <p>{question.description}</p>}
            <DiscoveryQuestionRenderer
              question={question}
              options={optionsFor(question, draft)}
              value={questionValue(draft, question)}
              onChange={(value) => {
                const next = pruneHiddenAnswers(
                  config.questions,
                  setAnswer(draft, question, value),
                );
                const to = visibleQuestions(config.questions, next).length;
                if (to !== questions.length)
                  setChange({ from: questions.length, to });
                setDraft(next);
              }}
            />
          </section>
          <footer className="pf4-footer">
            <button
              className="pf4-cta"
              disabled={!answerValid(question, draft)}
              onClick={() => go(index + 1)}
            >
              Avanti
            </button>
          </footer>
        </>
      ) : (
        <>
          <section className="pf4-body">
            <h1>Fine del percorso: {questions.length} domande.</h1>
            <p>
              Qui l’atleta vede l’analisi di almeno 4 secondi e il riepilogo
              pre-account.
            </p>
          </section>
          <footer className="pf4-footer">
            <button
              className="pf4-cta"
              onClick={() => {
                setChange(undefined);
                setDraft(start(config));
              }}
            >
              Ricomincia
            </button>
          </footer>
        </>
      )}
    </PF4Shell>
  );
}

function start(config: DiscoveryConfiguration): DiscoveryDraft {
  return {
    ...emptyDraft(config.version),
    currentStep: config.questions[0]?.id ?? END,
  };
}
