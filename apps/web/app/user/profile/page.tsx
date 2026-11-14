"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AccountSubscription } from "../../account/abbonamento/page";
import { AccountMenu } from "../../components/account-menu";
import type { FitRankingView } from "../../components/fit-ranking-editor";
import {
  type AthleteProfile,
  percent,
  shortName,
  useResource,
} from "../../journey/_account/account-data";
import { AccountScreen } from "../../journey/_account/account-shell";
import {
  definedAreas,
  isConsolidated,
} from "../../journey/_account/calibration-state";
import type { Journey } from "../../journey/journey-types";
import {
  AVAILABILITY_PATH,
  type Availability,
  availabilityComplete,
} from "../../journey/profilo/_profile/availability";
import {
  AvailabilityCard,
  ExternalIcon,
  FitCard,
  LinkCard,
  TodoCard,
} from "../../journey/profilo/_profile/profile-cards";
import {
  AreaRing,
  type HexAxis,
  ProfileHex,
} from "../../journey/profilo/_profile/profile-hex";
import { fromSubscriber } from "../../journey/profilo/_profile/profile-origin";
import type { Home } from "../_components/athlete-types";
import {
  RANKING_PATH,
  type RankingView,
  markAnnounced,
} from "../ranking/ranking-data";
import { RankingVisibility } from "../ranking/ranking-visibility";
import { MarketingPreference, ReferralCard } from "./marketing-and-referral";
import {
  PlanBlock,
  RankingPopup,
  RankingRow,
  SubscriptionCard,
} from "./subscriber-parts";
import "../../journey/profilo/_profile/profile.css";
import "../../journey/profilo/_profile/profile-body.css";
import "../ranking/ranking.css";
import "./subscriber-profile.css";

const MONTHS = { PROGRAM_3M: 3, PROGRAM_6M: 6, PROGRAM_12M: 12 } as const;

const GearIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
  </svg>
);

/** Esagono vuoto finché la valutazione non arriva. */
const placeholderAxes: HexAxis[] = Array.from({ length: 6 }, (_, i) => ({
  id: `area-${i}`,
  label: "",
  score: null,
  confidence: 0,
  defined: false,
}));

/**
 * Profilo dell'abbonato, come il profilo con il piano attivo della demo V11:
 * testata scura con l'esagono e R, riga del ranking (con il pop-up della
 * fascia), disponibilità e classifica FIT, le sei aree, l'abbonamento con
 * «Gestisci», il piano, l'analisi delle aree, invito e community. In fondo
 * le preferenze: nome nel ranking, comunicazioni e link di invito.
 */
