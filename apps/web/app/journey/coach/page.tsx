"use client";
import { useEffect, useState } from "react";
import {
  type FreeLessonView,
  postJson,
  useResource,
} from "../_account/account-data";
import { AccountScreen, PillLink } from "../_account/account-shell";
import {
  microTestOpen,
  useAccountJourney,
} from "../_account/calibration-state";
import { nextStep, summaryHref } from "../_account/next-step";
import { MicroTestTab } from "./micro-test";

type Tab = "ai" | "pro" | "micro";

const TABS: { tab: Tab; label: string }[] = [
  { tab: "ai", label: "AI Coach" },
  { tab: "pro", label: "Coach Pro" },
  { tab: "micro", label: "Micro-test" },
];

/**
 * Coach: l'AI Coach e il Coach Pro arrivano con il piano; nella fase
 * gratuita qui vivono i micro-test proposti dall'AI.
 */
export default function CoachPage() {
  const { journey: j, error, refresh } = useAccountJourney();
  const lesson = useResource<FreeLessonView>("/athlete-journey/free-lesson");
  const [tab, setTab] = useState<Tab>("micro");
  const [resultRound, setResultRound] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const round = params.get("round");
    const requested = params.get("tab");
    // Lettura una tantum dell'indirizzo: tab e risultato da mostrare.
    if (round) setResultRound(round);
    if (requested === "ai" || requested === "pro") setTab(requested);
  }, []);
  const calibration = j?.calibration ?? null;
  const dot = microTestOpen(calibration);
  return (
    <AccountScreen nav="coach" coachDot={dot}>
      <header className="pf-acc-coach-head">
        <span className="pf-acc-kicker">Coach</span>
        <h1>Non ti fermi mai da solo.</h1>
      </header>
      <div className="pf-acc-tabs" role="tablist" aria-label="Coach">
        {TABS.map((t) => (
          <button
            key={t.tab}
            type="button"
            role="tab"
            aria-selected={tab === t.tab}
            className={tab === t.tab ? "is-active" : undefined}
            onClick={() => setTab(t.tab)}
          >
            {t.label}
            {t.tab === "micro" && dot && (
              <span className="pf-acc-tab-dot" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      {(error || failure) && (
        <p className="pf-acc-error" role="alert">
          {failure || error}
        </p>
      )}
      <div role="tabpanel">
        {tab === "ai" && (
          <section className="pf-acc-micro">
            <h2>Il tuo AI Coach arriva con il piano.</h2>
            <p>
              Risposte e adattamenti sul tuo programma, ogni giorno. Prima
              finiamo di conoscerti: la calibrazione rende la stima affidabile.
            </p>
            <PillLink href="/journey/calibrazione" tone="outline">
              Stato della calibrazione
            </PillLink>
          </section>
        )}
        {tab === "pro" && (
          <section className="pf-acc-micro">
            <h2>Un professionista accanto all’AI.</h2>
            <p>
              Un coach certificato può seguire il tuo percorso su richiesta, con
              il tuo consenso. Arriva con il piano.
            </p>
          </section>
        )}
        {tab === "micro" && j && (
          <MicroTestTab
            calibration={calibration}
            evaluation={j.evaluation ?? null}
            resultRound={resultRound}
            saved={saved}
            next={lesson.data === undefined ? null : nextStep(j, lesson.data)}
            onAnswered={async (roundId, answers) => {
              setFailure("");
              try {
                await postJson("/athlete-journey/calibration/answers", {
                  roundId,
                  answers,
                });
              } catch (e) {
                // Invio non riuscito: la prova resta aperta con le scelte fatte.
                setFailure(
                  `Esito non salvato: ${e instanceof Error ? e.message : "riprova."}`,
                );
                return;
              }
              // Salvato: il risultato si consulta dall'indirizzo senza reinviare.
              window.history.replaceState(
                null,
                "",
                `/journey/coach?round=${roundId}`,
              );
              setSaved(roundId);
              setResultRound(roundId);
              // Valutazione e lezione cambiano con l'esito: si rileggono.
              await Promise.all([
                refresh().catch(() => undefined),
                lesson.reload(),
              ]);
            }}
            onSkip={async (roundId) => {
              setFailure("");
              try {
                await postJson("/athlete-journey/calibration/skip", {
                  roundId,
                });
                window.location.assign(summaryHref("micro-test-rimandato"));
              } catch (e) {
                setFailure(e instanceof Error ? e.message : "Riprova.");
              }
            }}
          />
        )}
      </div>
    </AccountScreen>
  );
}
