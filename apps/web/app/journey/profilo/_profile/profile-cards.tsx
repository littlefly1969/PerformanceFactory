import Link from "next/link";
import type { ReactNode } from "react";
import type { FitRankingView } from "../../../components/fit-ranking-editor";
import type { FreeLessonView } from "../../_account/account-data";
import { LessonDeclined } from "../../_account/lesson-declined";
import type { lessonProgress } from "../../_account/lesson-unlock";
import {
  type Availability,
  WEEKDAYS,
  durationLabel,
  frequencyShort,
  programLabel,
  weekPattern,
} from "./availability";

const Arrow = () => <span aria-hidden="true">→</span>;

const PencilIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

/** Scheda nera «da compilare»: disponibilità e classifica ancora vuote. */
export function TodoCard({ href, title }: { href: string; title: string }) {
  return (
    <Link href={href} className="pf-prof-todo">
      <div className="pf-prof-card-head">
        <h2>{title}</h2>
        <span className="pf-prof-arrow is-light">
          <Arrow />
        </span>
      </div>
      <span className="pf-prof-todo-tag">Da compilare</span>
    </Link>
  );
}

/** Intestazione delle schede compilate: titolo piccolo e «Modifica». */
function DoneHead({
  title,
  href,
  label,
}: {
  title: string;
  href: string;
  label: string;
}) {
  return (
    <div className="pf-prof-done-head">
      <h2 className="pf-prof-kicker">{title}</h2>
      <Link href={href} className="pf-prof-edit" aria-label={label}>
        <PencilIcon />
        <span>Modifica</span>
      </Link>
    </div>
  );
}

/** La tua disponibilità, compilata: giorni, minuti, settimana tipo. */
export function AvailabilityCard({ value }: { value: Availability }) {
  const days = weekPattern(value);
  return (
    <section className="pf-prof-done" aria-label="La tua disponibilità">
      <DoneHead
        title="La tua disponibilità"
        href="/journey/profilo/disponibilita"
        label="Modifica la disponibilità"
      />
      <div className="pf-prof-avail-big">
        <div>
          <span className="pf-prof-kicker">Giorni a settimana</span>
          <b>{value.daysPerWeek}</b>
        </div>
        <div>
          <span className="pf-prof-kicker">Ogni sessione</span>
          <p>
            <b>{durationLabel(value.sessionDurationMinutes)}</b>
            <small>minuti</small>
          </p>
        </div>
      </div>
      <ol className="pf-prof-week" aria-label="Giorni in cui ti alleni">
        {WEEKDAYS.map((label, i) => (
          <li key={i} className={days.includes(i) ? "is-on" : undefined}>
            <i />
            <span>{label}</span>
          </li>
        ))}
      </ol>
      <div className="pf-prof-pair">
        <div>
          <span className="pf-prof-kicker">Abitualmente</span>
          <b>{frequencyShort(value.currentFrequency)}</b>
        </div>
        <div>
          <span className="pf-prof-kicker">Programma</span>
          <b>{programLabel(value.programDurationWeeks)}</b>
        </div>
      </div>
    </section>
  );
}

const labelOf = (options: { value: string; label: string }[], v: string) =>
  options.find((o) => o.value === v)?.label ?? "—";

/** La tua classifica FIT, compilata: padel (con Playtomic) e tennis. */
export function FitCard({ view }: { view: FitRankingView }) {
  const r = view.ranking!;
  const playtomic =
    r.playtomicLevel === null || r.playtomicLevel === undefined
      ? null
      : r.playtomicLevel.toFixed(2).replace(".", ",");
  const sports = [
    {
      sport: "Padel",
      cur: labelOf(view.options.PADEL, r.padelCurrent),
      best: labelOf(view.options.PADEL, r.padelBest),
      playtomic,
    },
    {
      sport: "Tennis",
      cur: labelOf(view.options.TENNIS, r.tennisCurrent),
      best: labelOf(view.options.TENNIS, r.tennisBest),
      playtomic: null,
    },
  ];
  return (
    <section className="pf-prof-done" aria-label="La tua classifica FIT">
      <DoneHead
        title="La tua classifica FIT"
        href="/journey/profilo/classifica"
        label="Modifica la classifica FIT"
      />
      <div className="pf-prof-fit-sum">
        {sports.map((s) => (
          <div key={s.sport}>
            <span className="pf-prof-kicker">{s.sport}</span>
            <b>{s.cur}</b>
            <p>
              <span className="pf-prof-kicker">Migliore</span>
              <strong>{s.best}</strong>
            </p>
            {s.playtomic && (
              <p>
                <span className="pf-prof-kicker">Playtomic</span>
                <strong>{s.playtomic}</strong>
              </p>
            )}
          </div>
        ))}
      </div>
      <span className="pf-prof-note">
        {r.cardNumber
          ? `Tessera FIT ${r.cardNumber}`
          : "Tessera FIT non indicata"}
      </span>
    </section>
  );
}

