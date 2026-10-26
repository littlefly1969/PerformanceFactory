import { Prisma } from '@prisma/client';
import { loadActivePolicy } from '../discovery/calibration/confidence-policy';
import { clubImagePath } from '../partners/club-image';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export type GiftArea = { id: string; name: string; real: boolean };

/**
 * Un'area è Reale quando la sua confidence raggiunge la soglia per area della
 * regola di consolidamento di R (o, senza soglia per area, quella complessiva):
 * è il punto in cui lo Spider smette di essere tratteggiato su quell'area.
 */
export function giftAreas(
  areas: { id: string; name: string }[],
  confidences: { areaId: string; confidence: number }[],
  threshold: number | null,
): GiftArea[] {
  const byArea = new Map(confidences.map((c) => [c.areaId, c.confidence]));
  return areas.map((area) => {
    const confidence = byArea.get(area.id);
    return {
      id: area.id,
      name: area.name,
      real:
        threshold !== null &&
        confidence !== undefined &&
        confidence >= threshold,
    };
  });
}

/** Il circolo da cui arriva l'atleta apre il carosello; gli altri seguono per nome. */
export function orderClubs<T extends { id: string }>(
  clubs: T[],
  attributedId: string | null,
) {
  const first = clubs.filter((club) => club.id === attributedId);
  return [...first, ...clubs.filter((club) => club.id !== attributedId)];
}

/**
 * Schermata del regalo dopo la registrazione: i circoli affiliati che offrono
 * la lezione di prova, con logo e foto dal back office, e quante aree dello
 * Spider sono già Reali.
 */
export async function loadGift(db: Db, userId: string) {
  const [clubs, attribution, latest, policy] = await Promise.all([
    db.partner.findMany({
      where: { isActive: true, freeLessonsEnabled: true },
      select: {
        id: true,
        name: true,
        city: true,
        logoUpdatedAt: true,
        photoUpdatedAt: true,
      },
      orderBy: { name: 'asc' },
    }),
    db.userAttribution.findUnique({
      where: { userId },
      select: { partnerId: true },
    }),
    db.assessmentEvaluation.findFirst({
      where: { userId },
      orderBy: { sequence: 'desc' },
      select: {
        areas: {
          select: {
            areaId: true,
            confidence: true,
            area: { select: { name: true } },
          },
        },
      },
    }),
    loadActivePolicy(db, 'R_CONSOLIDATION'),
  ]);
  // Prima della valutazione lo Spider ha comunque tutte le aree, nessuna Reale.
  const areas = latest?.areas.length
    ? latest.areas
        .map((a) => ({ id: a.areaId, name: a.area.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    : await db.area.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
  const attributedClubId = clubs.some((c) => c.id === attribution?.partnerId)
    ? attribution!.partnerId
    : null;
  return {
    enabled: true as const,
    clubs: orderClubs(clubs, attributedClubId).map(
      ({ logoUpdatedAt, photoUpdatedAt, ...club }) => ({
        ...club,
        logoUrl: clubImagePath(club.id, 'logo', logoUpdatedAt),
        photoUrl: clubImagePath(club.id, 'photo', photoUpdatedAt),
      }),
    ),
    attributedClubId,
    areas: giftAreas(
      areas,
      latest?.areas ?? [],
      policy.minAreaConfidence ?? policy.minOverallConfidence,
    ),
  };
}
