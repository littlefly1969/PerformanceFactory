"use client";
import {
  GoogleRegistrationButton,
  usePendingGoogle,
} from "./google-registration";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { API_BASE } from "../lib/api";
import { track } from "../lib/analytics";
import { captureTouch } from "../lib/attribution";
import type { DiscoveryConfiguration, DiscoveryDraft } from "./discovery-types";
import {
  answerValid,
  DRAFT_KEY,
  optionsFor,
  questionValue,
  restoreDraft,
  setAnswer,
} from "./discovery-state";
import { FunnelQuestion } from "./funnel-question";
import { BodyMeasures } from "./body-measures";
import { measurePair, screenIds } from "./funnel-screens";
import { PF4Shell } from "./pf4-shell";
import { Registration } from "./registration";
import { pruneHiddenAnswers, visibleQuestions } from "./discovery-branches";
import { PreliminaryResult } from "./preliminary-result";
import {
  AnalysisTransition,
  DISCOVERY_ANALYSIS_MIN_DURATION_MS,
} from "./analysis-transition";
import {
  campaignEntry,
  readQuizToken,
  resumeQuiz,
  saveQuiz,
  startQuiz,
} from "./quiz-draft";

const SAVE_DELAY_MS = 800;

/** Primo passaggio dopo l'intro: le campagne entrano dritte nel quiz (AT-01). */
const firstStep = (config: DiscoveryConfiguration, draft: DiscoveryDraft) =>
  screenIds(visibleQuestions(config.questions, draft))[0] ?? "processing";

/** La schermata dopo `step`, ricalcolata sui rami visibili ora. */
const nextScreen = (
  config: DiscoveryConfiguration,
  draft: DiscoveryDraft,
  step: string,
) => {
  const screens = [
    ...screenIds(visibleQuestions(config.questions, draft)),
    "processing",
  ];
  return screens[screens.indexOf(step) + 1];
};

/**
 * Crea la bozza sul server lasciando l'intro e congela la versione del quiz.
 * Se nel frattempo la configurazione è cambiata, si passa a quella congelata:
 * è quella che la registrazione userà.
 */
function startServerDraft(
  config: DiscoveryConfiguration,
  setConfig: (config: DiscoveryConfiguration) => void,
  setDraft: Dispatch<SetStateAction<DiscoveryDraft | undefined>>,
) {
  if (readQuizToken()) return;
  void startQuiz().then((created) => {
    if (!created || created.configuration.version === config.version) return;
    const frozen = created.configuration;
    setConfig(frozen);
    setDraft((current) => {
      const next = restoreDraft(
        JSON.stringify({ ...current, version: frozen.version }),
        frozen,
      );
      return next.currentStep === "intro"
        ? { ...next, currentStep: firstStep(frozen, next) }
        : next;
    });
  });
}