/** Anello di avanzamento della scheda lime della lezione. */
function LessonRing({
  value,
  label,
  description,
}: {
  value: number;
  label: string;
  description: string;
}) {
  const circ = 2 * Math.PI * 27;
  return (
    <div className="pf-prof-lz-ring" role="img" aria-label={description}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="27" className="is-track" />
        <circle
          cx="32"
          cy="32"
          r="27"
          strokeDasharray={`${((circ * value) / 100).toFixed(1)} ${circ.toFixed(1)}`}
          // A zero niente puntino: l'arco compare con la prima risposta.
          strokeOpacity={value > 0 ? 1 : 0}
        />
      </svg>
      <span>{label}</span>
    </div>
  );
}

const lessonWhen = (iso: string) => {
  const d = new Date(iso);
  const dow = d.toLocaleDateString("it-IT", { weekday: "short" });
  const day = d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dow} ${day} · ${time}`;
};

/**
 * La parte di calibrazione che diventa la lezione (demo PF10): anello delle
 * aree Reali e «Continua la calibrazione» finché è bloccata, «Scegli il circolo» quando si
 * sblocca, la lezione richiesta o confermata dopo. Decide la fase del server.
 */
export function LessonSection({
  view,
  progress,
  calibrationHref,
  calibrationCta,
}: {
  view: FreeLessonView | null | undefined;
  /** Aree già Reali: la lezione si sblocca quando lo sono tutte. */
  progress: ReturnType<typeof lessonProgress>;
  calibrationHref: string;
  calibrationCta: string;
}) {
  if (!view?.enabled) return null;
  const { phase } = view;
  if (phase === "UNAVAILABLE" || view.clubs.length === 0)
    return (
      <section className="pf-prof-lz-off" aria-label="Lezione gratuita">
        <span className="pf-prof-kicker">Lezione gratuita</span>
        <p>Non ancora disponibile nella tua zona.</p>
      </section>
    );
  if (phase === "FULL")
    return (
      <section className="pf-prof-lz-off" aria-label="Lezione gratuita">
        <span className="pf-prof-kicker">Lezione di prova</span>
        <p>Al momento i circoli sono al completo.</p>
      </section>
    );
  if (phase === "LOCKED") {
    // Una revisione interna del profilo resta neutra per l'atleta.
    const review = !!view.missing?.includes("PROFILE");
    return (
      <section className="pf-prof-lz-lock" aria-label="Lezione gratuita">
        <div className="pf-prof-lz-lock-head">
          <LessonRing
            value={progress.value}
            label={progress.label}
            description={`${progress.real} di ${progress.total} aree Reali`}
          />
          <div>
            <span className="pf-prof-kicker">Lezione gratuita</span>
            <h2>
              {review
                ? "Continuiamo a conoscere il tuo profilo."
                : progress.title}
            </h2>
          </div>
        </div>
        <Link href={calibrationHref} className="pf-prof-lz-cta">
          <span>{calibrationCta}</span>
          <Arrow />
        </Link>
      </section>
    );
  }
  if (phase === "DECLINED") return <LessonDeclined />;
  if (phase === "ELIGIBLE")
    return (
      <Link href="/journey/circolo" className="pf-prof-lz-ready">
        <span className="pf-prof-lz-pin" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
        </span>
        <span className="pf-prof-lz-ready-text">
          <span className="pf-prof-kicker">Lezione gratuita · sbloccata</span>
          <b>Scegli il circolo</b>
        </span>
        <Arrow />
      </Link>
    );
  if ((phase === "REQUESTED" || phase === "ASSIGNED") && view.seat) {
    const { seat } = view;
    return (
      <Link href="/journey/circolo" className="pf-prof-lz-booked">
        <span className="pf-prof-lz-photo" aria-hidden="true" />
        <span className="pf-prof-lz-booked-text">
          <span className="pf-prof-kicker">
            {phase === "ASSIGNED"
              ? "Lezione di prova"
              : "Lezione di prova · richiesta"}
          </span>
          <b>
            {phase === "ASSIGNED" && seat.lesson
              ? lessonWhen(seat.lesson.startsAt)
              : "Richiesta inviata"}
          </b>
          <span>
            {seat.club.name}
            {seat.club.city ? `, ${seat.club.city}` : ""}
          </span>
        </span>
        <Arrow />
      </Link>
    );
  }
  return null;
}

/** Scheda larga con titolo e freccia: analisi, invito, community. */
export function LinkCard({
  href,
  title,
  kicker,
  tone = "plain",
  icon,
}: {
  href: string;
  title: string;
  kicker?: string;
  tone?: "plain" | "outline";
  icon?: ReactNode;
}) {
  return (
    <Link href={href} className={`pf-prof-link is-${tone}`}>
      <div className="pf-prof-card-head">
        <div>
          {kicker && <span className="pf-prof-kicker">{kicker}</span>}
          <h2>{title}</h2>
        </div>
        <span className="pf-prof-arrow">{icon ?? <Arrow />}</span>
      </div>
    </Link>
  );
}

export const ExternalIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="pf-prof-ext">
    <path d="M14 4h6v6" />
    <path d="M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
