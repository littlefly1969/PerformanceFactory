import { ClubCarousel, type GiftClub } from "./club-carousel";

export type GiftArea = { id: string; name: string; real: boolean };

export type GiftView =
  | { enabled: false }
  | {
      enabled: true;
      clubs: GiftClub[];
      attributedClubId: string | null;
      areas: GiftArea[];
    };

/** Sigle di cinque lettere sotto le barre; le aree senza sigla usano l'inizio del nome. */
const AREA_SHORT: Record<string, string> = {
  "Allenamento mentale": "MENTA",
  "Preparazione atletica": "PREPA",
  "Tecnico-tattica": "TECNI",
};

export const areaShort = (name: string) =>
  AREA_SHORT[name] ??
  name
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 5)
    .toUpperCase();

/** Passo 3 di 4 dell'accoglienza dopo la registrazione. */
const STEP = 3;
const STEPS = 4;
/** Passo successivo dell'accoglienza: invito a installare l'app (PWA). */
export const NEXT_STEP = "/benvenuto/installa";

/**
 * Schermata 03 · Il tuo regalo: la lezione di prova nei circoli affiliati e
 * quanto manca a una Performance completamente Reale.
 */
export function GiftScreen({
  clubs,
  areas,
  onContinue,
  onSkip,
}: {
  clubs: GiftClub[];
  areas: GiftArea[];
  onContinue: () => void;
  onSkip: () => void;
}) {
  const real = areas.filter((area) => area.real).length;
  return (
    <main className="pf-gift">
      <div className="pf-gift-column">
        <header className="pf-gift-header">
          <ol
            className="pf-gift-steps"
            aria-label={`Passo ${STEP} di ${STEPS}`}
          >
            {Array.from({ length: STEPS }, (_, i) => (
              <li
                key={i}
                className={
                  i + 1 === STEP ? "is-current" : i + 1 < STEP ? "is-done" : ""
                }
              />
            ))}
          </ol>
          <button type="button" className="pf-gift-skip" onClick={onSkip}>
            Salta
          </button>
        </header>

        <p className="pf-gift-kicker">03 · Il tuo regalo</p>
        {clubs.length > 0 && <ClubCarousel clubs={clubs} />}

        <section className="pf-gift-offer" aria-labelledby="pf-gift-title">
          <h1 id="pf-gift-title">
            <span className="pf-gift-one" aria-hidden>
              1
            </span>
            <span className="pf-gift-sr">Una </span>
            lezione di prova, gratis.
          </h1>
          <p>
            Si sblocca quando la tua Performance sarà completamente Reale: tutte
            {areas.length === 6 ? " e sei" : ""} le aree misurate in campo,
            niente più tratteggio.
          </p>
          {areas.length > 0 && (
            <>
              <ul className="pf-gift-areas">
                {areas.map((area) => (
                  <li key={area.id} className={area.real ? "is-real" : ""}>
                    <span aria-hidden />
                    <abbr title={area.name}>{areaShort(area.name)}</abbr>
                  </li>
                ))}
              </ul>
              <p className="pf-gift-count">
                {`${real} di ${areas.length} aree reali`}
              </p>
            </>
          )}
        </section>

        <button type="button" className="pf-gift-continue" onClick={onContinue}>
          Continua
        </button>
      </div>
    </main>
  );
}
