"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Calibration } from "../journey-types";
import {
  type HomeMicroTest,
  type MicroTestResult,
  type SituationFeedback,
  percent,
  postJson,
  useResource,
} from "../_account/account-data";
import { HexOrb } from "../_account/account-home";
import "./micro-test.css";

type Round = NonNullable<Calibration["round"]>;
type Ready = NonNullable<HomeMicroTest["test"]>;

const LETTERS = "ABCDE";
const DAYS = ["L", "M", "M", "G", "V", "S", "D"];
const ARC = 2 * Math.PI * 80;

/** Pulsante a pillola della veste scura: lime pieno o con il bordo. */
function Pill({
  children,
  tone = "lime",
  ...props
}: {
  children: React.ReactNode;
  tone?: "lime" | "outline";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`pf-mt-pill is-${tone}`} {...props}>
      <span>{children}</span>
      {tone === "lime" && <span aria-hidden="true">→</span>}
    </button>
  );
}

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
  });

/**
 * Scheda iniziale, come la demo: area e durata, l'anello dei giorni di fila
 * con la settimana, il titolo e i micro-test già fatti.
 */
function Intro({
  home,
  test,
  onStart,
}: {
  home: HomeMicroTest;
  test: Ready;
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
      {home.history.length > 0 && (
        <div className="pf-mt-history">
          <span className="pf-mt-kicker">Micro-test precedenti</span>
          <ul>
            {home.history.map((h) => (
              <li key={h.roundId}>
                <span>{dayLabel(h.completedAt)}</span>
                <b>{h.title}</b>
                <em>+{h.points} pt</em>
              </li>
            ))}
          </ul>
        </div>
      )}
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

/** Prova pratica: istruzioni, sicurezza e l'esito che riporta l'atleta. */
function Practical({
  round,
  area,
  onDone,
  onSkip,
}: {
  round: Round;
  area: string;
  onDone: (answers: Record<string, string>) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const q = round.questions[0];
  const [value, setValue] = useState<string>();
  const [busy, setBusy] = useState(false);
  const run = (task: () => Promise<void>) => {
    setBusy(true);
    void task().finally(() => setBusy(false));
  };
  return (
    <section className="pf-mt">
      <span className="pf-mt-kicker is-spaced">Prova pratica · {area}</span>
      <h2 className="pf-mt-question">{q.microTest!.title ?? q.text}</h2>
      <p className="pf-mt-muted">{q.microTest!.instructions}</p>
      {q.microTest!.safetyNotes && (
        <p className="pf-mt-muted">
          <strong>Sicurezza:</strong> {q.microTest!.safetyNotes}
        </p>
      )}
      <span className="pf-mt-kicker is-spaced">
        Com’è andata? L’esito lo riporti tu.
      </span>
      <div className="pf-mt-answers">
        {q.options.map((o, k) => (
          <button
            type="button"
            key={o.value}
            disabled={busy}
            aria-pressed={value === o.value}
            className={`pf-mt-answer${value === o.value ? " is-selected" : ""}`}
            onClick={() => setValue(o.value)}
          >
            <span className="pf-mt-answer-row">
              <span className="pf-mt-letter">{LETTERS[k]}</span>
              <b>{o.label}</b>
            </span>
          </button>
        ))}
      </div>
      <Pill
        disabled={busy || value === undefined}
        onClick={() => run(() => onDone({ [q.id]: value! }))}
      >
        Invia l’esito
      </Pill>
      <button
        type="button"
        className="pf-mt-link"
        disabled={busy}
        onClick={() => run(onSkip)}
      >
        Non posso farlo ora
      </button>
    </section>
  );
}

/** Riletture dello stato mentre un'altra scheda prepara il micro-test. */
const PREPARE_POLL_MS = 3000;
const PREPARE_POLLS = 30;

/** Attesa con l'esagono: l'AI prepara il test o valuta le risposte. */
function Working({
  title,
  error,
  onRetry,
}: {
  title: string;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <section className="pf-mt pf-mt-working" role="status">
      <HexOrb size={96} tone="lime" />
      <h2 className="pf-mt-hero-title">{title}</h2>
      {error && (
        <>
          <p className="pf-mt-error" role="alert">
            {error}
          </p>
          {onRetry && <Pill onClick={onRetry}>Riprova</Pill>}
        </>
      )}
    </section>
  );
}

/** Frase di riserva per i test scritti prima delle frasi dell'AI. */
const fallbackVerdict = (r: MicroTestResult) => {
  if (r.total === undefined || r.correct === undefined)
    return "Esito registrato.";
  if (r.correct === r.total) return "Perfetto.";
  return r.correct * 2 >= r.total ? "Ci sei quasi." : "C’è margine.";
};

/** Video del micro-test: il file se c'è, altrimenti il titolo previsto. */
function VideoCard({
  video,
}: {
  video: NonNullable<MicroTestResult["video"]>;
}) {
  const file = video.url && /\.(mp4|webm|mov)(\?|$)/i.test(video.url);
  if (file)
    return (
      <figure className="pf-mt-video is-file">
        <video controls preload="metadata" src={video.url!} />
        <figcaption>
          <span className="pf-mt-kicker is-lime">Approfondisci</span>
          <strong>{video.title}</strong>
        </figcaption>
      </figure>
    );
  const body = (
    <>
      <span className="pf-mt-play" aria-hidden="true">
        ▶
      </span>
      <span className="pf-mt-video-text">
        <span className="pf-mt-kicker is-lime">
          {video.url ? "Approfondisci" : "Approfondisci · video in arrivo"}
        </span>
        <strong>{video.title}</strong>
      </span>
    </>
  );
  return video.url ? (
    <a
      className="pf-mt-video"
      href={video.url}
      target="_blank"
      rel="noreferrer"
    >
      {body}
    </a>
  ) : (
    <div className="pf-mt-video">{body}</div>
  );
}

/**
 * Risultato come nella demo: punti dal back office, frase e consiglio
 * dell'AI, confidenza dell'area prima e dopo e il video scelto dall'AI. Si
 * legge soltanto: aprirlo dall'indirizzo non reinvia la prova.
 */
export function MicroTestResultView({ roundId }: { roundId: string }) {
  const { data, error, reload } = useResource<MicroTestResult>(
    `/athlete-journey/calibration/micro-test/${roundId}`,
  );
  if (error)
    return (
      <Working
        title="Non riesco a leggere il risultato."
        error={error}
        onRetry={() => void reload()}
      />
    );
  if (!data) return null;
  if (data.status !== "EVALUATED")
    return (
      <Working
        title="Sto calcolando la tua performance."
        error="Le tue risposte sono salvate: non serve rifare la prova."
        onRetry={() => void reload()}
      />
    );
  const before = data.confidence?.before ?? null;
  const after = data.confidence?.after ?? null;
  return (
    <section className="pf-mt pf-mt-result" aria-labelledby="pf-mt-result">
      <div className="pf-mt-result-head">
        <span className="pf-mt-kicker">Micro-test completato</span>
        <strong className="pf-mt-points">+{data.points ?? 0} pt</strong>
        <h2 id="pf-mt-result">{data.verdict ?? fallbackVerdict(data)}</h2>
        {(data.takeaway ?? data.summary) && (
          <p>{data.takeaway ?? data.summary}</p>
        )}
      </div>
      <div className="pf-mt-confidence">
        <div>
          <span className="pf-mt-kicker">{data.area.name} · confidenza</span>
          <b>
            {percent(before)} → {percent(after)}
          </b>
        </div>
        <div
          className="pf-mt-bar"
          role="progressbar"
          aria-label={`Confidenza dell’area ${data.area.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={after ?? 0}
        >
          <span className="is-after" style={{ width: `${after ?? 0}%` }} />
          <span className="is-before" style={{ width: `${before ?? 0}%` }} />
        </div>
      </div>
      {data.video && <VideoCard video={data.video} />}
      <Link className="pf-mt-pill is-outline" href="/journey">
        <span>Torna alla Home</span>
      </Link>
    </section>
  );
}

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

/**
 * Micro-test della home, fuori dal ciclo di calibrazione: c'è sempre uno
 * pronto, e se manca l'AI lo prepara mentre l'esagono respira. Dopo le
 * risposte il calcolo, poi il risultato.
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
  /** Chiede al server di preparare il micro-test se manca. */
  onPrepare: () => Promise<void>;
  /** Rilegge lo stato del micro-test senza chiederne la preparazione. */
  onRefresh: () => Promise<void>;
  onAnswered: (
    roundId: string,
    answers: Record<string, string>,
  ) => Promise<void>;
  onSkip: (roundId: string) => Promise<void>;
}) {
  const [started, setStarted] = useState(false);
  const [sending, setSending] = useState(false);
  const [prepError, setPrepError] = useState("");
  // Richiesta di preparazione in corso e riletture fatte mentre la prepara
  // un'altra scheda (il server risponde PREPARING senza aspettarla).
  const [asking, setAsking] = useState(false);
  const [polls, setPolls] = useState(0);
  const asked = useRef(false);
  const preparing = home?.status === "PREPARING";
  const prepare = () => {
    asked.current = true;
    setPrepError("");
    setPolls(0);
    setAsking(true);
    onPrepare()
      .catch((e: unknown) =>
        setPrepError(e instanceof Error ? e.message : "Riprova."),
      )
      .finally(() => setAsking(false));
  };
  // Manca il micro-test: lo si chiede una volta, anche mentre si legge il
  // risultato del precedente, così il prossimo è pronto al ritorno.
  useEffect(() => {
    if (!preparing) {
      asked.current = false;
      return;
    }
    if (!asked.current) prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparing]);
  // Ancora PREPARING dopo la richiesta: lo sta preparando un'altra scheda.
  // Si rilegge lo stato a intervalli, poi si offre «Riprova».
  const waiting = preparing && asked.current && !asking && !prepError;
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
  const test = home?.test ?? null;
  const stalled =
    home?.status === "EVALUATING" && test && !sending ? test.round : null;
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
  if (!home || home.status === "UNAVAILABLE")
    return (
      <section className="pf-mt pf-mt-working">
        <h2 className="pf-mt-hero-title">La fase gratuita è conclusa.</h2>
        <p className="pf-mt-muted">
          I micro-test aggiornavano il tuo profilo provvisorio: ora il profilo è
          chiuso e li ritrovi con il coach AI.
        </p>
      </section>
    );
  if (!test || home.status === "PREPARING")
    return (
      <Working
        title="Preparo il tuo micro-test."
        error={prepError}
        onRetry={prepare}
      />
    );
  const round = test.round;
  const answered = round.questions.some((q) => q.microTest?.feedback);
  if (!started && !answered)
    return <Intro home={home} test={test} onStart={() => setStarted(true)} />;
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
      area={test.area.name}
      onDone={done}
      onSkip={() => onSkip(round.id)}
    />
  );
}
