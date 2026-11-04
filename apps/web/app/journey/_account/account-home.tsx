"use client";
import Link from "next/link";
import { AccountMenu } from "../../components/account-menu";
import { PFMark } from "../../start/pf4-shell";
import type { Journey } from "../journey-types";
import { AccountScreen } from "./account-shell";
import {
  type FreeLessonView,
  type HomeMicroTest,
  useResource,
} from "./account-data";
import {
  closedUnconsolidated,
  isClosed,
  isConsolidated,
} from "./calibration-state";
import { REVEAL_HREF, nextStep } from "./next-step";
import "./account-home.css";

const RING = 2 * Math.PI * 20;

// Stati in cui la home mostra il micro-test in «Per te oggi».
const SHOWN = new Set<HomeMicroTest["status"]>([
  "READY",
  "PREPARING",
  "EVALUATING",
]);

const when = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
};

/** Esagono che respira: l'AI è al lavoro o è il coach a parlare. */
export function HexOrb({
  size = 40,
  tone = "ink",
}: {
  size?: number;
  tone?: "ink" | "lime";
}) {
  return (
    <svg
      className={`pf-hm-orb is-${tone}`}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <polygon points="100,8 179.7,54 179.7,146 100,192 20.3,146 20.3,54" />
      <polygon points="100,46 146.8,73 146.8,127 100,154 53.2,127 53.2,73" />
    </svg>
  );
}

