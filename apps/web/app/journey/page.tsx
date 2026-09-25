"use client";
import Link from "next/link";
import { PF4Shell } from "../start/pf4-shell";
import { AssessmentIntro } from "./assessment-intro";
import { ConsentStep } from "./consent-step";
import { DurationStep, PerformanceResult } from "./performance-result";
import { useJourney } from "./use-journey";
import "./journey.css";
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
  // L'intro PF5 e chiara, come /start; il questionario resta sullo stage scuro.
  const assessment = j?.phase === "ASSESSMENT" || j?.phase === "PROCESSING";
  return (
    <div className={assessment ? "pf4-assessment" : undefined}>
      <PF4Shell
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
          />
        )}
        {j?.phase === "ASSESSMENT_INTRO" && (
          <AssessmentIntro
            journey={j}
            busy={busy}
            onStart={() => void action("start")}
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
        {j?.phase === "ASSESSMENT" && !j.assessmentComplete && q && (
          <section className="pf4-body pf4-question" key={q.id}>
            <span className="pf4-kicker">
              {j.currentQuestion + 1} / {j.count} · {q.section ?? q.areaName}
            </span>
            <h1>{q.title}</h1>
            <div className="pf4-options">
              {q.options.map((o) => (
                <button
                  disabled={busy}
                  aria-pressed={String(j.answers[q.id]) === String(o.value)}
                  className={`pf4-option ${String(j.answers[q.id]) === String(o.value) ? "is-selected" : ""}`}
                  key={String(o.value)}
                  onClick={() =>
                    action("answer", { questionId: q.id, value: o.value })
                  }
                >
                  <span>{o.label}</span>
                  <span className="pf4-dot" />
                </button>
              ))}
            </div>
          </section>
        )}
        {/* STOP della slice PF5: dopo l'ultima risposta nessuna azione successiva. */}
        {j?.phase === "ASSESSMENT" && j.assessmentComplete && (
          <section className="pf4-body" role="status">
            <span className="pf4-kicker">
              {j.count} / {j.count} · Assessment completato
            </span>
            <h1>Risposte registrate.</h1>
            <p>
              Hai risposto a tutte le domande. Puoi ancora tornare indietro e
              modificarle.
            </p>
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
