"use client";
import { useEffect, useRef, useState } from "react";
import { MultiChoiceStep } from "../choice-options";
import type { Calibration } from "../journey-types";
import {
  type FreeLessonView,
  percent,
  useResource,
} from "../_account/account-data";
import {
  AccountScreen,
  AccountTopBar,
  PillButton,
  PillLink,
} from "../_account/account-shell";
import {
  closedUnconsolidated,
  definedAreas,
  isClosed,
  isConsolidated,
  microTestOpen,
  useAccountJourney,
} from "../_account/calibration-state";
import { DarkQuestion, SingleOptions } from "../_account/dark-question";
import { REVEAL_HREF } from "../_account/next-step";
import { MiniSpider } from "../_account/spiders";
import { HexPrep } from "../_account/assessment-hex";
import { ProvisionalReady } from "../_account/provisional-ready";

type Round = NonNullable<Calibration["round"]>;
type Answers = Record<string, string | string[]>;
/** Fasi del ciclo della demo PF10: esagono, coppia, calcolo, risultato. */
type Cycle = "prep" | "questions" | "calc" | "result";

/** Round di domande dell'AI, una alla volta nella veste dell'assessment. */
function RoundQuestions({
  round,
  areaName,
  busy,
  error,
  draft,
  onClose,
  onSubmit,
}: {
  round: Round;
  areaName: (id: string) => string;
  busy: boolean;
  /** Invio non riuscito: domanda e scelte restano, si può riprovare. */
  error: string;
  /** Risposte non inviate: si riparte dall'ultima domanda con le scelte. */
  draft: Answers | null;
  onClose: () => void;
  onSubmit: (answers: Answers) => void;
}) {
  const [answers, setAnswers] = useState<Answers>(draft ?? round.answers ?? {});
  const [index, setIndex] = useState(draft ? round.questions.length - 1 : 0);
  const q = round.questions[index];
  const last = index === round.questions.length - 1;
  const next = (value: string | string[]) => {
    const updated = { ...answers, [q.id]: value };
    setAnswers(updated);
    if (last) onSubmit(updated);
    else setIndex(index + 1);
  };
  return (
    <DarkQuestion
      kicker={
        round.action === "REQUEST_CLARIFICATION"
          ? `Un chiarimento · ${areaName(q.areaId)}`
          : areaName(q.areaId)
      }
      title={q.text}
      progress={index}
      total={round.questions.length}
      onBack={busy ? undefined : index ? () => setIndex(index - 1) : onClose}
    >
      {q.multiple ? (
        <MultiChoiceStep
          key={q.id}
          options={q.options}
          initial={answers[q.id]}
          busy={busy}
          onSubmit={(value) => next(value)}
        />
      ) : (
        <SingleOptions
          options={q.options}
          selected={answers[q.id]}
          busy={busy}
          onSelect={(value) => next(String(value))}
        />
      )}
      {error && !busy && (
        <>
          <p className="pf-acc-error" role="alert">
            Risposte non inviate: {error} Le tue scelte sono ancora qui.
          </p>
          {last && (
            <PillButton tone="lime" onClick={() => onSubmit(answers)}>
              Riprova l’invio
            </PillButton>
          )}
        </>
      )}
    </DarkQuestion>
  );
}

const LESSON_CHOICE = /lezione gratuita/i;

/**
 * Stato della calibrazione: quanto ti conosciamo rispetto alla soglia, area
 * per area, e il prossimo passo. «Continua la calibrazione» apre il ciclo
 * della demo PF10: l'esagono mentre l'AI scrive la coppia di domande, le due
 * risposte, il calcolo e il risultato aggiornato, da cui si continua o si
 * esce. Il micro-test non fa parte del ciclo. Si continua anche con R
 * consolidata o la lezione in attesa; la calibrazione si chiude con la
 * lezione svolta, con la scelta degli scenari o alla scadenza.
 */
