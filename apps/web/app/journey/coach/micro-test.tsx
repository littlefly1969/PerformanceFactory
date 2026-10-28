"use client";
import { useState } from "react";
import type { Calibration, Evaluation } from "../journey-types";
import {
  type MicroTestResult,
  type SituationFeedback,
  percent,
  postJson,
  useResource,
} from "../_account/account-data";
import { PillButton, PillLink } from "../_account/account-shell";
import {
  type NextStep,
  isCalibrationStep,
  summaryHref,
} from "../_account/next-step";

type Round = NonNullable<Calibration["round"]>;
type Item = Round["questions"][number];

const LETTERS = "ABCDE";

/** Segmenti: fatti in lime, quello corrente in nero, gli altri grigi. */
function Steps({ total, current }: { total: number; current: number }) {
  return (
    <div className="pf-acc-steps" aria-hidden="true">
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

/** Scheda iniziale: area, cosa ci dice e durata, poi si parte. */
function Intro({
  item,
  area,
  onStart,
}: {
  item: Item;
  area: string;
  onStart: () => void;
}) {
  const test = item.microTest!;
  const situational = test.format === "SITUATIONAL";
  return (
    <section className="pf-acc-micro">
      <span className="pf-acc-line" aria-hidden="true" />
      <span className="pf-acc-chip">Micro-test · {area}</span>
      <h2>{test.title ?? item.text}</h2>
      <p>{test.instructions}</p>
      <dl className="pf-acc-facts">
        <div>
          <dt>Area</dt>
          <dd>{area}</dd>
        </div>
        <div>
          <dt>Cosa ci dice</dt>
          <dd>
            {situational ? "Come leggi il gioco" : "Il tuo livello in campo"}
          </dd>
        </div>
      </dl>
      {test.durationMinutes && (
        <small className="pf-acc-note">
          Durata indicativa: circa {test.durationMinutes} minut
          {test.durationMinutes === 1 ? "o" : "i"}
        </small>
      )}
      <PillButton tone="lime" arrow={false} onClick={onStart}>
        Inizia il micro-test
      </PillButton>
    </section>
  );
}

/**
 * Situazioni di gioco: l'atleta sceglie, la risposta si fissa e arriva la
 * spiegazione del coach, sulla scelta e sulla risposta corretta.
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
    <section className="pf-acc-micro" key={q.id}>
      <Steps total={round.questions.length} current={index} />
      <span className="pf-acc-kicker">
        {String(index + 1).padStart(2, "0")} /{" "}
        {String(situation.total).padStart(2, "0")} · {situation.label}
      </span>
      <h2>{q.text}</h2>
      {situation.context && <p className="pf-acc-muted">{situation.context}</p>}
      <div className="pf-acc-answers">
        {q.options.map((o, k) => {
          const chosen = shown?.value === o.value;
          const correct = shown?.correctValue === o.value;
          const text =
            shown && (chosen || correct) ? shown.feedback[o.value] : "";
          return (
            <button
              type="button"
              key={o.value}
              disabled={busy || !!shown}
              aria-pressed={chosen}
              className={`pf-acc-answer${correct && shown ? " is-correct" : ""}${chosen && !correct ? " is-wrong" : ""}`}
              onClick={() => void choose(o.value)}
            >
              <span className="pf-acc-letter">{LETTERS[k]}</span>
              <span className="pf-acc-answer-body">
                <span className="pf-acc-answer-label">
                  <b>{o.label}</b>
                  {shown && correct && <em>corretta</em>}
                  {shown && chosen && !correct && <em>no</em>}
                </span>
                {text && <span className="pf-acc-answer-text">{text}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {error && (
        <p className="pf-acc-error" role="alert">
          {error}
        </p>
      )}
      {shown && (
        <PillButton
          arrow={false}
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
          {last
            ? busy
              ? "Aggiorniamo la tua valutazione…"
              : "Vedi il risultato"
            : "Avanti"}
        </PillButton>
      )}
    </section>
  );
}

/** Prova pratica: istruzioni, sicurezza e l'esito che riporta l'atleta. */
function Practical({
  round,
  onDone,
  onSkip,
}: {
  round: Round;
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
    <section className="pf-acc-micro">
      <span className="pf-acc-kicker">Prova pratica</span>
      <h2>{q.microTest!.title ?? q.text}</h2>
      <p>{q.microTest!.instructions}</p>
      {q.microTest!.safetyNotes && (
        <p className="pf-acc-muted">
          <strong>Sicurezza:</strong> {q.microTest!.safetyNotes}
        </p>
      )}
      <span className="pf-acc-kicker">
        Com’è andata? L’esito lo riporti tu.
      </span>
      <div className="pf-acc-answers">
        {q.options.map((o, k) => (
          <button
            type="button"
            key={o.value}
            disabled={busy}
            aria-pressed={value === o.value}
            className={`pf-acc-answer${value === o.value ? " is-selected" : ""}`}
            onClick={() => setValue(o.value)}
          >
            <span className="pf-acc-letter">{LETTERS[k]}</span>
            <span className="pf-acc-answer-body">
              <b>{o.label}</b>
            </span>
          </button>
        ))}
      </div>
      <PillButton
        arrow={false}
        disabled={busy || value === undefined}
        onClick={() => run(() => onDone({ [q.id]: value! }))}
      >
        {busy ? "Aggiorniamo la tua valutazione…" : "Invia l’esito"}
      </PillButton>
      <button
        type="button"
        className="pf-acc-link"
        disabled={busy}
        onClick={() => run(onSkip)}
      >
        Non posso farlo ora
      </button>
    </section>
  );
}

const headline = (r: MicroTestResult) => {
  if (r.total === undefined || r.correct === undefined)
    return "Esito registrato.";
  if (r.correct === r.total) return "Perfetto.";
  return r.correct * 2 >= r.total ? "Ci sei quasi." : "C’è margine.";
};

/** Riquadro del video: il file se c'è, altrimenti il titolo del video previsto. */
function VideoBox({ video }: { video: NonNullable<MicroTestResult["video"]> }) {
  const file = video.url && /\.(mp4|webm|mov)(\?|$)/i.test(video.url);
  return (
    <figure className="pf-acc-video">
      {file ? (
        <video controls preload="metadata" src={video.url!} />
      ) : (
        <div className="pf-acc-video-box">
          <span className="pf-acc-play" aria-hidden="true">
            ▶
          </span>
          <span>
            {video.url ? "Video di approfondimento" : "Video in arrivo"}
          </span>
          <strong>{video.title}</strong>
        </div>
      )}
      <figcaption>
        <span className="pf-acc-kicker">Approfondisci</span>
        {video.url && !file ? (
          <a href={video.url} target="_blank" rel="noreferrer">
            {video.title}
          </a>
        ) : (
          <strong>{video.title}</strong>
        )}
      </figcaption>
    </figure>
  );
}

/** Ritorno esplicito al riepilogo, che rilegge lo stato aggiornato. */
const BackToSummary = ({ href = "/journey/profilo" }: { href?: string }) => (
  <PillLink href={href}>Torna al riepilogo</PillLink>
);

/**
 * Risultato: confidenza del driver prima e dopo, commento e video. Si legge
 * soltanto: aprirlo dall'indirizzo non reinvia la prova. Poi si torna al
 * riepilogo; la calibrazione prosegue solo se è ancora il passo consentito.
 */
export function MicroTestResultView({
  roundId,
  next,
}: {
  roundId: string;
  next: NextStep | null;
}) {
  const { data, error, reload } = useResource<MicroTestResult>(
    `/athlete-journey/calibration/micro-test/${roundId}`,
  );
  if (error)
    return (
      <section className="pf-acc-micro">
        <p className="pf-acc-error" role="alert">
          {error}
        </p>
        <PillButton tone="outline" arrow={false} onClick={() => void reload()}>
          Riprova
        </PillButton>
        <BackToSummary />
      </section>
    );
  if (!data) return null;
  if (data.status !== "EVALUATED")
    return (
      <section className="pf-acc-micro" role="status">
        <h2>Aggiorniamo la tua valutazione…</h2>
        <p>Le tue risposte sono salvate: non serve rifare la prova.</p>
        <PillButton tone="outline" arrow={false} onClick={() => void reload()}>
          Aggiorna
        </PillButton>
        <BackToSummary />
      </section>
    );
  const before = data.confidence?.before ?? null;
  const after = data.confidence?.after ?? null;
  return (
    <section className="pf-acc-micro" aria-labelledby="pf-acc-micro-result">
      <span className="pf-acc-line" aria-hidden="true" />
      <span className="pf-acc-kicker">Micro-test completato</span>
      <h2 id="pf-acc-micro-result">{data.area.name}: ora più definita.</h2>
      <div className="pf-acc-confidence">
        <div className="pf-acc-row">
          <span className="pf-acc-kicker">Confidenza dell’area</span>
          <b>
            {percent(before)} → {percent(after)}
          </b>
        </div>
        <div
          className="pf-acc-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={after ?? 0}
        >
          <span style={{ width: `${after ?? 0}%` }} />
        </div>
      </div>
      <h3>{headline(data)}</h3>
      {data.summary && <p>{data.summary}</p>}
      {data.video && <VideoBox video={data.video} />}
      <BackToSummary href={summaryHref("micro-test")} />
      {next && isCalibrationStep(next) && (
        <a className="pf-acc-link" href={next.href}>
          {next.cta}
        </a>
      )}
    </section>
  );
}

/** Valutazione interrotta: le risposte sono salvate, si rilancia l'esito. */
function StalledEvaluation({ onRetry }: { onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="pf-acc-micro" role="status">
      <h2>Le tue risposte sono salvate.</h2>
      <p>
        La valutazione del micro-test si è interrotta. Riprova: usiamo le
        risposte che hai già dato.
      </p>
      <PillButton
        arrow={false}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onRetry().finally(() => setBusy(false));
        }}
      >
        {busy ? "Aggiorniamo la tua valutazione…" : "Completa la valutazione"}
      </PillButton>
    </section>
  );
}