export default function StartPage() {
  const googlePending = usePendingGoogle();
  const [googleError, setGoogleError] = useState("");
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
  const lastStep = useRef<string | undefined>(undefined);
  const lastSaved = useRef<string | undefined>(undefined);
  useEffect(() => {
    captureTouch(new URL(window.location.href));
    track("landing_viewed", { path: window.location.pathname });
  }, []);
  useEffect(() => {
    const step = draft?.currentStep;
    if (!step) return;
    const previous = lastStep.current;
    lastStep.current = step;
    // Solo i passaggi fatti ora: una bozza ripresa non riconta gli eventi.
    if (previous === undefined || previous === step) return;
    if (previous === "intro") track("discovery_started");
    if (step === "processing") track("discovery_completed");
    if (step === "registration") track("registration_started");
  }, [draft?.currentStep]);
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      // Una bozza salvata sul server vince sulla configurazione corrente: il
      // quiz riprende sulla versione con cui è iniziato (AT-04, AT-06).
      const saved = await resumeQuiz();
      let configuration = saved?.configuration;
      if (!configuration) {
        const response = await fetch(`${API_BASE}/public/athlete-discovery`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error("Discovery non disponibile. Riprova tra poco.");
        configuration = (await response.json()) as DiscoveryConfiguration;
      }
      if (controller.signal.aborted) return;
      let raw: string | null = null;
      try {
        raw = sessionStorage.getItem(DRAFT_KEY);
        sessionStorage.setItem(DRAFT_KEY, raw ?? "null");
      } catch {
        setStorageWarning(true);
      }
      // La copia di questa scheda è la più recente; il server copre un'altra
      // scheda, un altro giorno o una pagina ricaricata dopo la chiusura.
      let restored = restoreDraft(raw, configuration);
      if (saved && restored.currentStep === "intro")
        restored = restoreDraft(JSON.stringify(saved.draft), configuration);
      lastSaved.current = JSON.stringify(restored);
      setConfig(configuration);
      if (
        restored.currentStep === "intro" &&
        !Object.keys(restored.answers).length &&
        campaignEntry(new URL(window.location.href))
      ) {
        // Conta comunque l'avvio della discovery, come dal pulsante.
        lastStep.current = "intro";
        restored = {
          ...restored,
          currentStep: firstStep(configuration, restored),
        };
        startServerDraft(configuration, setConfig, setDraft);
      }
      setDraft(restored);
    })().catch((failure) => {
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
    const serialized = JSON.stringify(draft);
    if (serialized === lastSaved.current || draft.currentStep === "intro")
      return;
    const timer = setTimeout(() => {
      lastSaved.current = serialized;
      void saveQuiz(draft);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    if (draft?.currentStep !== "processing") return;
    const timer = setTimeout(
      () =>
        setDraft((current) =>
          current?.currentStep === "processing"
            ? { ...current, currentStep: "result" }
            : current,
        ),
      DISCOVERY_ANALYSIS_MIN_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [draft?.currentStep]);
  useEffect(() => {
    heading.current?.focus();
  }, [draft?.currentStep]);
  const begin = () => {
    if (!config || !draft) return;
    setDraft({ ...draft, currentStep: firstStep(config, draft) });
    startServerDraft(config, setConfig, setDraft);
  };
  if (!config || !draft)
    return (
      <PF4Shell funnel={{ tone: "light" }}>
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
  const questions = visibleQuestions(config.questions, draft);
  const screens = screenIds(questions);
  const pair = measurePair(questions);
  const steps = ["intro", ...screens, "processing", "result", "registration"];
  const index = steps.indexOf(draft.currentStep);
  const measures = pair?.screenId === draft.currentStep ? pair : undefined;
  const question = measures
    ? undefined
    : questions.find((q) => q.id === draft.currentStep);
  const move = (delta: number) => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    setDraft({ ...draft, currentStep: steps[index + delta] });
  };
  const autoAdvance =
    question && ["single_choice", "boolean"].includes(question.type);
  const onScreen = question || measures;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <PF4Shell
      funnel={{
        tone: question || draft.currentStep === "intro" ? "dark" : "light",
        counter: onScreen
          ? `${pad(index)} / ${pad(screens.length)}`
          : undefined,
      }}
      progress={Math.min(index, screens.length)}
      total={
        index > 0 && draft.currentStep !== "registration" ? screens.length : 0
      }
      onBack={
        index > 0 && !registering
          ? () => move(draft.currentStep === "result" ? -2 : -1)
          : undefined
      }
    >
      {storageWarning && (
        <p role="status" className="pf4-storage">
          Il browser non permette di salvare la bozza. Non ricaricare questa
          pagina.
        </p>
      )}
      {draft.currentStep === "intro" && (
        <div className="pf4-intro pf4-body">
          <p className="pf4-kicker">Performance Factory</p>
          <h1 ref={heading} tabIndex={-1}>
            Eleva la tua performance.
          </h1>
          <p>
            Il tuo sport. I tuoi obiettivi.
            <br />
            Un primo passo per conoscerti meglio.
          </p>
          <button className="pf4-cta" onClick={begin}>
            Inizia il percorso →
          </button>
          {!googlePending && (
            <GoogleRegistrationButton onError={setGoogleError} />
          )}
          {googlePending && (
            <p className="pf4-note">
              Account Google riconosciuto. Completa le domande per proseguire.
            </p>
          )}
          {googleError && (
            <p role="alert" className="pf4-error">
              {googleError}
            </p>
          )}
          <p className="pf4-login">
            Hai già un account? <a href="/login">Accedi</a>
          </p>
        </div>
      )}
      {question && (
        <FunnelQuestion
          key={question.id}
          question={question}
          options={optionsFor(question, draft)}
          value={questionValue(draft, question)}
          headingRef={heading}
          onChange={(value) => {
            const updated = pruneHiddenAnswers(
              config.questions,
              setAnswer(draft, question, value),
            );
            setDraft(updated);
            timers.current.forEach(clearTimeout);
            timers.current.clear();
            if (autoAdvance && answerValid(question, updated)) {
              const timer = setTimeout(() => {
                timers.current.delete(timer);
                setDraft((current) =>
                  current?.currentStep === question.id
                    ? {
                        ...current,
                        currentStep: nextScreen(config, current, question.id),
                      }
                    : current,
                );
              }, 240);
              timers.current.add(timer);
            }
          }}
          footer={
            (!autoAdvance || !question.required) && (
              <footer className="pf4-footer">
                <button
                  className="pf4-cta"
                  disabled={!answerValid(question, draft)}
                  onClick={() => move(1)}
                >
                  Continua
                </button>
              </footer>
            )
          }
        />
      )}
      {measures && (
        <BodyMeasures
          key={measures.screenId}
          height={measures.height}
          weight={measures.weight}
          values={{
            height: questionValue(draft, measures.height),
            weight: questionValue(draft, measures.weight),
          }}
          headingRef={heading}
          valid={(values) => {
            const filled = setAnswer(
              setAnswer(draft, measures.height, values.height),
              measures.weight,
              values.weight,
            );
            return (
              answerValid(measures.height, filled) &&
              answerValid(measures.weight, filled)
            );
          }}
          onChange={(target, value) =>
            setDraft(
              pruneHiddenAnswers(
                config.questions,
                setAnswer(draft, target, value),
              ),
            )
          }
          onContinue={(values) => {
            const filled = pruneHiddenAnswers(
              config.questions,
              setAnswer(
                setAnswer(draft, measures.height, values.height),
                measures.weight,
                values.weight,
              ),
            );
            setDraft({
              ...filled,
              currentStep: nextScreen(config, filled, measures.screenId),
            });
          }}
        />
      )}
      {draft.currentStep === "processing" && <AnalysisTransition />}
      {draft.currentStep === "result" && (
        <PreliminaryResult
          config={config}
          draft={draft}
          onContinue={() => move(1)}
        />
      )}
      {draft.currentStep === "registration" && (
        <Registration
          googlePending={googlePending}
          draft={draft}
          onBusyChange={setRegistering}
        />
      )}
    </PF4Shell>
  );
}
