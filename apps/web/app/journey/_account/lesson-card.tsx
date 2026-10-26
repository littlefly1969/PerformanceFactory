import type { ReactNode } from "react";
import type { FreeLessonView } from "./account-data";
import { PillButton, PillLink } from "./account-shell";

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Anello di avanzamento, o la spunta quando la lezione è sbloccata. */
function Ring({ value, done }: { value: number; done?: boolean }) {
  return (
    <div
      className={`pf-acc-ring${done ? " is-done" : ""}`}
      role="img"
      aria-label={done ? "Sbloccata" : `Al ${value}%`}
      style={{ "--pf-ring": `${value * 3.6}deg` } as React.CSSProperties}
    >
      <span>{done ? "✓" : `${value}%`}</span>
    </div>
  );
}

function Card({
  ring,
  kicker,
  title,
  children,
}: {
  ring: ReactNode;
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="pf-acc-lesson" aria-label="Lezione gratuita">
      <div className="pf-acc-lesson-head">
        {ring}
        <div>
          <span className="pf-acc-kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

const SEAT = "1 posto in una lezione da 1 ora in gruppo di 4.";

/**
 * Prima dell'assessment. La lezione si promette solo se il server la offre
 * (funzione attiva e almeno un circolo), e l'assessment è il primo passo, non
 * lo sblocco: poi servono domande e test fino a un profilo attendibile.
 */
export function AssessmentLessonCard({
  answered,
  count,
  started,
  busy,
  offered,
  onStart,
}: {
  answered: number;
  count: number;
  started: boolean;
  busy: boolean;
  offered: boolean;
  onStart: () => void;
}) {
  const value = count ? Math.round((answered / count) * 100) : 0;
  return (
    <Card
      ring={<Ring value={value} />}
      kicker={offered ? "Lezione gratuita" : "Il tuo assessment"}
      title={
        offered
          ? "Completa l’assessment: è il primo passo per sbloccarla."
          : "Scopri dove sei oggi."
      }
    >
      <p>
        {answered} di {count} domande
        {offered
          ? " · poi continui con domande e test fino a sbloccare la lezione di prova."
          : " · da qui nasce il tuo Spider."}
      </p>
      <PillButton disabled={busy} onClick={onStart}>
        {busy
          ? "Prepariamo le domande…"
          : started
            ? "Riprendi l’assessment"
            : "Inizia l’assessment"}
      </PillButton>
    </Card>
  );
}

/**
 * Dopo l'assessment: la lezione si sblocca con la regola di eleggibilità del
 * backend (profilo attendibile), non con il solo assessment.
 */
export function FreeLessonCard({ view }: { view: FreeLessonView }) {
  if (!view.enabled || view.phase === "UNAVAILABLE") return null;
  const { phase, seat, credits } = view;
  const where = seat
    ? `${seat.club.name}${seat.club.city ? `, ${seat.club.city}` : ""}`
    : "";
  if (phase === "LOCKED") {
    const value = credits.toUnlock
      ? Math.min(100, Math.round((credits.balance / credits.toUnlock) * 100))
      : 0;
    return (
      <Card
        ring={<Ring value={value} />}
        kicker="Lezione gratuita"
        title="Ancora qualche passo per sbloccarla."
      >
        <p>
          Continua la calibrazione: quando il tuo profilo è abbastanza
          attendibile, ti aspetta {SEAT}
        </p>
        <PillLink href="/journey/calibrazione">
          Continua la calibrazione
        </PillLink>
      </Card>
    );
  }
  if (phase === "ELIGIBLE" || phase === "DECLINED")
    return (
      <Card
        ring={<Ring value={100} done />}
        kicker="Lezione gratuita · sbloccata"
        title="Una lezione gratuita in un circolo vicino a te."
      >
        <p>{SEAT}</p>
        <PillLink href="/journey/circolo">Scegli il circolo</PillLink>
      </Card>
    );
  if (phase === "REQUESTED" || phase === "ASSIGNED")
    return (
      <Card
        ring={<Ring value={100} done />}
        kicker={
          phase === "ASSIGNED"
            ? "Lezione gratuita · confermata"
            : "Lezione gratuita · richiesta"
        }
        title={
          phase === "ASSIGNED" && seat?.lesson
            ? `${when(seat.lesson.startsAt)}`
            : "Il circolo compone il tuo gruppo."
        }
      >
        <p>
          {where}.{" "}
          {phase === "ASSIGNED"
            ? "La tua R si chiude dopo il feedback del coach."
            : "Ti avvisiamo appena c’è la data."}
        </p>
        <PillLink href="/journey/circolo" tone="outline">
          Gestisci il posto
        </PillLink>
      </Card>
    );
  return null;
}