export default function SubscriberProfilePage() {
  const journey = useResource<Journey>("/auth/journey");
  const profile = useResource<AthleteProfile>("/athlete-journey/profile");
  const home = useResource<Home>("/athlete/home");
  const account = useResource<AccountSubscription>(
    "/payments/subscription/account",
  );
  const ranking = useResource<RankingView>(RANKING_PATH);
  const availability = useResource<Availability>(AVAILABILITY_PATH);
  const fit = useResource<FitRankingView>("/athlete-journey/fit-ranking");
  const [info, setInfo] = useState(false);
  const [popup, setPopup] = useState(false);
  const rank = ranking.data?.status === "RANKED" ? ranking.data : null;
  useEffect(() => {
    if (rank?.announce) setPopup(true);
  }, [rank?.announce]);
  const closePopup = useCallback(
    (open: boolean) => {
      setPopup(false);
      if (rank) void markAnnounced(rank.band);
      if (!open && rank) ranking.setData({ ...rank, announce: false });
    },
    [rank, ranking],
  );

  const j = journey.data ?? null;
  const evaluation = j?.evaluation ?? null;
  const calibration = j?.calibration ?? null;
  const closed = isConsolidated(calibration) || !calibration;
  const rule = calibration?.consolidationRule.minOverallConfidence ?? null;
  const global = profile.data?.global ?? null;
  const defined = evaluation
    ? definedAreas(calibration, evaluation.drivers)
    : new Set<string>();
  const axes: HexAxis[] = evaluation
    ? evaluation.drivers.map((d) => ({
        id: d.id,
        label: shortName(d.name),
        score: d.score,
        confidence: d.confidence,
        defined: defined.has(d.id),
      }))
    : placeholderAxes;
  const total = evaluation?.drivers.length ?? 0;
  const firstName = (
    profile.data?.firstName ??
    home.data?.firstName ??
    ""
  ).trim();
  const availabilityDone =
    !!availability.data && availabilityComplete(availability.data);
  const subscription = account.data?.subscription ?? null;
  const months = subscription ? MONTHS[subscription.horizon] : null;
  const loadError = journey.error || home.error;
  return (
    <AccountScreen nav="profile" subscriber>
      <header className="pf-prof-head">
        <div className="pf-prof-glow" aria-hidden="true" />
        <div className="pf-prof-top">
          <AccountMenu
            name={firstName}
            from="user-profilo"
            className="pf-prof-avatar"
            align="start"
          />
          <Link
            href="/account?da=user-profilo"
            className="pf-prof-gear"
            aria-label="Impostazioni"
          >
            <GearIcon />
          </Link>
        </div>
        <h1 className="pf-sr-only">
          {firstName ? `Il profilo di ${firstName}` : "Il tuo profilo"}
        </h1>
        <ProfileHex
          axes={axes.length >= 3 ? axes : placeholderAxes}
          overallConfidence={evaluation ? evaluation.overallConfidence : null}
          scale={evaluation?.scale ?? { min: 0, max: 100 }}
        />
        {evaluation && global && (
          <>
            <div className="pf-prof-r">
              <p>
                <span>R</span>
                <b>
                  {closed ? "" : "≈ "}
                  {global.value}
                </b>
              </p>
              <div>
                <span className={`pf-prof-chip${closed ? " is-done" : ""}`}>
                  {closed ? "Sufficientemente completo" : "Profilo provvisorio"}
                </span>
                <button
                  type="button"
                  className="pf-prof-info-btn"
                  aria-expanded={info}
                  aria-controls="pf-prof-info"
                  aria-label={
                    info ? "Chiudi le informazioni su R" : "Informazioni su R"
                  }
                  onClick={() => setInfo(!info)}
                >
                  {info ? "×" : "i"}
                </button>
              </div>
            </div>
            {info && (
              <div className="pf-prof-info" id="pf-prof-info">
                <div>
                  <b>
                    {closed
                      ? "Stima stabile"
                      : `Tra ${global.low} e ${global.high}`}
                  </b>
                  <span>
                    Confidenza complessiva {percent(global.confidence)}
                  </span>
                </div>
                <p>
                  {closed
                    ? "Hai dati sufficienti in tutte e sei le aree: la stima regge abbastanza per costruire il piano."
                    : "La stima si basa su dati ancora parziali. L’intervallo si stringe man mano che completi le aree."}
                </p>
                {rule !== null && (
                  <span className="pf-prof-info-note">
                    Soglia di completezza {percent(rule)}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </header>

      <div className="pf-prof-body">
        {loadError && (
          <p className="pf-acc-error" role="alert">
            {loadError}
          </p>
        )}
        {rank && <RankingRow view={rank} />}
        {availability.data !== undefined && !availabilityDone && (
          <TodoCard
            href={fromSubscriber("/journey/profilo/disponibilita", true)}
            title="Quale è la tua disponibilità?"
          />
        )}
        {fit.data !== undefined && !fit.data?.ranking && (
          <TodoCard
            href={fromSubscriber("/journey/profilo/classifica", true)}
            title="La tua classifica FITP"
          />
        )}

        {evaluation && (
          <section className="pf-prof-areas" aria-labelledby="pf-prof-areas">
            <div className="pf-prof-section-head">
              <h2 id="pf-prof-areas">Le sei aree</h2>
              <span>
                {defined.size} di {total} aree definite
              </span>
            </div>
            <ul>
              {evaluation.drivers.map((d) => (
                <li key={d.id}>
                  <Link href={`/user/areas/${d.id}`}>
                    <AreaRing
                      confidence={d.confidence}
                      defined={defined.has(d.id)}
                    >
                      {Math.round(d.score)}
                    </AreaRing>
                    <span>{d.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {account.data && <SubscriptionCard account={account.data} />}
        {home.data && <PlanBlock home={home.data} months={months} />}

        <LinkCard
          href="/user/performance"
          kicker={
            evaluation
              ? `${total}/${total} stimati · ${defined.size}/${total} verificati`
              : undefined
          }
          title="Analisi delle sei aree"
        />
        {availabilityDone && (
          <AvailabilityCard value={availability.data!} subscriber />
        )}
        {fit.data?.ranking && <FitCard view={fit.data} subscriber />}
        {!!home.data?.coaches.length && (
          <section className="pf-prof-done pf-sub-coach">
            <span className="pf-prof-kicker">
              {home.data.coaches.length === 1 ? "Il tuo coach" : "I tuoi coach"}
            </span>
            {home.data.coaches.map((c, i) => (
              <b key={i}>{c.name}</b>
            ))}
          </section>
        )}
        <LinkCard
          href={fromSubscriber("/journey/profilo/invita", true)}
          title="Invita un amico"
        />
        <LinkCard
          href={fromSubscriber("/journey/profilo/community", true)}
          title="Unisciti alla community"
          tone="outline"
          icon={<ExternalIcon />}
        />

        <section className="pf-sub-prefs" aria-labelledby="pf-sub-prefs">
          <h2 id="pf-sub-prefs" className="pf-prof-kicker">
            Preferenze
          </h2>
          {ranking.data && ranking.data.status !== "OFF" && (
            <RankingVisibility granted={ranking.data.visible} />
          )}
          <MarketingPreference />
          <ReferralCard />
        </section>
      </div>
      {popup && rank && <RankingPopup view={rank} onClose={closePopup} />}
    </AccountScreen>
  );
}
