"use client";
import { useEffect, useState } from "react";
import { MultiChoiceStep } from "../choice-options";
import type { Calibration } from "../journey-types";
import { percent } from "../_account/account-data";
import {
  AccountScreen,
  AccountTopBar,
  PillButton,
  PillLink,
} from "../_account/account-shell";
import {
  isClosed,
  microTestOpen,
  useAccountJourney,
} from "../_account/calibration-state";
import { DarkQuestion, SingleOptions } from "../_account/dark-question";
import { summaryHref } from "../_account/next-step";
import { MiniSpider } from "../_account/spiders";

type Round = NonNullable<Calibration["round"]>;
type Answers = Record<string, string | string[]>;

/** Round di domande dell'AI, una alla volta nella veste dell'assessment. */
function RoundQuestions({
  round,
  areaName,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  round: Round;
  areaName: (id: string) => string;
  busy: boolean;
  /** Invio non riuscito: domanda e scelte restano, si può riprovare. */
  error: string;
  onClose: () => void;
  onSubmit: (answers: Answers) => void;
}) {
  const [answers, setAnswers] = useState<Answers>(round.answers ?? {});
  const [index, setIndex] = useState(0);
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
      {busy && <p role="status">Aggiorniamo la tua valutazione…</p>}
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
 * per area, e il prossimo passo scelto dall'AI (domande o micro-test).
 * La calibrazione si chiude solo con la regola di consolidamento.
 */
export default function CalibrationPage() {
  const { journey: j, error, busy, action, refresh } = useAccountJourney();
  const [answering, setAnswering] = useState(false);
  // Round inviato e accettato dal server: si attende il suo esito.
  const [sent, setSent] = useState<string | null>(null);
  const c = j?.calibration ?? null;
  const evaluation = j?.evaluation ?? null;
  const round = c?.round ?? null;
  const closed = isClosed(c);
  const rule = c?.consolidationRule;
  const areaRule =
    rule?.minAreaConfidence ?? rule?.minOverallConfidence ?? null;
  // Il passo scelto dall'AI è un micro-test: si fa nella scheda Coach.
  const toMicroTest = answering && microTestOpen(c);
  useEffect(() => {
    if (toMicroTest) window.location.assign("/journey/coach");
  }, [toMicroTest]);
  // Il round inviato è ancora in valutazione presso un'altra richiesta:
  // si aspetta e si rilegge, senza reinviare le risposte.
  const waiting =
    sent !== null && round?.id === sent && round.status === "EVALUATING";
  const evaluated = sent !== null && !waiting;
  useEffect(() => {
    // Valutazione aggiornata: si torna al riepilogo, nessun nuovo round.
    if (evaluated) window.location.assign(summaryHref("calibrazione"));
  }, [evaluated]);
  const send = async (roundId: string, answers: Answers) => {
    if (!(await action("calibration/answers", { roundId, answers }))) return;
    setAnswering(false);
    setSent(roundId);
  };
  const areaName = (id: string) =>
    evaluation?.drivers.find((d) => d.id === id)?.name ?? "Calibrazione";

  if (answering && round && !microTestOpen(c) && round.status === "OPEN")
    return (
      <RoundQuestions
        key={round.id}
        round={round}
        areaName={areaName}
        busy={busy}
        error={error}
        onClose={() => setAnswering(false)}
        onSubmit={(answers) => void send(round.id, answers)}
      />
    );

  // Round rimasto in valutazione (processo interrotto): si rimanda la
  // valutazione con le risposte già fissate, che il server non cambia.
  const stalled = round?.status === "EVALUATING" ? round : null;
  const next = async () => {
    if (stalled) return send(stalled.id, stalled.answers ?? {});
    if (microTestOpen(c)) return window.location.assign("/journey/coach");
    if (round?.status === "OPEN") return setAnswering(true);
    if (await action("calibration/round")) setAnswering(true);
  };
  const confidence = evaluation?.overallConfidence ?? 0;
  const footer = evaluated ? null : waiting ? (
    <PillButton
      tone="lime"
      disabled={busy}
      onClick={() => void refresh().catch(() => undefined)}
    >
      Aggiorna lo stato
    </PillButton>
  ) : closed ? (
    <PillLink href="/journey/scenari" tone="lime">
      Vedi dove puoi arrivare
    </PillLink>
  ) : c?.status === "FREE_LESSON_VALIDATION" ? (
    <PillLink href="/journey/circolo" tone="lime">
      La tua lezione gratuita
    </PillLink>
  ) : (
    <PillButton tone="lime" disabled={busy || !c} onClick={() => void next()}>
      {busy
        ? "Prepariamo il prossimo passo…"
        : stalled
          ? "Completa la valutazione"
          : microTestOpen(c)
            ? "Fai il micro-test"
            : "Continua la calibrazione"}
    </PillButton>
  );
  return (
    <AccountScreen
      top={
        <AccountTopBar title="Stato di calibrazione" back="/journey/profilo" />
      }
      footer={footer}
    >
      <h1 className="pf-acc-title">
        {closed
          ? "La tua R è consolidata."
          : "La calibrazione si chiude quando ti conosciamo abbastanza."}
      </h1>
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
      {evaluated && (
        <p role="status">Valutazione aggiornata. Ti portiamo al riepilogo…</p>
      )}
      {evaluation && c && (
        <>
          <div className="pf-acc-calib-head">
            <MiniSpider
              real={evaluation.drivers.map((d) => d.score)}
              scale={evaluation.scale}
              provisional={!closed}
              size={120}
            />
            <div>
              <span className="pf-acc-badge">
                {closed ? "R consolidata" : "Profilo provvisorio"}
              </span>
              <p>
                {closed
                  ? "Il prossimo passo sono i tuoi scenari a 3, 6 e 12 mesi."
                  : `Sei al giorno ${c.day} di calibrazione.`}
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
          {c.status === "FREE_LESSON_VALIDATION" && (
            <p role="status">
              Hai chiesto la lezione gratuita: la tua R si chiude dopo il
              feedback del coach del circolo.
            </p>
          )}
          <ul className="pf-acc-areas">
            {evaluation.drivers.map((d) => {
              const enough = areaRule !== null && d.confidence >= areaRule;
              return (
                <li key={d.id}>
                  <span>{d.name}</span>
                  <small className={enough ? "is-ok" : undefined}>
                    {closed || enough ? "Sufficiente" : "Provvisoria"}
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
