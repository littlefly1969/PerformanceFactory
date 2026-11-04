import { API_BASE } from "../../lib/api";

type WithImages = {
  name: string;
  logoUrl: string | null;
  photoUrl: string | null;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");

/** Foto del circolo dal back office; senza, un fondo scuro. */
export function ClubPhoto({
  club,
  eager = true,
}: {
  club: WithImages;
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

/** Logo del circolo su fondo bianco; senza, le iniziali. */
export function ClubLogo({ club }: { club: WithImages }) {
  return club.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- immagine dall'API, già ridimensionata
    <img className="pf-lz-logo" src={`${API_BASE}${club.logoUrl}`} alt="" />
  ) : (
    <span className="pf-lz-logo is-empty" aria-hidden="true">
      {initials(club.name)}
    </span>
  );
}