/** Anello di avanzamento della scheda della lezione (S04 della demo). */
function LessonRing({ value }: { value: number }) {
  const c = 2 * Math.PI * 27;
  return (
    <div className="pf-hm-ring" role="img" aria-label={`Al ${value}%`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="27" />
        <circle
          cx="32"
          cy="32"
          r="27"
          strokeDasharray={`${((c * value) / 100).toFixed(1)} ${c.toFixed(1)}`}
          // A zero niente puntino: l'arco compare con la prima risposta.
          strokeOpacity={value > 0 ? 1 : 0}
        />
      </svg>
      <span>{value}%</span>
    </div>
  );
}

/**
 * La scheda in cima, come nella demo: fase gratuita finita, oppure la lezione
 * gratuita nei suoi stati. Senza lezione nel territorio non si promette nulla.
 */
function Banner({
  j,
  lesson,
}: {
  j: Journey;
  lesson: FreeLessonView | null | undefined;
}) {
  const c = j.calibration;
  if (isClosed(c))
    return (
      <Link className="pf-hm-done" href={REVEAL_HREF}>
        <div className="pf-hm-done-head">
          <HexOrb size={58} tone="lime" />
          <div>
            <span className="pf-hm-kicker is-lime">
              {closedUnconsolidated(c)
                ? "Fase gratuita conclusa"
                : "Fase gratuita terminata"}
            </span>
            <strong>Scopri dove puoi arrivare in 3, 6 e 12 mesi.</strong>
          </div>
        </div>
        <span className="pf-hm-pill is-lime">
          <span>I tuoi scenari</span>
          <span aria-hidden="true">→</span>
        </span>
      </Link>
    );
  if (!lesson?.enabled) return null;
  const { phase, seat, credits } = lesson;
  if (phase === "LOCKED") {
    const value = credits.toUnlock
      ? Math.min(100, Math.round((credits.balance / credits.toUnlock) * 100))
      : 0;
    return (
      <section className="pf-hm-lesson is-locked" aria-label="Lezione gratuita">
        <div className="pf-hm-lesson-head">
          <LessonRing value={value} />
          <div>
            <span className="pf-hm-kicker">Lezione gratuita</span>
            <strong>Ancora qualche passo per sbloccarla.</strong>
          </div>
        </div>
        <Link className="pf-hm-pill is-ink" href="/journey/calibrazione">
          <span>Continua la calibrazione</span>
          <span aria-hidden="true">→</span>
        </Link>
      </section>
    );
  }
  if (phase === "ELIGIBLE" || phase === "DECLINED")
    return (
      <section className="pf-hm-lesson is-ready" aria-label="Lezione gratuita">
        <div className="pf-hm-lesson-head">
          <div className="pf-hm-ring is-done" role="img" aria-label="Sbloccata">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="27" />
            </svg>
            <span aria-hidden="true">✓</span>
          </div>
          <div>
            <span className="pf-hm-kicker">Lezione gratuita · sbloccata</span>
            <strong>Una lezione gratuita in un circolo vicino a te.</strong>
          </div>
        </div>
        <Link className="pf-hm-pill is-ink" href="/journey/circolo">
          <span>Scegli il circolo</span>
          <span aria-hidden="true">→</span>
        </Link>
      </section>
    );
  if ((phase === "REQUESTED" || phase === "ASSIGNED") && seat)
    return (
      <Link className="pf-hm-booked" href="/journey/circolo">
        <div>
          <span className="pf-hm-kicker">
            {phase === "ASSIGNED" ? "Lezione di prova" : "Lezione richiesta"}
          </span>
          <strong>
            {phase === "ASSIGNED" && seat.lesson
              ? when(seat.lesson.startsAt)
              : "Il circolo compone il gruppo"}
          </strong>
          <small>
            {seat.club.name}
            {seat.club.city ? `, ${seat.club.city}` : ""}
          </small>
        </div>
        <span aria-hidden="true">→</span>
      </Link>
    );
  return null;
}

/**
 * Scheda «Per te oggi» del micro-test: anello dei giorni di fila e titolo.
 * Mentre l'AI prepara il prossimo, l'esagono respira al posto dell'anello.
 */
function MicroTestCard({ data }: { data: HomeMicroTest }) {
  const ready = data.status === "READY" && data.test;
  const days = data.streak.days;
  const dash = `${((RING * Math.min(7, days)) / 7).toFixed(1)} ${RING.toFixed(1)}`;
  const minutes = data.test?.durationMinutes;
  return (
    <Link
      className="pf-hm-mt"
      href="/journey/coach?tab=micro"
      aria-label={
        ready
          ? `Micro-test: ${data.test!.title}`
          : "Micro-test: preparo il prossimo"
      }
    >
      <span className="pf-hm-glow" aria-hidden="true" />
      {ready ? (
        <span className="pf-hm-mt-ring" aria-hidden="true">
          <svg viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" />
            <circle cx="24" cy="24" r="20" strokeDasharray={dash} />
          </svg>
          <b>{days}</b>
        </span>
      ) : (
        <HexOrb size={44} tone="lime" />
      )}
      <span className="pf-hm-mt-text">
        <span className="pf-hm-kicker is-lime">
          Micro-test{minutes ? ` · ${minutes} min` : ""}
        </span>
        <strong>
          {ready
            ? data.test!.title
            : data.status === "EVALUATING"
              ? "Aggiorniamo la tua valutazione…"
              : "Preparo il prossimo micro-test…"}
        </strong>
      </span>
    </Link>
  );
}

/**
 * Scheda lime prima dell'assessment (S04 della demo, «Profilo da iniziare»):
 * l'assessment è il primo passo verso la lezione. La lezione si promette solo
 * se il server la offre: funzione attiva e almeno un circolo.
 */
function IntroBanner({
  j,
  lesson,
  busy,
  onStart,
}: {
  j: Journey;
  lesson: FreeLessonView | null | undefined;
  busy: boolean;
  onStart: () => void;
}) {
  const offered = !!lesson?.enabled && (lesson.clubs?.length ?? 0) > 0;
  const answered = Math.min(j.currentQuestion, j.count);
  const value = j.count ? Math.round((answered / j.count) * 100) : 0;
  const started = answered > 0 || j.phase === "ASSESSMENT";
  return (
    <section
      className="pf-hm-lesson is-locked"
      aria-label={offered ? "Lezione gratuita" : "Il tuo assessment"}
    >
      <div className="pf-hm-lesson-head">
        <LessonRing value={value} />
        <div>
          <span className="pf-hm-kicker">
            {offered ? "Lezione gratuita" : "Il tuo assessment"}
          </span>
          <strong>
            {offered
              ? "Completa l’assessment per sbloccarla."
              : "Scopri dove sei oggi."}
          </strong>
        </div>
      </div>
      <button
        type="button"
        className="pf-hm-pill is-ink"
        disabled={busy}
        onClick={onStart}
      >
        <span>
          {busy
            ? "Prepariamo le domande…"
            : started
              ? "Continua l’assessment"
              : "Inizia l’assessment"}
        </span>
        <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}

/**
 * Home della fase gratuita, come la S04 della demo PF10: saluto, stato del
 * profilo, lezione gratuita, «Completa le sei aree» e «Per te oggi» con il
 * micro-test. Prima dell'assessment («Profilo da iniziare») la scheda lime
 * porta all'assessment; è anche dove si atterra dopo il benvenuto e aprendo
 * l'app installata. Il calendario della demo arriva con gli allenamenti.
 */
export function AccountHome({
  journey: j,
  busy = false,
  error,
  onStart,
}: {
  journey: Journey;
  busy?: boolean;
  error?: string;
  /** Prima dell'assessment: avvia (o riprende) le domande. */
  onStart?: () => void;
}) {
  const evaluation = j.evaluation;
  const lesson = useResource<FreeLessonView>("/athlete-journey/free-lesson");
  const micro = useResource<HomeMicroTest>(
    evaluation ? "/athlete-journey/micro-test" : null,
  );
  const step =
    !evaluation || lesson.data === undefined ? null : nextStep(j, lesson.data);
  const consolidated = isConsolidated(j.calibration);
  const closed = isClosed(j.calibration);
  const name = j.firstName?.trim();
  const drivers = evaluation?.drivers ?? [];
  const rule = j.calibration?.consolidationRule;
  const min = rule?.minAreaConfidence ?? rule?.minOverallConfidence ?? null;
  // Ogni area si riempie verso la soglia della regola di consolidamento.
  const full = closed && !closedUnconsolidated(j.calibration);
  const segments = drivers.map((d) => {
    const fill = full ? 1 : min ? Math.min(1, d.confidence / min) : 0;
    return { id: d.id, fill, ok: fill >= 1 };
  });
  const defined = segments.filter((s) => s.ok).length;
  // Domande in valutazione o R consolidata: passi da non nascondere.
  const urgent =
    step && (step.kind === "evaluation" || step.kind === "finish")
      ? step
      : null;
  const microData = micro.data;
  return (
    <AccountScreen nav="home" coachDot={micro.data?.status === "READY"}>
      <div className="pf-hm">
        <header className="pf-hm-bar">
          <span className="pf-hm-brand">
            <PFMark size={18} />
            Performance Factory
          </span>
          <AccountMenu name={name} from="home" className="pf-hm-avatar" />
        </header>

        <h1 className="pf-hm-hello">{name ? `Ciao ${name}.` : "Ciao."}</h1>
        <span className={`pf-hm-chip${consolidated ? " is-lime" : ""}`}>
          {!evaluation
            ? "Profilo da iniziare"
            : consolidated
              ? "R consolidata"
              : "Profilo provvisorio"}
        </span>

        {error && (
          <p className="pf-acc-error" role="alert">
            {error}
          </p>
        )}

        <div className="pf-hm-stack">
          {evaluation ? (
            <Banner j={j} lesson={lesson.data} />
          ) : (
            lesson.data !== undefined &&
            onStart && (
              <IntroBanner
                j={j}
                lesson={lesson.data}
                busy={busy}
                onStart={onStart}
              />
            )
          )}
          {urgent && (
            <section className="pf-hm-step" aria-label="Prossimo passo">
              <span className="pf-hm-kicker">
                <i aria-hidden="true" />
                {urgent.kicker}
              </span>
              <strong>{urgent.title}</strong>
              <Link className="pf-hm-pill is-lime" href={urgent.href}>
                <span>{urgent.cta}</span>
                <span aria-hidden="true">→</span>
              </Link>
            </section>
          )}
          {!closed && drivers.length > 0 && (
            <section className="pf-hm-areas" aria-label="Completa le aree">
              <div className="pf-hm-areas-head">
                <strong>
                  Completa le {drivers.length === 6 ? "sei" : drivers.length}{" "}
                  aree
                </strong>
                <small>
                  {defined} di {drivers.length} aree definite
                </small>
              </div>
              <div className="pf-hm-areas-bar" aria-hidden="true">
                {segments.map((s) => (
                  <span key={s.id}>
                    <i
                      className={s.ok ? "is-ok" : undefined}
                      style={{ width: `${Math.round(s.fill * 100)}%` }}
                    />
                  </span>
                ))}
              </div>
              <Link
                className="pf-hm-pill is-lime is-tall"
                href="/journey/calibrazione"
              >
                <span>Continua il profilo</span>
                <span aria-hidden="true">→</span>
              </Link>
            </section>
          )}
        </div>

        {microData?.streak && SHOWN.has(microData.status) && (
          <>
            <h2 className="pf-hm-section">Per te oggi</h2>
            <div className="pf-hm-today">
              <MicroTestCard data={microData} />
            </div>
          </>
        )}
      </div>
    </AccountScreen>
  );
}
