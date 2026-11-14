import { tapGuard } from "../_components/tap-guard";
import { ClubCarousel, type GiftClub } from "./club-carousel";

const guard = tapGuard("welcome-4");

export type GiftArea = { id: string; name: string; real: boolean };

export type GiftView =
  | { enabled: false }
  | {
      enabled: true;
      clubs: GiftClub[];
      attributedClubId: string | null;
      areas: GiftArea[];
    };

/** Passo 4 di 5 dell'accoglienza dopo la registrazione. */
const STEP = 4;
const STEPS = 5;
/** Passo successivo dell'accoglienza: invito a installare l'app (PWA). */
export const NEXT_STEP = "/benvenuto/installa";

/**
 * Schermata 04 · Il tuo regalo: la lezione di prova nei circoli affiliati e
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
        <header className="pf-gift-header" onClickCapture={guard}>
          <a className="pf-gift-back" href="/benvenuto/spider" aria-label="Indietro">
            ←
          </a>
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

        <p className="pf-gift-kicker">04 · Il tuo regalo</p>
        {clubs.length > 0 && <ClubCarousel clubs={clubs} />}

        <section className="pf-gift-offer" aria-labelledby="pf-gift-title">
          <h1 id="pf-gift-title">
            <span className="pf-gift-one" aria-hidden>
              1
            </span>
            <span className="pf-gift-sr">Una </span>
            lezione di prova, gratis.
          </h1>
          {/* Testo della demo PF10 (W4), richiesto così da Stefano. */}
          <p>
            Si sblocca quando la tua Performance sarà completamente Reale:
            tutte e sei le aree misurate in campo, niente più tratteggio.
          </p>
          {areas.length > 0 && (
            <p className="pf-gift-count">
              {`${real} di ${areas.length} aree reali`}
            </p>
          )}
        </section>

        <button
          type="button"
          className="pf-gift-continue"
          onClickCapture={guard}
          onClick={onContinue}
        >
          Continua
        </button>
      </div>
    </main>
  );
}
