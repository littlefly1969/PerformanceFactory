"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { API_BASE, secureFetch } from "../lib/api";
import { LogoutButton } from "../components/logout-button";
import { AccountMenu } from "../components/account-menu";
import type { Journey } from "./journey-types";
import { AccountNav } from "./_account/account-shell";
import "../start/pf4.css";
import "./welcome-home.css";

/**
 * La lezione si promette solo se il server la rende possibile: funzione attiva
 * per l'atleta e almeno un circolo. Prima dell'assessment la fase è sempre
 * UNAVAILABLE (nessuna calibrazione), quindi decidono flag e circoli.
 */
function useLessonOffered() {
  const [offered, setOffered] = useState(false);
  useEffect(() => {
    let alive = true;
    secureFetch(`${API_BASE}/athlete-journey/free-lesson`)
      .then((response) => (response.ok ? response.json() : null))
      .then((view: { enabled?: boolean; clubs?: unknown[] } | null) => {
        if (alive) setOffered(!!view?.enabled && (view.clubs?.length ?? 0) > 0);
      })
      .catch(() => {
        /* Senza risposta nessuna promessa: resta la card generica. */
      });
    return () => {
      alive = false;
    };
  }, []);
  return offered;
}

/** Esagono vuoto: lo Spider nasce con le prime risposte. */
function EmptySpider() {
  const ring = (r: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      return `${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`;
    }).join(" ");
  return (
    <svg viewBox="0 0 100 100" width="112" height="112" aria-hidden="true">
      {[44, 33, 22, 11].map((r) => (
        <polygon key={r} points={ring(r)} />
      ))}
    </svg>
  );
}

/**
 * Home prima dell'assessment (dopo il benvenuto): è anche dove si atterra
 * aprendo l'app installata. Il passo principale è iniziare l'assessment, che
 * sblocca la lezione gratuita.
 */
export function WelcomeHome({
  journey,
  busy,
  error,
  onStart,
}: {
  journey: Journey;
  busy: boolean;
  error?: string;
  onStart: () => void;
}) {
  const lesson = useLessonOffered();
  const name = journey.firstName?.trim();
  const answered = Math.min(journey.currentQuestion, journey.count);
  const percent = journey.count
    ? Math.round((answered / journey.count) * 100)
    : 0;
  return (
    <main className="pf-home">
      <div className="pf-home-frame">
        <header className="pf-home-header">
          <span className="pf-home-brand">
            <b aria-hidden="true">P</b> Performance Factory
          </span>
          <AccountMenu name={name} from="home" className="pf-home-avatar" />
        </header>

        <h1>{name ? `Ciao ${name}.` : "Ciao."}</h1>
        <span className="pf-home-tag">Profilo da iniziare</span>

        {error && (
          <p className="pf-home-error" role="alert">
            {error}
          </p>
        )}

        <section className="pf-home-lesson" aria-labelledby="pf-home-lesson">
          <div className="pf-home-lesson-head">
            <div
              className="pf-home-ring"
              role="img"
              aria-label={`Assessment al ${percent}%`}
              style={
                { "--pf-ring": `${percent * 3.6}deg` } as React.CSSProperties
              }
            >
              <span>{percent}%</span>
            </div>
            <div>
              <span className="pf-home-kicker">
                {lesson ? "Lezione gratuita" : "Il tuo assessment"}
              </span>
              <h2 id="pf-home-lesson">
                {lesson
                  ? "Completa l’assessment: è il primo passo per sbloccarla."
                  : "Scopri dove sei oggi."}
              </h2>
            </div>
          </div>
          <p>
            {answered} di {journey.count} domande
            {lesson
              ? " · poi continui con domande e test fino a sbloccare la lezione di prova."
              : " · da qui nasce il tuo Spider."}
          </p>
          <button
            type="button"
            className="pf-home-cta"
            disabled={busy}
            onClick={onStart}
          >
            <span>
              {busy ? "Prepariamo le domande…" : "Inizia l’assessment"}
            </span>
            <span aria-hidden="true">→</span>
          </button>
        </section>

        {/* Lo Spider porta al profilo, dove nasce con le prime risposte. */}
        <Link
          className="pf-home-card pf-home-spider"
          href="/journey/profilo"
          aria-label="Il tuo Spider: vai al profilo"
        >
          <EmptySpider />
          <div>
            <span className="pf-home-kicker">Il tuo Spider</span>
            <strong>R —</strong>
            <p>Rispondi alle prime domande: lo Spider nasce provvisorio.</p>
          </div>
        </Link>

        <footer className="pf-home-footer">
          <LogoutButton className="pf-home-logout" />
        </footer>
      </div>
      <AccountNav active="home" />
    </main>
  );
}
