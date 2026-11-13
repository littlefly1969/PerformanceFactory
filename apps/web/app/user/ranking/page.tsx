"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useResource } from "../../journey/_account/account-data";
import {
  AccountScreen,
  AccountTopBar,
} from "../../journey/_account/account-shell";
import {
  BandHex,
  RANKING_PATH,
  type RankedView,
  type RankingView,
  count,
  markAnnounced,
} from "./ranking-data";
import { RankingVisibility } from "./ranking-visibility";
import "./ranking.css";
import "./ranking-page.css";

const bar = (value: number) => `${Math.max(0, Math.min(100, value))}%`;

function Ranked({ view }: { view: RankedView }) {
  const example = view.example;
  const [upper, lower] = example
    ? example.realFavoured
      ? example.athletes
      : [...example.athletes].reverse()
    : [];
  return (
    <>
      <section className="pf-rank-hero" aria-label="La tua posizione">
        <div className="pf-rank-hero-hex">
          <BandHex code={view.band} size={120} />
          <span className="pf-rank-hero-label">Fascia</span>
        </div>
        <div>
          <span className="pf-rank-kicker">La tua posizione</span>
          <p className="pf-rank-pos">
            <b>{count(view.position)}°</b> in {view.band}
          </p>
          <span className="pf-rank-sub">
            su {count(view.size)} {view.size === 1 ? "giocatore" : "giocatori"}
          </span>
        </div>
      </section>

      <section className="pf-rank-card" aria-label="Reale e potenziale">
        <div className="pf-rank-pair">
          <div>
            <span className="pf-rank-kicker">Reale</span>
            <b>{view.real}</b>
          </div>
          <div>
            <span className="pf-rank-kicker">Potenziale</span>
            <b className="is-lime">{view.potential}</b>
          </div>
        </div>
        <div className="pf-rank-bar" aria-hidden="true">
          <i className="is-pot" style={{ width: bar(view.potential) }} />
          <i className="is-real" style={{ width: bar(view.real) }} />
        </div>
        <p>
          La fascia la decide l’algoritmo: conta per il {view.weights.real}% il
          reale e per il {view.weights.potential}% il potenziale a {view.months}{" "}
          mesi, non un solo numero.
        </p>
      </section>

      <h2 className="pf-rank-kicker pf-rank-title">Classifica {view.band}</h2>
      <ol className="pf-rank-board" aria-label={`Classifica ${view.band}`}>
        {view.board.map((row) => (
          <li
            key={row.position}
            className={row.me ? "is-me" : undefined}
            aria-current={row.me ? "true" : undefined}
          >
            <span>{count(row.position)}°</span>
            <b>{row.name}</b>
            <span>
              {row.real} <small>/ {row.potential}</small>
            </span>
          </li>
        ))}
      </ol>
      <span className="pf-rank-legend">Reale / potenziale</span>

      {example && upper && lower && (
        <section className="pf-rank-example" aria-labelledby="pf-rank-example">
          <h2 id="pf-rank-example" className="pf-rank-kicker is-lime">
            Perché numeri simili, fasce diverse
          </h2>
          <ul>
            {example.athletes.map((a) => (
              <li key={a.name}>
                <span className="pf-rank-pill">{a.band}</span>
                <span>
                  {a.name} ·{" "}
                  <small>
                    {a.real} su {a.potential}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          <p>
            {example.realFavoured
              ? `${upper.name} ha un potenziale più basso, ma l’algoritmo dà più peso al reale: va in ${upper.band}.`
              : `${upper.name} ha un reale più basso, ma l’algoritmo dà più peso al potenziale: va in ${upper.band}.`}{" "}
            Dentro ogni fascia ognuno ha la sua posizione.
          </p>
        </section>
      )}

      <h2 className="pf-rank-kicker pf-rank-title">Le quattro fasce</h2>
      <ul className="pf-rank-ladder">
        {view.bands.map((b) => (
          <li key={b.code} className={b.me ? "is-me" : undefined}>
            <b>{b.code}</b>
            <div>
              <span>{b.text}</span>
              <small>
                {count(b.size)} {b.size === 1 ? "giocatore" : "giocatori"}
              </small>
            </div>
            {b.me && <em>Sei qui</em>}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Ranking della piattaforma (demo V10/V11): fascia, posizione nella fascia,
 * reale e potenziale, i due atleti sopra e i due sotto, l'esempio dei
 * numeri simili in fasce diverse e le quattro fasce. Solo per gli abbonati.
 */
export default function RankingPage() {
  const ranking = useResource<RankingView>(RANKING_PATH);
  const view = ranking.data;
  // Chi apre la schermata ha visto la fascia: il pop-up non serve più.
  const band = view?.status === "RANKED" && view.announce ? view.band : null;
  useEffect(() => {
    if (band) void markAnnounced(band);
  }, [band]);
  return (
    <AccountScreen
      tone="dark"
      top={
        <AccountTopBar title="Ranking della piattaforma" back="/user/profile" />
      }
    >
      <div className="pf-rank">
        <div className="pf-rank-glow" aria-hidden="true" />
        {ranking.error && (
          <p className="pf-acc-error" role="alert">
            {ranking.error}
          </p>
        )}
        {view === undefined && !ranking.error && (
          <p role="status" className="pf-rank-sub">
            Calcoliamo la tua posizione…
          </p>
        )}
        {view?.status === "RANKED" && <Ranked view={view} />}
        {view?.status === "OFF" && (
          <p className="pf-rank-empty">Il ranking non è ancora attivo.</p>
        )}
        {view?.status === "NOT_RANKED" && (
          <p className="pf-rank-empty">
            {view.subscribed
              ? "Il tuo posto in classifica arriva appena c’è il potenziale del tuo percorso."
              : "Il ranking è per chi ha un programma attivo."}{" "}
            {!view.subscribed && (
              <Link href="/user/profile">Torna al profilo</Link>
            )}
          </p>
        )}
        {view && view.status !== "OFF" && (
          <RankingVisibility granted={view.visible} tone="dark" />
        )}
        {view?.status === "RANKED" && (
          <p className="pf-rank-foot">
            Reale e potenziale si aggiornano con le tue nuove valutazioni: la
            posizione segue. Non è la classifica FITP.
          </p>
        )}
      </div>
    </AccountScreen>
  );
}