/**
 * Micro-test proposto dall'AI durante la calibrazione: scheda iniziale,
 * situazioni di gioco o prova pratica, poi il risultato con il video.
 */
export function MicroTestTab({
  calibration,
  evaluation,
  resultRound,
  next,
  onAnswered,
  onSkip,
}: {
  calibration: Calibration | null;
  evaluation: Evaluation | null;
  resultRound: string | null;
  /** Prossimo passo dopo il risultato, dallo stato aggiornato. */
  next: NextStep | null;
  onAnswered: (
    roundId: string,
    answers: Record<string, string>,
  ) => Promise<void>;
  onSkip: (roundId: string) => Promise<void>;
}) {
  const [started, setStarted] = useState(false);
  const round = calibration?.round;
  const open =
    round?.action === "PROPOSE_MICRO_TEST" &&
    round.status === "OPEN" &&
    round.questions[0]?.microTest
      ? round
      : null;
  // Micro-test rimasto in valutazione (processo interrotto): si riprova con
  // le risposte già fissate, che il server non cambia.
  const stalled =
    round?.action === "PROPOSE_MICRO_TEST" && round.status === "EVALUATING"
      ? round
      : null;
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
  if (resultRound && !open)
    return <MicroTestResultView roundId={resultRound} next={next} />;
  if (!evaluation)
    return (
      <section className="pf-acc-micro">
        <h2>Il primo micro-test arriva dopo l’assessment.</h2>
        <p>
          Con le prime risposte capiamo dove una prova breve ci dice di più. Poi
          te la proponiamo qui.
        </p>
        <PillLink href="/journey/profilo">Vai al profilo</PillLink>
      </section>
    );
  if (!open)
    return (
      <section className="pf-acc-micro">
        <h2>Nessun micro-test in attesa.</h2>
        <p>
          Quando una prova breve ci dice più delle domande, l’AI la propone
          durante la calibrazione e la trovi qui.
        </p>
        <PillLink href="/journey/calibrazione">Vai alla calibrazione</PillLink>
      </section>
    );
  const item = open.questions[0];
  const area =
    evaluation.drivers.find((d) => d.id === item.areaId)?.name ?? "La tua area";
  const answered = open.questions.some((q) => q.microTest?.feedback);
  if (!started && !answered)
    return <Intro item={item} area={area} onStart={() => setStarted(true)} />;
  const done = (answers: Record<string, string>) =>
    onAnswered(open.id, answers);
  return item.microTest?.format === "SITUATIONAL" ? (
    <Situations round={open} onDone={done} />
  ) : (
    <Practical round={open} onDone={done} onSkip={() => onSkip(open.id)} />
  );
}
