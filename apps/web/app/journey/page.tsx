"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PF4Shell } from "../start/pf4-shell";
import { ConsentStep } from "./consent-step";
import { DurationStep, PerformanceResult } from "./performance-result";
import { useJourney } from "./use-journey";
import { MultiChoiceStep } from "./choice-options";
import { mixedOptions } from "./mix-order";
import { NumberChoiceStep, numericOptions } from "./number-choice";
import { AccountHome } from "./_account/account-home";
import { DarkQuestion, SingleOptions } from "./_account/dark-question";
import { type HexFailure, HexPrep, HexSide } from "./_account/assessment-hex";
import { useAutoRetry } from "./_account/auto-retry";
import { ProvisionalReady } from "./_account/provisional-ready";
import { useResource } from "./_account/account-data";
import {
  AVAILABILITY_PATH,
  AvailabilityStep,
  type AvailabilityForm,
} from "./_account/availability-step";
import type { Journey } from "./journey-types";
import "./journey.css";
/** Durata minima di un giro d'animazione, come nella demo PF10. */
const PREP_MS = 2600;
const SIDE_MS = 2300;
const LAST_MS = 3000;
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
    attempt,
    accept,
    refresh,
  } = useJourney();
  // L'AI che scrive le domande o valuta le risposte si ritenta da sola.
  const { retry, run } = useAutoRetry();
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
  // Dopo l'ultima risposta la valutazione parte da sola, come nella demo PF10
  // (decisione D5): niente conferma intermedia. Una volta sola per visita;
  // se il server ha un problema si ritenta da soli, poi si esce con «Annulla».
  const complete = j?.phase === "ASSESSMENT" && !!j.assessmentComplete;
  const evaluated = useRef(false);
  useEffect(() => {
    if (!complete || busy || evaluated.current) return;
    evaluated.current = true;
    void run(() => attempt("evaluate"));
  }, [complete, busy, attempt, run]);
  // Domande a coppie (demo PF10): finita una coppia l'AI scrive la successiva,
  // da sola e una volta per coppia, con i nuovi tentativi automatici.
  const assessing = j?.phase === "ASSESSMENT" || j?.phase === "PROCESSING";
  const pending = assessing && !!j?.questionsPending;
  const written = j?.questions?.length ?? 0;
  const asked = useRef(-1);
  const [prepHeld, setPrepHeld] = useState(false);
  useEffect(() => {
    if (j?.phase !== "ASSESSMENT" || !pending || busy) return;
    if (asked.current === written) return;
    asked.current = written;
    // «Preparo le tue domande» resta almeno un giro anche se l'AI è veloce.
    if (!written) {
      setPrepHeld(true);
      window.setTimeout(() => setPrepHeld(false), PREP_MS);
    }
    void run(() => attempt("questions"));
  }, [j?.phase, pending, busy, written, attempt, run]);
  // Passaggio d'area: chiusa una coppia, il lato dell'esagono si disegna per
  // almeno un giro e ricomincia finché l'AI non ha la coppia successiva (o,
  // dopo l'ultima area, la valutazione).
  const names = j?.driverList?.map((d) => d.name) ?? [];
  const [side, setSide] = useState<{ index: number; held: boolean } | null>(
    null,
  );
  const answer = async (value: unknown) => {
    if (!j || !q) return;
    const next = j.questions[j.currentQuestion + 1];
    const index = (j.driverList ?? []).findIndex((d) => d.id === q.areaId);
    const closes = index >= 0 && (!next || next.areaId !== q.areaId);
    if (closes) {
      setSide({ index, held: true });
      window.setTimeout(
        () => setSide((s) => (s?.index === index ? { ...s, held: false } : s)),
        index === names.length - 1 ? LAST_MS : SIDE_MS,
      );
    }
    if (!(await action("answer", { questionId: q.id, value })) && closes)
      setSide(null);
  };
  const finishing = assessing && !!j?.assessmentComplete;
  // AI ferma: si ritenta da soli; finiti i tentativi, o con un errore che un
  // tentativo non risolve, «Annulla» riporta al profilo.
  const failure = (held = false): HexFailure => ({
    retry,
    error:
      held || retry.phase !== "idle" || busy ? undefined : error || undefined,
    onCancel: busy
      ? undefined
      : () => window.location.assign("/journey/profilo"),
    onRetry: busy
      ? undefined
      : () => void run(() => attempt(finishing ? "evaluate" : "questions")),
  });
  const areasWritten = new Set(j?.questions?.map((x) => x.areaId)).size;
  // Prima dell'assessment: la prima volta il benvenuto (foto, Spider, regalo,
  // app), poi la home, che è anche dove riapre l'app installata.
  const intro = j?.phase === "ASSESSMENT_INTRO";
  const welcome = intro && !j.welcomeCompleted;
  useEffect(() => {
    if (welcome) window.location.replace("/benvenuto/foto");
  }, [welcome]);
  // Già abbonato ma senza giorni e durata: il programma non parte senza.
  const subscribed = j?.phase === "SUBSCRIBED";
  const availability = useResource<AvailabilityForm>(
    subscribed ? AVAILABILITY_PATH : null,
  );
  if (welcome) return null;
  if (subscribed && availability.data?.ready === false)
    return (
      <AvailabilityStep
        lead="Ci manca solo questo per preparare il tuo programma."
        action="Crea il mio programma"
        onSaved={(form) => {
          availability.setData(form);
          void action("program");
        }}
      />
    );
  // Dopo il benvenuto la home è la stessa della fase gratuita (S04 della
  // demo PF10), con «Profilo da iniziare» e la scheda dell'assessment.
  if (intro)
    return (
      <AccountHome
        journey={j}
        busy={busy}
        error={error || undefined}
        onStart={() => void action("start")}
      />
    );
  // Lato dell'area appena chiusa, o l'esagono completo mentre l'AI calcola.
  if (side && (side.held || pending || finishing))
    return (
      <HexSide names={names} index={side.index} failure={failure(side.held)} />
    );
  // Prima coppia: l'esagono si disegna finché le domande non sono pronte.
  if ((pending && !written) || (prepHeld && assessing))
    return (
      <HexPrep
        title="Preparo le tue domande."
        sub="Sei aree, un punto di partenza."
        areas={names.length || 6}
        failure={failure(prepHeld)}
      />
    );
  // Ripresa a metà (ricarica, altra scheda): stessa attesa, senza lato da tenere.
  if (pending || finishing || j?.phase === "PROCESSING")
    return (
      <HexSide
        names={names}
        index={pending ? areasWritten - 1 : names.length - 1}
        failure={failure()}
      />
    );
  if (j?.phase === "EVALUATION" && j.evaluation)
    return ready ? (
      <ProvisionalReady evaluation={j.evaluation} calibration={j.calibration} />
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
        {q.multiple ? (
          <MultiChoiceStep
            key={q.id}
            options={mixedOptions(q.options, q.id)}
            initial={j.answers[q.id]}
            busy={busy}
            onSubmit={(value) => answer(value)}
          />
        ) : numericOptions(q) ? (
          <NumberChoiceStep
            key={q.id}
            options={q.options}
            selected={j.answers[q.id]}
            busy={busy}
            onSubmit={(value) => answer(value)}
          />
        ) : (
          <SingleOptions
            options={mixedOptions(q.options, q.id)}
            selected={j.answers[q.id]}
            busy={busy}
            onSelect={(value) => void answer(value)}
          />
        )}
      </DarkQuestion>
    );
  // L'intro PF5 e chiara, come /start; il questionario resta sullo stage scuro.
  const assessment = j?.phase === "ASSESSMENT";
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
