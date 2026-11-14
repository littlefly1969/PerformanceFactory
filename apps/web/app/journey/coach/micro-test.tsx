"use client";
import { useEffect, useRef, useState } from "react";
import type { Calibration } from "../journey-types";
import {
  type HomeMicroTest,
  type MicroTestFilter,
  type SituationFeedback,
  postJson,
} from "../_account/account-data";
import { HexOrb } from "../_account/account-home";
import { FILTER_TEXT, FilterBar } from "./micro-test-filters";
import { Practical } from "./micro-test-practical";
import { MicroTestResultView } from "./micro-test-result";
import { LETTERS, Pill, Working } from "./micro-test-ui";
import "./micro-test.css";

type Round = NonNullable<Calibration["round"]>;
type Ready = NonNullable<HomeMicroTest["test"]>;
type History = HomeMicroTest["history"];
type FilterState = NonNullable<HomeMicroTest["filters"]>[number];

const DAYS = ["L", "M", "M", "G", "V", "S", "D"];
const ARC = 2 * Math.PI * 80;

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
  });

/** Archivio del filtro: i micro-test già fatti, dal più recente. */
function HistoryList({ history }: { history: History }) {
  if (!history.length) return null;
  return (
    <div className="pf-mt-history">
      <span className="pf-mt-kicker">Micro-test precedenti</span>
      <ul>
        {history.map((h) => (
          <li key={h.roundId}>
            <span>{dayLabel(h.completedAt)}</span>
            <b>{h.title}</b>
            <em>+{h.points} pt</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Scheda iniziale, come la demo: area e durata, l'anello dei giorni di fila
 * con la settimana, il titolo e i micro-test già fatti del filtro.
 */
function Intro({
  home,
  test,
  history,
  onStart,
}: {
  home: HomeMicroTest;
  test: Ready;
  history: History;
  onStart: () => void;
}) {
  const { days, week } = home.streak;
  const dash = `${((ARC * Math.min(7, days)) / 7).toFixed(1)} ${ARC.toFixed(1)}`;
  return (
    <section className="pf-mt" aria-labelledby="pf-mt-title">
      <div className="pf-mt-chips">
        <span className="is-lime">Oggi</span>
        <span>{test.area.name}</span>
        {test.durationMinutes && <span>{test.durationMinutes} min</span>}
      </div>
      <div className="pf-mt-hero">
        <div className="pf-mt-streak">
          <span className="pf-mt-glow" aria-hidden="true" />
          <svg viewBox="0 0 210 210" aria-hidden="true">
            <circle className="pf-mt-orbit" cx="105" cy="105" r="101" />
            <circle className="pf-mt-track" cx="105" cy="105" r="80" />
            <circle
              className="pf-mt-arc"
              cx="105"
              cy="105"
              r="80"
              strokeDasharray={dash}
              transform="rotate(-90 105 105)"
            />
          </svg>
          <div className="pf-mt-streak-n">
            <strong>{days}</strong>
            <small>{days === 1 ? "giorno di fila" : "giorni di fila"}</small>
          </div>
        </div>
        <ol className="pf-mt-week" aria-label="Questa settimana">
          {DAYS.map((d, i) => (
            <li
              key={i}
              className={week[i] ? "is-on" : undefined}
              style={{ animationDelay: `${0.5 + i * 0.08}s` }}
            >
              <i aria-hidden="true" />
              <span>{d}</span>
            </li>
          ))}
        </ol>
        <h2 id="pf-mt-title" className="pf-mt-hero-title">
          {test.title}
        </h2>
      </div>
      <Pill className="pf-mt-pill is-lime is-pulse" onClick={onStart}>
        Inizia il micro-test
      </Pill>
      <HistoryList history={history} />
    </section>
  );
}

/** Segmenti: fatti in lime, quello corrente bianco, gli altri spenti. */
function Steps({ total, current }: { total: number; current: number }) {
  return (
    <div className="pf-mt-steps" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={
            i < current ? "is-done" : i === current ? "is-current" : ""
          }
        />
      ))}
    </div>
  );
}

/**
 * Situazioni di gioco: l'atleta sceglie, la risposta si fissa e arriva la
 * spiegazione del coach sulla scelta e sulla risposta corretta.
 */
function Situations({
  round,
  onDone,
}: {
  round: Round;
  onDone: (answers: Record<string, string>) => Promise<void>;
}) {
  const initial: Record<string, SituationFeedback> = {};
  for (const q of round.questions)
    if (q.microTest?.feedback) initial[q.id] = q.microTest.feedback;
  const [feedback, setFeedback] = useState(initial);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      Math.min(
        round.questions.length - 1,
        round.questions.findIndex((q) => !initial[q.id]),
      ),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const q = round.questions[index];
  const situation = q.microTest!.situation!;
  const shown = feedback[q.id];
  const last = index === round.questions.length - 1;
  const choose = async (value: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await postJson<SituationFeedback>(
        "/athlete-journey/calibration/situation",
        { roundId: round.id, questionId: q.id, value },
      );
      setFeedback({ ...feedback, [q.id]: result });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Risposta non salvata.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="pf-mt" key={q.id}>
      <Steps total={round.questions.length} current={index} />
      <span className="pf-mt-kicker is-spaced">
        {String(index + 1).padStart(2, "0")} /{" "}
        {String(situation.total).padStart(2, "0")} · {situation.label}
      </span>
      <h2 className="pf-mt-question">{q.text}</h2>
      {situation.context && <p className="pf-mt-muted">{situation.context}</p>}
      <div className="pf-mt-answers">
        {q.options.map((o, k) => {
          const chosen = shown?.value === o.value;
          const correct = shown?.correctValue === o.value;
          const text =
            shown && (chosen || correct)
              ? (shown.feedback?.[o.value] ?? "")
              : "";
          return (
            <button
              type="button"
              key={o.value}
              disabled={busy || !!shown}
              aria-pressed={chosen}
              className={`pf-mt-answer${shown ? " is-answered" : ""}${correct && shown ? " is-correct" : ""}${chosen && !correct ? " is-wrong" : ""}`}
              onClick={() => void choose(o.value)}
            >
              <span className="pf-mt-answer-row">
                <span className="pf-mt-letter">{LETTERS[k]}</span>
                <b>{o.label}</b>
                {shown && correct && <em>corretta</em>}
                {shown && chosen && !correct && <em>no</em>}
              </span>
              {text && <span className="pf-mt-why">{text}</span>}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="pf-mt-error" role="alert">
          {error}
        </p>
      )}
      {shown && (
        <Pill
          disabled={busy}
          onClick={() => {
            if (!last) return setIndex(index + 1);
            setBusy(true);
            void onDone(
              Object.fromEntries(
                Object.entries(feedback).map(([id, f]) => [id, f.value]),
              ),
            ).finally(() => setBusy(false));
          }}
        >
          {last ? "Vedi il risultato" : "Avanti"}
        </Pill>
      )}
    </section>
  );
}

/** Riletture dello stato mentre un'altra scheda prepara il micro-test. */
const PREPARE_POLL_MS = 3000;
const PREPARE_POLLS = 30;

/** Valutazione interrotta: le risposte sono salvate, si rilancia l'esito. */
function StalledEvaluation({ onRetry }: { onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="pf-mt pf-mt-working" role="status">
      <HexOrb size={96} tone="lime" />
      <h2 className="pf-mt-hero-title">Le tue risposte sono salvate.</h2>
      <p className="pf-mt-muted">
        La valutazione del micro-test si è interrotta. Riprova: usiamo le
        risposte che hai già dato.
      </p>
      <Pill
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onRetry().finally(() => setBusy(false));
        }}
      >
        {busy ? "Sto calcolando…" : "Completa la valutazione"}
      </Pill>
    </section>
  );
}

/** Il filtro ha finito i micro-test di oggi: si torna domani. */
function DoneToday({
  state,
  history,
}: {
  state: FilterState;
  history: History;
}) {
  return (
    <section className="pf-mt pf-mt-working pf-mt-done-day" role="status">
      <HexOrb size={96} tone="lime" />
      <h2 className="pf-mt-hero-title">Per oggi hai finito.</h2>
      <p className="pf-mt-muted">
        Hai fatto i {state.limit} micro-test {FILTER_TEXT[state.filter]} di
        oggi. Domani ne trovi di nuovi; intanto puoi provare un altro tipo.
      </p>
      <HistoryList history={history} />
    </section>
  );
}

/** Stato del filtro; con un server che non li distingue vale il riepilogo. */
const stateOf = (home: HomeMicroTest, filter: MicroTestFilter): FilterState =>
  home.filters?.find((f) => f.filter === filter) ?? {
    filter,
    status:
      home.status === "EVALUATING"
        ? "EVALUATING"
        : home.test
          ? "READY"
          : "PREPARING",
    usedToday: 0,
    limit: 0,
    test: home.test,
  };

/**
 * Micro-test della home, fuori dal ciclo di calibrazione, per filtro:
 * Teorici, Pratici sul campo e fuori dal campo. Ogni filtro ha il suo test
 * di oggi; se manca e ci sono ancora posti l'AI lo prepara mentre l'esagono
 * respira. Dopo le risposte il calcolo, poi il risultato.
 */
export function MicroTestTab({
  home,
  hasEvaluation,
  resultRound,
  saved,
  onPrepare,
  onRefresh,
  onAnswered,
  onSkip,
}: {
  home: HomeMicroTest | null | undefined;
  hasEvaluation: boolean;
  resultRound: string | null;
  /** Round il cui esito è stato appena accettato dal server. */
  saved: string | null;
  /** Chiede al server di preparare il micro-test del filtro se manca. */
  onPrepare: (filter: MicroTestFilter) => Promise<void>;
  /** Rilegge lo stato del micro-test senza chiederne la preparazione. */
  onRefresh: () => Promise<void>;
  onAnswered: (
    roundId: string,
    answers: Record<string, string>,
  ) => Promise<void>;
  onSkip: (roundId: string) => Promise<void>;
}) {
  // Il filtro parte da quello del test pronto in home, poi lo sceglie l'atleta.
  const [chosen, setChosen] = useState<MicroTestFilter | null>(null);
  const [practical, setPractical] = useState<"ON_COURT" | "OFF_COURT">(
    "ON_COURT",
  );
  if (chosen === null && home) setChosen(home.test?.filter ?? "THEORY");
  const filter = chosen ?? "THEORY";
  const [started, setStarted] = useState(false);
  const [sending, setSending] = useState(false);
  const [prepError, setPrepError] = useState("");
  // Richiesta di preparazione in corso e riletture fatte mentre la prepara
  // un'altra scheda (il server risponde PREPARING senza aspettarla).
  const [asking, setAsking] = useState(false);
  const [polls, setPolls] = useState(0);
  const asked = useRef(new Set<MicroTestFilter>());
  const state = home ? stateOf(home, filter) : null;
  const preparing = state?.status === "PREPARING";
  const prepare = () => {
    asked.current.add(filter);
    setPrepError("");
    setPolls(0);
    setAsking(true);
    onPrepare(filter)
      .catch((e: unknown) =>
        setPrepError(e instanceof Error ? e.message : "Riprova."),
      )
      .finally(() => setAsking(false));
  };
  // Manca il micro-test del filtro: lo si chiede una volta, anche mentre si
  // legge il risultato del precedente, così il prossimo è pronto al ritorno.
  useEffect(() => {
    if (!preparing) {
      asked.current.delete(filter);
      return;
    }
    if (!asked.current.has(filter)) prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparing, filter]);
  // Ancora PREPARING dopo la richiesta: lo sta preparando un'altra scheda.
  // Si rilegge lo stato a intervalli, poi si offre «Riprova».
  const waiting =
    preparing && asked.current.has(filter) && !asking && !prepError;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      if (polls >= PREPARE_POLLS) {
        setPrepError("La preparazione sta richiedendo più del solito.");
        return;
      }
      onRefresh()
        .catch(() => undefined)
        .finally(() => setPolls((n) => n + 1));
    }, PREPARE_POLL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, polls]);
  const choose = (next: MicroTestFilter) => {
    if (next === filter) return;
    if (next !== "THEORY") setPractical(next);
    setChosen(next);
    setStarted(false);
    setPrepError("");
    setPolls(0);
  };
  const test = state?.test ?? null;
  const stalled =
    state?.status === "EVALUATING" && test && !sending ? test.round : null;
  if (resultRound && !(stalled?.id === resultRound && saved !== resultRound))
    return <MicroTestResultView roundId={resultRound} />;
  if (sending) return <Working title="Sto calcolando la tua performance." />;
  if (stalled)
    return (
      <StalledEvaluation
        onRetry={() =>
          onAnswered(
            stalled.id,
            Object.fromEntries(
              Object.entries(stalled.answers ?? {}).map(([id, value]) => [
                id,
                String(value),
              ]),
            ),
          )
        }
      />
    );
  if (!hasEvaluation)
    return (
      <section className="pf-mt pf-mt-working">
        <h2 className="pf-mt-hero-title">
          Il primo micro-test arriva dopo l’assessment.
        </h2>
        <p className="pf-mt-muted">
          Con le prime risposte capiamo dove una prova breve ci dice di più.
        </p>
      </section>
    );
  if (home === undefined) return null;
  if (!home || home.status === "UNAVAILABLE" || !state)
    return (
      <section className="pf-mt pf-mt-working">
        <h2 className="pf-mt-hero-title">La fase gratuita è conclusa.</h2>
        <p className="pf-mt-muted">
          I micro-test aggiornavano il tuo profilo provvisorio: ora il profilo è
          chiuso e li ritrovi con il coach AI.
        </p>
      </section>
    );
  const history = home.history.filter((h) => !h.filter || h.filter === filter);
  const bar = (
    <FilterBar filter={filter} practical={practical} onChange={choose} />
  );
  if (state.status === "DONE_TODAY")
    return (
      <>
        {bar}
        <DoneToday state={state} history={history} />
      </>
    );
  if (!test || state.status === "PREPARING")
    return (
      <>
        {bar}
        <Working
          title="Preparo il tuo micro-test."
          error={prepError}
          onRetry={prepare}
        />
      </>
    );
  const round = test.round;
  const answered = round.questions.some((q) => q.microTest?.feedback);
  if (!started && !answered)
    return (
      <>
        {bar}
        <Intro
          home={home}
          test={test}
          history={history}
          onStart={() => setStarted(true)}
        />
      </>
    );
  const done = async (answers: Record<string, string>) => {
    setSending(true);
    try {
      await onAnswered(round.id, answers);
    } finally {
      setSending(false);
    }
  };
  return test.format === "SITUATIONAL" ? (
    <Situations round={round} onDone={done} />
  ) : (
    <Practical
      round={round}
      onDone={done}
      onSkip={() => onSkip(round.id)}
      onExit={() => setStarted(false)}
    />
  );
}
