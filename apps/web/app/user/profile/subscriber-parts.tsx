"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { AccountSubscription } from "../../account/abbonamento/page";
import type { Home } from "../_components/athlete-types";
import { BandHex, type RankedView, count } from "../ranking/ranking-data";

const HORIZON_MONTHS = { PROGRAM_3M: 3, PROGRAM_6M: 6, PROGRAM_12M: 12 };
const CYCLE: Record<string, string> = {
  MONTHLY: "pagamento mensile",
  QUARTERLY: "pagamento trimestrale",
  SEMIANNUAL: "pagamento semestrale",
  ANNUAL: "pagamento annuale",
};
const pad = (n: number) => String(n).padStart(2, "0");
const DAY_MS = 86_400_000;

/** Riga del ranking sotto la testata, come nella demo V10. */
export function RankingRow({ view }: { view: RankedView }) {
  return (
    <Link href="/user/ranking" className="pf-sub-rank">
      <BandHex code={view.band} size={48} />
      <span className="pf-sub-rank-text">
        <span className="pf-prof-kicker">Ranking della piattaforma</span>
        <b>
          {count(view.position)}° in {view.band}
        </b>
        <small>
          Reale {view.real} · potenziale {view.potential}
        </small>
      </span>
      <span className="pf-sub-rank-arrow" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

/** «Sei entrato in PFx»: alla prima apertura dopo il pagamento e a ogni cambio. */
export function RankingPopup({
  view,
  onClose,
}: {
  view: RankedView;
  onClose: (open: boolean) => void;
}) {
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="pf-sub-pop" onClick={() => onClose(false)}>
      <div
        className="pf-sub-pop-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pf-sub-pop-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pf-sub-pop-glow" aria-hidden="true" />
        <BandHex code={view.band} size={96} />
        <span className="pf-prof-kicker is-lime">
          Ranking della piattaforma
        </span>
        <h2 id="pf-sub-pop-title">Sei entrato in {view.band}.</h2>
        <p>
          Sei il {count(view.position)}° della fascia. Allenati e sali: la
          posizione segue reale e potenziale.
        </p>
        <Link
          ref={first}
          href="/user/ranking"
          className="pf-acc-pill is-lime"
          onClick={() => onClose(true)}
        >
          <span>Vedi il ranking</span>
        </Link>
        <button
          type="button"
          className="pf-sub-pop-close"
          onClick={() => onClose(false)}
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}

/** Scheda nera dell'abbonamento: orizzonte, cadenza e «Gestisci». */
export function SubscriptionCard({
  account,
}: {
  account: AccountSubscription;
}) {
  const s = account.subscription;
  if (!s || !["ACTIVE", "GRACE", "PAUSED"].includes(account.state)) return null;
  const kicker = s.cancelAtPeriodEnd
    ? "Abbonamento disdetto"
    : account.state === "GRACE"
      ? "Pagamento da regolarizzare"
      : account.state === "PAUSED"
        ? "Abbonamento sospeso"
        : "Abbonamento attivo";
  return (
    <section className="pf-sub-plan-card" aria-label="Il tuo abbonamento">
      <div>
        <span className="pf-prof-kicker">{kicker}</span>
        <strong>
          Programma di {HORIZON_MONTHS[s.horizon]} mesi
          {CYCLE[s.billingCycle] ? ` · ${CYCLE[s.billingCycle]}` : ""}
        </strong>
      </div>
      <Link href="/account/abbonamento?da=user-profilo">
        <span>Gestisci</span>
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

/** Settimana in corso dentro il blocco: 1 il primo giorno del ciclo. */
export function blockWeek(
  cycle: { startsOn: string; windowDays: number },
  today: string,
) {
  const weeks = Math.max(1, Math.ceil(cycle.windowDays / 7));
  const elapsed = Math.floor(
    (Date.parse(`${today}T12:00:00Z`) -
      Date.parse(`${cycle.startsOn}T12:00:00Z`)) /
      DAY_MS,
  );
  return {
    week: Math.max(1, Math.min(weeks, Math.floor(elapsed / 7) + 1)),
    weeks,
  };
}

function Bars({
  done,
  total,
  tone,
}: {
  done: number;
  total: number;
  tone: "ink" | "lime";
}) {
  return (
    <span className={`pf-sub-bars is-${tone}`} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < done ? "is-on" : undefined} />
      ))}
    </span>
  );
}

/**
 * Il piano come nella demo: versione e orizzonte, obiettivi, settimana del
 * blocco, sessioni della settimana e serie di giorni.
 */
export function PlanBlock({
  home,
  months,
}: {
  home: Home;
  months: number | null;
}) {
  const cycle = home.program.cycle;
  const version = cycle?.version;
  const sessions = home.week.sessions;
  const done = sessions.filter((s) => s.status === "COMPLETED").length;
  const planned = Math.max(sessions.length, cycle?.sessionsPerWeek ?? 0, done);
  const block = cycle ? blockWeek(cycle, home.today) : null;
  return (
    <section className="pf-sub-plan" aria-label="Il tuo piano">
      <Link href="/user/obiettivi" className="pf-sub-plan-head">
        <span className="pf-prof-kicker">
          {[
            version ? `Piano v${version}.0` : "Il tuo piano",
            months ? `${months} mesi` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <b>
          Obiettivi misurabili <span aria-hidden="true">→</span>
        </b>
      </Link>
      <div className="pf-sub-plan-stats">
        {block && (
          <div>
            <span className="pf-prof-kicker">Blocco</span>
            <p>
              <b>{pad(block.week)}</b> / {pad(block.weeks)} settimane
            </p>
            <Bars done={block.week} total={block.weeks} tone="ink" />
          </div>
        )}
        {planned > 0 && (
          <div>
            <span className="pf-prof-kicker">Sessioni settimana</span>
            <p>
              <b>{pad(done)}</b> / {pad(planned)}
            </p>
            <Bars done={done} total={planned} tone="lime" />
          </div>
        )}
      </div>
      <Link href="/user/training" className="pf-sub-streak">
        <div>
          <span className="pf-prof-kicker">La tua serie</span>
          <b>
            {home.streak.days} {home.streak.days === 1 ? "giorno" : "giorni"}
          </b>
        </div>
        <small>
          {home.streak.days > 0
            ? "Chiudi la sessione di oggi per allungare la serie."
            : "Completa una sessione per iniziare la serie."}{" "}
          <span>Apri il calendario →</span>
        </small>
      </Link>
    </section>
  );
}