export default function CalibrationPage() {
  const { journey: j, error, busy, action, refresh } = useAccountJourney();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const answering = cycle === "questions";
  // Round inviato e accettato dal server: si attende il suo esito.
  const [sent, setSent] = useState<string | null>(null);
  const c = j?.calibration ?? null;
  const evaluation = j?.evaluation ?? null;
  const round = c?.round ?? null;
  const closed = isClosed(c);
  const consolidated = isConsolidated(c);
  const expiredWeak = closedUnconsolidated(c);
  const lesson = useResource<FreeLessonView>("/athlete-journey/free-lesson");
  const phase = lesson.data?.enabled ? lesson.data.phase : null;
  const lessonPending =
    c?.status === "FREE_LESSON_VALIDATION" ||
    phase === "REQUESTED" ||
    phase === "ASSIGNED";
  // Il passo scelto dall'AI è un micro-test: si fa nella scheda Coach.
  const toMicroTest = answering && microTestOpen(c);
  useEffect(() => {
    if (toMicroTest) window.location.assign("/journey/coach");
  }, [toMicroTest]);
  // Il round inviato è ancora in valutazione presso un'altra richiesta:
  // si aspetta e si rilegge, senza reinviare le risposte.
  const waiting =
    sent !== null && round?.id === sent && round.status === "EVALUATING";
  // Risposte inviate e non accettate: tornano nella domanda per riprovare.
  const [draft, setDraft] = useState<Answers | null>(null);
  // L'esagono gira mentre l'AI valuta; poi il risultato aggiornato.
  const send = async (roundId: string, answers: Answers) => {
    setCycle("calc");
    const ok = await action("calibration/answers", { roundId, answers });
    setDraft(ok ? null : answers);
    if (ok) setSent(roundId);
    setCycle(ok ? "result" : stalled ? null : "questions");
  };
  const areaName = (id: string) =>
    evaluation?.drivers.find((d) => d.id === id)?.name ?? "Calibrazione";
  // Round rimasto in valutazione (processo interrotto): si rimanda la
  // valutazione con le risposte già fissate, che il server non cambia.
  const stalled = round?.status === "EVALUATING" ? round : null;
  // Nuovo blocco: l'esagono gira finché l'AI non ha scritto la coppia.
  const next = async () => {
    if (stalled) return send(stalled.id, stalled.answers ?? {});
    if (microTestOpen(c)) return window.location.assign("/journey/coach");
    if (round?.status === "OPEN") return setCycle("questions");
    setCycle("prep");
    if (await action("calibration/round")) setCycle("questions");
  };
  // R consolidata: l'atleta chiude la calibrazione e sceglie lo scenario.
  const finish = async () => {
    if (await action("calibration/finish")) window.location.assign(REVEAL_HREF);
  };
  // Dal profilo provvisorio («Continua la calibrazione») si entra nel ciclo.
  const autostart = useRef(false);
  useEffect(() => {
    if (autostart.current || !c) return;
    autostart.current = true;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("ciclo")) return;
    url.searchParams.delete("ciclo");
    window.history.replaceState(null, "", url.pathname + url.search);
    if (!isClosed(c)) void next();
  });
  if (cycle === "prep")
    return (
      <HexPrep
        title="Preparo le tue domande."
        sub="Due domande sulle aree che conosciamo meno."
        areas={evaluation?.drivers.length}
        error={busy ? undefined : error || undefined}
        onRetry={busy ? undefined : () => void next()}
      />
    );
  if (cycle === "calc")
    return (
      <HexPrep
        title="Sto calcolando la tua performance."
        sub="Aggiorno lo Spider con le nuove risposte."
        areas={evaluation?.drivers.length}
      />
    );
  if (answering && round && !microTestOpen(c) && round.status === "OPEN")
    return (
      <RoundQuestions
        key={round.id}
        round={round}
        areaName={areaName}
        busy={busy}
        error={error}
        draft={draft}
        onClose={() => setCycle(sent ? "result" : null)}
        onSubmit={(answers) => void send(round.id, answers)}
      />
    );
  // Risultato del blocco, come nella demo: si continua o si esce salvando.
  if (cycle === "result" && evaluation && c && !waiting)
    return (
      <ProvisionalReady
        evaluation={evaluation}
        calibration={c}
        kicker={
          c.ruleMet
            ? "Calibrazione sufficiente"
            : `Blocco ${c.roundsCompleted} completato`
        }
        title={
          c.ruleMet
            ? "Ti conosco abbastanza per partire."
            : "Il tuo profilo prende forma."
        }
        onContinue={isClosed(c) || busy ? undefined : () => void next()}
        extra={
          isClosed(c) ? (
            <PillLink href={REVEAL_HREF} tone="lime">
              Vedi dove puoi arrivare
            </PillLink>
          ) : c.canFinish ? (
            <PillButton
              tone="outline"
              disabled={busy}
              onClick={() => void finish()}
            >
              Vai ai tuoi scenari
            </PillButton>
          ) : c.ruleMet && phase === "ELIGIBLE" ? (
            <a className="pf-acc-link" href="/journey/circolo">
              Scegli il circolo per la lezione gratuita
            </a>
          ) : null
        }
      />
    );
  const rule = c?.consolidationRule;
  const confidence = evaluation?.overallConfidence ?? 0;
  const defined = definedAreas(c, evaluation?.drivers ?? []);
  const footer = waiting ? (
    <PillButton
      tone="lime"
      disabled={busy}
      onClick={() => void refresh().catch(() => undefined)}
    >
      Aggiorna lo stato
    </PillButton>
  ) : closed ? (
    <PillLink href={REVEAL_HREF} tone="lime">
      Vedi dove puoi arrivare
    </PillLink>
  ) : (
    <>
      <PillButton tone="lime" disabled={busy || !c} onClick={() => void next()}>
        {busy
          ? "Prepariamo il prossimo passo…"
          : stalled
            ? "Completa la valutazione"
            : microTestOpen(c)
              ? "Fai il micro-test"
              : "Continua la calibrazione"}
      </PillButton>
      {c?.canFinish && (
        <PillButton
          tone="outline"
          disabled={busy}
          onClick={() => void finish()}
        >
          Vai ai tuoi scenari
        </PillButton>
      )}
      {lessonPending && (
        <a className="pf-acc-link" href="/journey/circolo">
          La tua lezione gratuita
        </a>
      )}
    </>
  );
  return (
    <AccountScreen
      top={
        <AccountTopBar title="Stato di calibrazione" back="/journey/profilo" />
      }
      footer={footer}
    >
      <h1 className="pf-acc-title">
        {expiredWeak
          ? "La fase gratuita è finita."
          : closed
            ? "La tua R è consolidata."
            : consolidated
              ? "La tua R è consolidata. Puoi continuare a calibrare."
              : "La calibrazione si chiude quando ti conosciamo abbastanza."}
      </h1>
      {expiredWeak && (
        <p className="pf-acc-warning" role="status">
          <strong>Attenzione: la tua R è una stima poco affidabile.</strong> La
          fase gratuita è scaduta prima che ti conoscessimo abbastanza. Gli
          scenari a 3, 6 e 12 mesi partono da questa stima e potranno cambiare
          molto quando inizierai il percorso.
        </p>
      )}
      {error && (
        <p className="pf-acc-error" role="alert">
          {error}
          {LESSON_CHOICE.test(error) && (
            <>
              {" "}
              <a href="/journey/circolo">Scegli il circolo</a>
            </>
          )}
        </p>
      )}
      {waiting && (
        <p role="status">
          Le tue risposte sono salvate e la valutazione è ancora in corso.
          Aggiorna tra qualche istante: non serve rispondere di nuovo.
        </p>
      )}
      {stalled && !waiting && (
        <p role="status">
          Le tue risposte sono salvate, ma la valutazione si è interrotta.
          Completala: usiamo le risposte che hai già dato.
        </p>
      )}
      {evaluation && c && (
        <>
          <div className="pf-acc-calib-head">
            <MiniSpider
              real={evaluation.drivers.map((d) => d.score)}
              scale={evaluation.scale}
              provisional={!consolidated}
              size={120}
            />
            <div>
              <span className="pf-acc-badge">
                {consolidated ? "R consolidata" : "Profilo provvisorio"}
              </span>
              <p>
                {closed
                  ? "Il prossimo passo sono i tuoi scenari a 3, 6 e 12 mesi."
                  : `Sei al giorno ${c.day} di calibrazione. ${
                      c.daysLeft === 1
                        ? "Manca 1 giorno"
                        : `Mancano ${c.daysLeft} giorni`
                    } alla fine della fase gratuita.`}
              </p>
            </div>
          </div>
          <div className="pf-acc-progress">
            <div className="pf-acc-row">
              <span className="pf-acc-kicker">
                Verso la conoscenza sufficiente
              </span>
              <b>{percent(confidence)}</b>
            </div>
            <div
              className="pf-acc-bar is-dark"
              role="progressbar"
              aria-label="Confidenza complessiva"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={confidence}
            >
              <span style={{ width: `${confidence}%` }} />
              {rule?.minOverallConfidence != null && (
                <i style={{ left: `${rule.minOverallConfidence}%` }} />
              )}
            </div>
            <small className="pf-acc-note">
              Soglia:{" "}
              {rule?.minOverallConfidence == null
                ? "da definire"
                : percent(rule.minOverallConfidence)}
            </small>
          </div>
          {lessonPending && (
            <p role="status">
              Hai chiesto la lezione gratuita: la calibrazione si chiude dopo il
              feedback del coach del circolo. Intanto puoi continuare a
              rispondere.
            </p>
          )}
          {!closed && c.ruleMet && phase === "ELIGIBLE" && (
            <p role="status">
              Hai sbloccato la lezione gratuita: richiedila, oppure dicci che
              preferisci non farla, per vedere i tuoi scenari.{" "}
              <a href="/journey/circolo">Scegli il circolo</a>
            </p>
          )}
          <ul className="pf-acc-areas">
            {evaluation.drivers.map((d) => {
              const enough = defined.has(d.id);
              return (
                <li key={d.id}>
                  <span>{d.name}</span>
                  <small className={enough ? "is-ok" : undefined}>
                    {enough ? "Sufficiente" : "Provvisoria"}
                  </small>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {j && !evaluation && (
        <p>
          La calibrazione parte dopo l’assessment: prima le domande iniziali,
          poi quelle mirate sulle aree che conosciamo meno.
        </p>
      )}
    </AccountScreen>
  );
}
