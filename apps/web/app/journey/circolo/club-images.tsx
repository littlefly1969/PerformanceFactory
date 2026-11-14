import { API_BASE } from "../../lib/api";
import { clubInitials } from "../../lib/club-initials";

/** Foto del circolo dal back office; senza, un fondo scuro. */
export function ClubPhoto({
  club,
  eager = true,
}: {
  club: { photoUrl: string | null };
  eager?: boolean;
}) {
  return club.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- immagine dall'API, già ridimensionata
    <img
      className="pf-lz-photo"
      src={`${API_BASE}${club.photoUrl}`}
      alt=""
      loading={eager ? "eager" : "lazy"}
    />
  ) : (
    <span className="pf-lz-photo is-empty" aria-hidden="true" />
  );
}

/**
 * Iniziali del circolo su fondo bianco, sempre al posto del logo (demo V11):
 * l'immagine del circolo è la foto.
 */
export function ClubLogo({ club }: { club: { name: string } }) {
  return (
    <span className="pf-lz-logo is-empty" aria-hidden="true">
      {clubInitials(club.name)}
    </span>
  );
}
