"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PF4Shell } from "../start/pf4-shell";
import { WelcomeHome } from "./welcome-home";
import { ConsentStep } from "./consent-step";
import { DurationStep, PerformanceResult } from "./performance-result";
import { useJourney } from "./use-journey";
import { CardNumberStep } from "./card-number-step";
import { MultiChoiceStep } from "./choice-options";
import { QuestionsPreparing } from "./questions-preparing";
import { AccountHome } from "./_account/account-home";
import { DarkQuestion, SingleOptions } from "./_account/dark-question";
import { ProvisionalReady } from "./_account/provisional-ready";
import type { Journey } from "./journey-types";
import "./journey.css";
const HORIZON_MONTHS: Record<string, number> = {
  PROGRAM_3M: 3,
  PROGRAM_6M: 6,
  PROGRAM_12M: 12,
};
export default function JourneyPage() {
  const {
    journey: j,
    error,
    busy,
    google,
    documents,
    action,
    accept,
    refresh,
  } = useJourney();
  const q = j?.questions?.[j.currentQuestion];
  // Profilo provvisorio pronto (immagine 9): solo appena finito l'assessment.
  const [ready, setReady] = useState(false);
  const previous = useRef<Journey["phase"]>(undefined);
  useEffect(() => {
    const before = previous.current;
    previous.current = j?.phase;
    if (
      j?.phase === "EVALUATION" &&
      (before === "ASSESSMENT" || before === "PROCESSING")
    )
      // Transizione osservata dal server: si mostra una volta.
      setReady(true);
  }, [j?.phase]);
  // Prima dell'assessment: la prima volta il benvenuto (foto, Spider, regalo,
  // app), poi la home, che è anche dove riapre l'app installata.
  const intro = j?.phase === "ASSESSMENT_INTRO";
  const welcome = intro && !j.welcomeCompleted;
  useEffect(() => {
    if (welcome) window.location.replace("/benvenuto/foto");
  }, [welcome]);
  if (welcome) return null;
  if (intro)
    return (
      <WelcomeHome
        journey={j}
        busy={busy}
        error={error}
        onStart={() => void action("start")}
      />
    );
  if (j?.phase === "EVALUATION" && j.evaluation)
    return ready ? (
      <ProvisionalReady
        evaluation={j.evaluation}
        onHome={() => setReady(false)}
      />
    ) : (
      <AccountHome journey={j} />
    );
  // Domanda dell'assessment nella veste del funnel (immagine 8).
  if (j?.phase === "ASSESSMENT" && !j.assessmentComplete && q)
    return (
      <DarkQuestion
        key={q.id}
        kicker={q.section ?? q.areaName ?? "Assessment"}
        title={q.title}
        note={
          j.wakeup
            ? `${j.firstName ? `${j.firstName}, il` : "Il"} tuo profilo è come l’hai lasciato: riprendi dal prossimo passo, senza ricominciare.`
            : undefined
        }
        progress={j.currentQuestion}
        total={j.count}
        showLogout
        onBack={
          j.currentQuestion > 0 && !busy
            ? () => {
                void action("back");
              }
            : () => window.location.assign("/journey/profilo")
        }
        footer={
          error ? (
            <p className="pf4-body pf4-error" role="alert">
              {error}
            </p>
          ) : undefined
        }
      >
        {q.inputType === "TEXT" ? (
          <CardNumberStep
            key={q.id}
            initial={String(j.answers[q.id] ?? "")}
            busy={busy}
            onSubmit={(value) => action("answer", { questionId: q.id, value })}
          />
        ) : q.multiple ? (
          <MultiChoiceStep
            key={q.id}
            options={q.options}
            initial={j.answers[q.id]}
            busy={busy}
            onSubmit={(value) => action("answer", { questionId: q.id, value })}
          />
        ) : (
          <SingleOptions
            options={q.options}
            selected={j.answers[q.id]}
            busy={busy}
            onSelect={(value) =>
              void action("answer", { questionId: q.id, value })
            }
          />
        )}
      </DarkQuestion>
    );
  // L'intro PF5 e chiara, come /start; il questionario resta sullo stage scuro.
  const assessment = j?.phase === "ASSESSMENT" || j?.phase === "PROCESSING";
  return (
    <div className={assessment ? "pf4-assessment" : undefined}>
      <PF4Shell
        showLogout
        label={
          assessment
            ? `Assessment · ${j?.count ?? ""} domande`
            : "Il tuo percorso"
        }
        progress={j?.phase === "ASSESSMENT" ? j.currentQuestion : 0}
        total={j?.phase === "ASSESSMENT" ? j.count : 0}
        onBack={
          j?.phase === "ASSESSMENT" && j.currentQuestion > 0 && !busy
            ? () => {
                void action("back");
              }
            : undefined
        }
      >
        {error && (
          <div className="pf4-body pf4-error" role="alert">
            {error}
            {!j && (
              <button
                className="pf4-cta"
                onClick={() => window.location.reload()}
              >
                Riprova
              </button>
            )}
          </div>
        )}
        {/* Risveglio in-app: si riprende dal profilo, mai da capo (§8.4). */}
        {j?.wakeup && (
          <section className="pf4-body pf4-wakeup" role="status">
            <span className="pf4-kicker">Bentornato</span>
            <p>
              {j.firstName ? `${j.firstName}, il` : "Il"} tuo profilo è come
              l’hai lasciato: riprendi dal prossimo passo, senza ricominciare.
            </p>
          </section>
        )}
        {!j && !google && !error && (
          <section className="pf4-body">
            <h1>Riprendiamo da qui…</h1>
          </section>
        )}
        {(google || j?.phase === "CONSENTS") && (
          <ConsentStep
            documents={google ? documents : (j?.documents ?? [])}
            busy={busy}
            onAccept={accept}
            askAdult={google}
          />
        )}
        {j?.phase === "ASSESSMENT_UNAVAILABLE" && (
          <section className="pf4-body" role="status">
            <h1>Il questionario non è ancora disponibile.</h1>
            <p>
              Stiamo completando la configurazione delle domande. Riprova tra
              poco.
            </p>
            <button className="pf4-cta" onClick={() => void refresh()}>
              Aggiorna
            </button>
          </section>
        )}
        {j?.phase === "ASSESSMENT" && j.questionsPending && (
          <QuestionsPreparing
            busy={busy}
            failed={!!error}
            onPrepare={() => action("questions")}
          />
        )}
        {/* Tutte le risposte date: l'atleta conferma e parte la prima valutazione AI. */}
        {j?.phase === "ASSESSMENT" && j.assessmentComplete && (
          <section className="pf4-body" role="status">
            <span className="pf4-kicker">
              {j.count} / {j.count} · Assessment completato
            </span>
            <h1>Risposte registrate.</h1>
            <p>
              Hai risposto a tutte le domande. Puoi ancora tornare indietro e
              modificarle; quando confermi le analizziamo e le risposte non
              saranno più modificabili.
            </p>
            <button
              className="pf4-cta"
              disabled={busy}
              onClick={() => void action("evaluate")}
            >
              {busy
                ? "Analizziamo le tue risposte…"
                : "Analizza le mie risposte →"}
            </button>
          </section>
        )}
        {j?.phase === "SUBSCRIBED" && (
          <section className="pf4-body" aria-labelledby="pf4-subscribed-title">
            <span className="pf4-badge">✓ Abbonamento attivo</span>
            <h1 id="pf4-subscribed-title">Prepariamo il tuo programma.</h1>
            <p>
              Partiamo dalla tua R consolidata e dallo scenario a{" "}
              {HORIZON_MONTHS[j.programHorizon ?? ""] ?? "—"} mesi che hai
              scelto. Poi la Home ti accompagna sessione dopo sessione.
            </p>
            <button
              className="pf4-cta"
              disabled={busy}
              onClick={() => void action("program")}
            >
              {busy ? "Prepariamo il programma…" : "Crea il mio programma →"}
            </button>
          </section>
        )}
        {j?.phase === "PROCESSING" && (
          <section className="pf4-body" role="status">
            <h1>Analizziamo le tue risposte…</h1>
            <p>
              Il percorso riprenderà automaticamente quando l’elaborazione sarà
              terminata.
            </p>
            <button
              className="pf4-cta"
              onClick={() => {
                void refresh();
              }}
            >
              Aggiorna
            </button>
          </section>
        )}
        {j?.phase === "RESULT" && (
          <PerformanceResult
            journey={j}
            busy={busy}
            onContinue={() => {
              void action("duration");
            }}
          />
        )}
        {j?.phase === "DURATION" && (
          <DurationStep
            journey={j}
            busy={busy}
            onSelect={(weeks) => {
              void action("duration", { weeks });
            }}
          />
        )}
        {j?.phase === "COMPLETE" && (
          <section className="pf4-body">
            <span className="pf4-badge">✓ Programma confermato</span>
            <h1>Il tuo prossimo passo, ogni giorno.</h1>
            <p>
              La Home ti accompagna con le sessioni del tuo programma e i
              check-in al momento giusto.
            </p>
            <dl className="pf4-profile">
              <div>
                <dt>Il tuo percorso</dt>
                <dd>{j.programDurationWeeks} settimane</dd>
              </div>
            </dl>
            <Link className="pf4-cta" href="/user">
              Vai al programma →
            </Link>
          </section>
        )}
      </PF4Shell>
    </div>
  );
}
