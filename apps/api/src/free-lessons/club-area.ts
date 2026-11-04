import { Injectable } from '@nestjs/common';
import { AddressSearchLimiter } from '../athlete/athlete-address';
import { type ClubArea, PlacesService } from '../geo/places.service';
import { PrismaService } from '../prisma/prisma.service';

/** Ricerche di CAP e città per atleta in un minuto. */
export const AREA_SEARCH_LIMITS = { suggestions: 60, resolve: 20 };
const MAX_SUGGESTIONS = 5;

export type AreaSuggestion = {
  placeId: string | null;
  main: string;
  secondary: string | null;
  area: ClubArea | null;
};

type ClubPlace = {
  city: string | null;
  postalCode: string | null;
  province: string | null;
};

/** Minuscole, senza accenti e con un solo tipo di apostrofo: «Città» = «citta». */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .trim();

/**
 * Suggerimenti dai soli circoli che offrono la lezione: con delle cifre i CAP
 * che iniziano così, altrimenti le città che contengono il testo. Restituiscono
 * già la zona, quindi non serve risolverli.
 */
export function clubAreaSuggestions(
  input: string,
  clubs: ClubPlace[],
): AreaSuggestion[] {
  const text = input.trim();
  const byCode = /^\d+$/.test(text);
  const needle = fold(text);
  const out: AreaSuggestion[] = [];
  const seen = new Set<string>();
  for (const club of clubs) {
    const city = club.city?.trim();
    if (!city) continue;
    const province = club.province?.trim().toUpperCase() || null;
    let row: AreaSuggestion;
    if (byCode) {
      const postalCode = club.postalCode?.trim() ?? '';
      if (!postalCode.startsWith(text)) continue;
      row = {
        placeId: null,
        main: postalCode,
        secondary: city,
        area: { city, postalCode, province },
      };
    } else {
      if (!fold(city).includes(needle)) continue;
      row = {
        placeId: null,
        main: city,
        secondary: province,
        area: { city, postalCode: null, province },
      };
    }
    const key = `${fold(row.main)}|${fold(city)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out
    .sort((a, b) => a.main.localeCompare(b.main, 'it'))
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * Zona dell'atleta per scegliere il circolo della lezione gratuita, senza
 * indirizzo: CAP o città da Google Places quando è attivo, altrimenti (o se
 * Google non risponde) dalle sedi dei circoli. Il testo scritto non va nei log.
 */
@Injectable()
export class ClubAreaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly places: PlacesService,
  ) {}

  private readonly limiter = new AddressSearchLimiter();

  async suggestions(
    userId: string,
    input: string,
    sessionToken: string,
  ): Promise<{ suggestions: AreaSuggestion[] }> {
    this.limiter.take(
      `area-suggestions:${userId}`,
      AREA_SEARCH_LIMITS.suggestions,
    );
    const text = input.trim();
    if (this.places.configured) {
      try {
        const rows = await this.places.suggestAreas(text, sessionToken);
        return {
          suggestions: rows.map((row) => ({
            placeId: row.placeId,
            main: row.mainText,
            secondary: row.secondaryText,
            area: null,
          })),
        };
      } catch {
        // Google fuori servizio: la ricerca resta possibile sui circoli.
      }
    }
    const clubs = await this.prisma.partner.findMany({
      where: { isActive: true, freeLessonsEnabled: true },
      select: { city: true, postalCode: true, province: true },
    });
    return { suggestions: clubAreaSuggestions(text, clubs) };
  }

  /** Città del suggerimento di Google scelto; null se non è una zona italiana. */
  async resolve(
    userId: string,
    placeId: string,
    sessionToken: string,
  ): Promise<{ area: ClubArea | null }> {
    this.limiter.take(`area-resolve:${userId}`, AREA_SEARCH_LIMITS.resolve);
    return { area: await this.places.resolveArea(placeId, sessionToken) };
  }
}
