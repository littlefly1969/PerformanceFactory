/**
 * Logo e foto del circolo arrivano dal back office come data URL già
 * ridimensionati nel browser. Solo raster (niente SVG: potrebbe contenere
 * script), con un tetto per tipo che resta sotto il limite del corpo Fastify.
 */
export const CLUB_IMAGE_KINDS = ['logo', 'photo'] as const;
export type ClubImageKind = (typeof CLUB_IMAGE_KINDS)[number];

export const CLUB_IMAGE_MAX_LENGTH: Record<ClubImageKind, number> = {
  logo: 200_000,
  photo: 700_000,
};

export const CLUB_IMAGE_DATA_URL =
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Decodifica un data URL valido; null se il formato non è ammesso. */
export function decodeClubImage(dataUrl: string) {
  const match = CLUB_IMAGE_DATA_URL.exec(dataUrl);
  if (!match) return null;
  return {
    contentType: `image/${match[1]}`,
    body: Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'),
  };
}

/**
 * Percorso pubblico dell'immagine, relativo alla base dell'API. La versione
 * cambia a ogni caricamento, così il browser può tenerla in cache a lungo.
 */
export function clubImagePath(
  partnerId: string,
  kind: ClubImageKind,
  updatedAt: Date | null,
) {
  return updatedAt
    ? `/partners/${partnerId}/${kind}?v=${updatedAt.getTime()}`
    : null;
}
