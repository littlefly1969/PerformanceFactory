"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FitRankingView } from "../../../components/fit-ranking-editor";
import {
  type FitValues,
  FitTiles,
  bestOptions,
} from "../../../benvenuto/classifica/fit-tiles";
import {
  athleteRequest,
  useAthlete,
} from "../../../user/_components/use-athlete";
import {
  AccountScreen,
  AccountTopBar,
  PillButton,
} from "../../_account/account-shell";
import { summaryHref } from "../../_account/next-step";
import { PLAYTOMIC_BANDS, parsePlaytomic } from "../_profile/playtomic";
import "../_profile/profile.css";
import "../_profile/profile-edit.css";

type Sport = "PADEL" | "TENNIS";
const SPORTS: { sport: Sport; name: string; prefix: "padel" | "tennis" }[] = [
  { sport: "PADEL", name: "padel", prefix: "padel" },
  { sport: "TENNIS", name: "tennis", prefix: "tennis" },
];
const EMPTY: FitValues = {
  padelCurrent: "",
  padelBest: "",
  tennisCurrent: "",
  tennisBest: "",
};

const initial = (view: FitRankingView | undefined) => ({
  values: view?.ranking
    ? {
        padelCurrent: view.ranking.padelCurrent,
        padelBest: view.ranking.padelBest,
        tennisCurrent: view.ranking.tennisCurrent,
        tennisBest: view.ranking.tennisBest,
      }
    : EMPTY,
  card: view?.ranking?.cardNumber ?? "",
  playtomic:
    view?.ranking?.playtomicLevel === null ||
    view?.ranking?.playtomicLevel === undefined
      ? ""
      : String(view.ranking.playtomicLevel).replace(".", ","),
});

/**
 * La tua classifica FITP (demo PF10): padel attuale e migliore di sempre,
 * livello Playtomic, tennis attuale e migliore, tessera facoltativa. Il
 * server vuole le quattro classifiche («Nessuna classifica» vale come
 * risposta) e ricalcola la R se cambiano.
 */
export default function RankingPage() {
  const router = useRouter();
  const { data: view, error: loadError } = useAthlete<FitRankingView>(
    "/athlete-journey/fit-ranking",
  );
  const [edited, setEdited] = useState<ReturnType<typeof initial> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const form = edited ?? initial(view);
  const { values } = form;
  const level = parsePlaytomic(form.playtomic);

  const setValues = (next: Partial<FitValues>) => {
    setMessage("");
    const merged = { ...values, ...next };
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
    setEdited({ ...form, values: merged });
  };
  const setField = (field: "card" | "playtomic", value: string) => {
    setMessage("");
    setEdited({ ...form, [field]: value });
  };

  const save = async () => {
    if (level === undefined) {
      setMessage(
        "Il livello Playtomic va da 0 a 7, con al massimo due decimali.",
      );
      return;
    }
    const missing = SPORTS.find(
      ({ prefix }) => !values[`${prefix}Current`] || !values[`${prefix}Best`],
    );
    if (missing) {
      setMessage(
        `Completa la classifica di ${missing.name}, attuale e migliore di sempre: se non ne hai, scegli «Nessuna classifica».`,
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const saved = await athleteRequest<FitRankingView>(
        "/athlete-journey/fit-ranking",
        { ...values, cardNumber: form.card, playtomicLevel: level },
      );
      if (saved.recalculationPending) {
        setMessage(
          "Classifica salvata, ma non siamo riusciti a ricalcolare la tua R. Riprova.",
        );
        setBusy(false);
        return;
      }
      router.push(summaryHref("classifica"));
    } catch (e) {
      setMessage(
        (e as Error).message ||
          "Non è stato possibile salvare la classifica. Riprova.",
      );
      setBusy(false);
    }
  };

  const sportTiles = (sport: Sport, prefix: "padel" | "tennis") =>
    view && (
      <>
        <FitTiles
          sport={sport}
          title="Attuale"
          options={view.options[sport]}
          value={values[`${prefix}Current`]}
          onChange={(value) =>
            setValues({ [`${prefix}Current`]: value } as Partial<FitValues>)
          }
        />
        <FitTiles
          sport={sport}
          title="Migliore di sempre"
          options={view.options[sport]}
          allowed={bestOptions(view.options[sport], values[`${prefix}Current`])}
          value={values[`${prefix}Best`]}
          onChange={(value) =>
            setValues({ [`${prefix}Best`]: value } as Partial<FitValues>)
          }
        />
      </>
    );

  return (
    <AccountScreen
      top={
        <AccountTopBar title="La tua classifica FIT" back="/journey/profilo" />
      }
      footer={
        <PillButton
          tone="lime"
          disabled={busy || !view}
          onClick={() => void save()}
        >
          {busy ? "Salvataggio…" : "Salva classifica"}
        </PillButton>
      }
    >
      <div className="pf-edit">
        <h1>La tua classifica FITP</h1>
        <p className="pf-edit-lead">
          La usiamo in ogni valutazione. Puoi aggiornarla quando vuoi.
        </p>
        {view && (
          <>
            <section className="pf-edit-section">
              <h2>Classifica FIT di padel</h2>
              {sportTiles("PADEL", "padel")}
            </section>
            <section className="pf-edit-section">
              <h2>Livello Playtomic di padel</h2>
              <label className="pf-edit-field">
                <span>Il tuo livello attuale (da 0 a 7)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Es. 2,75"
                  aria-invalid={level === undefined}
                  value={form.playtomic}
                  onChange={(e) => setField("playtomic", e.target.value)}
                />
              </label>
              <ul className="pf-edit-bands" aria-label="Fasce Playtomic">
                {PLAYTOMIC_BANDS.map((b) => {
                  const on =
                    typeof level === "number" &&
                    level >= b.min &&
                    level < b.max;
                  return (
                    <li key={b.name}>
                      <button
                        type="button"
                        className={on ? "is-on" : undefined}
                        aria-pressed={on}
                        onClick={() => setField("playtomic", b.mid)}
                      >
                        {b.name}
                        <span>{b.range}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className="pf-edit-section">
              <h2>Classifica FIT di tennis</h2>
              {sportTiles("TENNIS", "tennis")}
            </section>
            <label className="pf-edit-field pf-edit-section">
              <span>Numero di tessera FIT (facoltativo)</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={30}
                value={form.card}
                onChange={(e) => setField("card", e.target.value)}
              />
            </label>
          </>
        )}
        {!view && !loadError && (
          <p className="pf-acc-muted" role="status">
            Carichiamo le classifiche…
          </p>
        )}
        {(message || loadError) && (
          <p className="pf-acc-error" role="alert">
            {message || loadError}
          </p>
        )}
      </div>
    </AccountScreen>
  );
}
