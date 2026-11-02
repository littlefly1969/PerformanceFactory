"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WelcomeIntro, WelcomeShell } from "../_components/welcome-shell";
import {
  athleteRequest,
  useAthlete,
} from "../../user/_components/use-athlete";
import type { FitRankingView } from "../../components/fit-ranking-editor";
import { FitTiles, type FitValues, bestOptions } from "./fit-tiles";

const NEXT = "/benvenuto/spider";
type Sport = "PADEL" | "TENNIS";
const SPORTS: { sport: Sport; name: string; prefix: "padel" | "tennis" }[] = [
  { sport: "PADEL", name: "Padel", prefix: "padel" },
  { sport: "TENNIS", name: "Tennis", prefix: "tennis" },
];
const EMPTY: FitValues = {
  padelCurrent: "",
  padelBest: "",
  tennisCurrent: "",
  tennisBest: "",
};

const initialValues = (view: FitRankingView | undefined): FitValues =>
  view?.ranking
    ? {
        padelCurrent: view.ranking.padelCurrent,
        padelBest: view.ranking.padelBest,
        tennisCurrent: view.ranking.tennisCurrent,
        tennisBest: view.ranking.tennisBest,
      }
    : EMPTY;

/**
 * 02 · La tua classifica (demo PF10): padel e tennis a schede, attuale e
 * migliore di sempre, tessera facoltativa. Stesso salvataggio della pagina
 * dell'account; il servizio vuole le quattro voci, quindi si salva solo a
 * classifica completa («Nessuna classifica» vale come risposta).
 */
export default function WelcomeRankingPage() {
  const router = useRouter();
  const { data: view, error: loadError } = useAthlete<FitRankingView>(
    "/athlete-journey/fit-ranking",
  );
  const [edited, setEdited] = useState<FitValues | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const [tab, setTab] = useState<Sport>("PADEL");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const values = edited ?? initialValues(view);
  const cardNumber = card ?? view?.ranking?.cardNumber ?? "";
  const touched = edited !== null || card !== null;
  const filled = SPORTS.filter(
    ({ prefix }) => values[`${prefix}Current`] && values[`${prefix}Best`],
  );
  const complete = filled.length === SPORTS.length;
  const any = Object.values(values).some(Boolean) || !!cardNumber;

  const set = (next: Partial<FitValues>) => {
    setMessage("");
    setEdited((previous) => {
      const merged = { ...(previous ?? values), ...next };
      for (const { sport, prefix } of SPORTS) {
        const current = merged[`${prefix}Current`];
        const allowed = bestOptions(view?.options[sport] ?? [], current);
        // La migliore non può stare sotto l'attuale; con una sola scelta
        // possibile (attuale al vertice) si compila da sola.
        if (!allowed.some((o) => o.value === merged[`${prefix}Best`]))
          merged[`${prefix}Best`] = "";
        if (current && allowed.length === 1)
          merged[`${prefix}Best`] = allowed[0].value;
      }
      return merged;
    });
  };

  const proceed = async () => {
    if (!touched || !any) return router.push(NEXT);
    if (!complete) {
      const missing = SPORTS.find(
        ({ prefix }) => !values[`${prefix}Current`] || !values[`${prefix}Best`],
      )!;
      setTab(missing.sport);
      setMessage(
        `Completa anche la classifica di ${missing.name.toLowerCase()}: se non ne hai, scegli «Nessuna classifica».`,
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const saved = await athleteRequest<FitRankingView>(
        "/athlete-journey/fit-ranking",
        { ...values, cardNumber },
      );
      if (saved.recalculationPending) {
        setMessage(
          "Classifica salvata, ma non siamo riusciti a ricalcolare la tua R. Riprova.",
        );
        setBusy(false);
        return;
      }
      router.push(NEXT);
    } catch (e) {
      setMessage(
        (e as Error).message ||
          "Non è stato possibile salvare la classifica. Riprova.",
      );
      setBusy(false);
    }
  };

  return (
    <WelcomeShell
      step={2}
      back="/benvenuto/foto"
      skipHref={NEXT}
      footer={
        <button
          type="button"
          className="pf-welcome-cta"
          disabled={busy || !view}
          onClick={() => void proceed()}
        >
          {busy ? "Salvataggio…" : any ? "Continua" : "Lo farò dopo"}
        </button>
      }
    >
      <WelcomeIntro step={2} kicker="La tua classifica" title="Che classifica hai?">
        Le classifiche FITP di padel e tennis ci dicono da dove parti. Se non ne
        hai, scegli «Nessuna classifica».
      </WelcomeIntro>
      <div className="pf-fit-step">
        {view && (
          <>
            <div className="pf-fit-tabs" role="tablist" aria-label="Sport">
              {SPORTS.map(({ sport, name, prefix }) => (
                <button
                  key={sport}
                  type="button"
                  role="tab"
                  id={`pf-fit-tab-${sport}`}
                  aria-selected={tab === sport}
                  aria-controls={`pf-fit-panel-${sport}`}
                  className={tab === sport ? "is-selected" : undefined}
                  onClick={() => setTab(sport)}
                >
                  {name}
                  {values[`${prefix}Current`] && values[`${prefix}Best`] && (
                    <i aria-label="compilata" />
                  )}
                </button>
              ))}
            </div>
            {SPORTS.filter((s) => s.sport === tab).map(
              ({ sport, name, prefix }) => (
                <div
                  key={sport}
                  role="tabpanel"
                  id={`pf-fit-panel-${sport}`}
                  aria-labelledby={`pf-fit-tab-${sport}`}
                >
                  <FitTiles
                    sport={sport}
                    title={`Classifica ${name.toLowerCase()} · attuale`}
                    options={view.options[sport]}
                    value={values[`${prefix}Current`]}
                    onChange={(value) =>
                      set({ [`${prefix}Current`]: value } as Partial<FitValues>)
                    }
                  />
                  {values[`${prefix}Current`] && (
                      <FitTiles
                        sport={sport}
                        title="Migliore di sempre"
                        options={view.options[sport]}
                        allowed={bestOptions(
                          view.options[sport],
                          values[`${prefix}Current`],
                        )}
                        value={values[`${prefix}Best`]}
                        onChange={(value) =>
                          set({ [`${prefix}Best`]: value } as Partial<FitValues>)
                        }
                      />
                    )}
                </div>
              ),
            )}
            <label className="pf-fit-card-field">
              <span>Numero di tessera FIT · facoltativo</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={30}
                placeholder="Es. 1234567"
                value={cardNumber}
                onChange={(e) => {
                  setMessage("");
                  setCard(e.target.value);
                }}
              />
            </label>
          </>
        )}
        {!view && !loadError && (
          <p className="pf-welcome-note" role="status">
            Carichiamo le classifiche…
          </p>
        )}
        {(message || loadError) && (
          <p role="alert" className="pf-welcome-error">
            {message || loadError}
          </p>
        )}
      </div>
    </WelcomeShell>
  );
}
