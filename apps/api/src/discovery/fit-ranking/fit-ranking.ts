import { Prisma } from '@prisma/client';
import { saveProfileEntry } from '../assessment-configuration';
import { FitRankingContext } from '../../ai-orchestrator/fit-ranking-context';

/**
 * Classifica FIT dichiarata dall'atleta: padel e tennis hanno classifiche
 * separate, per ciascuna l'attuale e la migliore di sempre. Liste chiuse,
 * dalla più alta alla più bassa; «Nessuna classifica» chiude ogni lista. Il
 * padel FITP è a fasce (quattro agonistiche e una non agonistica), il tennis
 * a categorie dalla 1ª a 4.NC.
 */
export const FIT_RANKING_SPORTS = ['PADEL', 'TENNIS'] as const;
export type FitRankingSport = (typeof FIT_RANKING_SPORTS)[number];

const NONE = { value: 'NONE', label: 'Nessuna classifica' };

export const FIT_RANKING_OPTIONS: Record<
  FitRankingSport,
  { value: string; label: string }[]
> = {
  PADEL: [
    { value: '1', label: '1ª fascia' },
    { value: '2', label: '2ª fascia' },
    { value: '3', label: '3ª fascia' },
    { value: '4', label: '4ª fascia' },
    { value: 'NA', label: 'Fascia non agonistica' },
    NONE,
  ],
  TENNIS: [
    { value: '1', label: '1ª categoria' },
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      value: `2.${n}`,
      label: `2.${n}`,
    })),
    ...[1, 2, 3, 4, 5].map((n) => ({ value: `3.${n}`, label: `3.${n}` })),
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: `4.${n}`, label: `4.${n}` })),
    { value: '4.NC', label: '4.NC' },
    NONE,
  ],
};

export const CARD_NUMBER_MAX = 30;
const CARD_NUMBER = /^[A-Za-z0-9 ./-]*$/;

export type FitRankingValues = {
  padelCurrent: string;
  padelBest: string;
  tennisCurrent: string;
  tennisBest: string;
  cardNumber: string | null;
};

/** Le quattro voci obbligatorie, nell'ordine in cui si chiedono. */
export const FIT_RANKING_FIELDS = [
  { field: 'padelCurrent', sport: 'PADEL', best: false },
  { field: 'padelBest', sport: 'PADEL', best: true },
  { field: 'tennisCurrent', sport: 'TENNIS', best: false },
  { field: 'tennisBest', sport: 'TENNIS', best: true },
] as const;
export type RankingField = (typeof FIT_RANKING_FIELDS)[number]['field'];

const position = (sport: FitRankingSport, value: string) =>
  FIT_RANKING_OPTIONS[sport].findIndex((o) => o.value === value);

export const fitRankingLabel = (sport: FitRankingSport, value: string) =>
  FIT_RANKING_OPTIONS[sport].find((o) => o.value === value)?.label ?? value;

/**
 * Opzioni per la migliore di sempre: non può essere più bassa dell'attuale,
 * quindi solo l'attuale e quelle sopra.
 */
export function bestOptions(sport: FitRankingSport, current?: unknown) {
  const options = FIT_RANKING_OPTIONS[sport];
  const index =
    typeof current === 'string' ? position(sport, current) : options.length - 1;
  return index < 0 ? options : options.slice(0, index + 1);
}

export function normalizeCardNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length > CARD_NUMBER_MAX || !CARD_NUMBER.test(trimmed))
    return undefined;
  return trimmed || null;
}

/** Problemi di una dichiarazione completa; vuoto se valida. */
export function fitRankingProblems(values: Partial<FitRankingValues>) {
  const problems: string[] = [];
  for (const sport of FIT_RANKING_SPORTS) {
    const prefix = sport === 'PADEL' ? 'padel' : 'tennis';
    const current = values[`${prefix}Current` as RankingField];
    const best = values[`${prefix}Best` as RankingField];
    const name = sport === 'PADEL' ? 'padel' : 'tennis';
    if (typeof current !== 'string' || position(sport, current) < 0)
      problems.push(`Classifica ${name} attuale non valida`);
    else if (
      typeof best !== 'string' ||
      !bestOptions(sport, current).some((o) => o.value === best)
    )
      problems.push(
        `La migliore classifica ${name} non può essere più bassa dell'attuale`,
      );
  }
  if (normalizeCardNumber(values.cardNumber) === undefined)
    problems.push('Numero di tessera non valido');
  return problems;
}

export function fitRankingContext(
  row: (FitRankingValues & { createdAt: Date }) | null,
): FitRankingContext {
  if (!row) return null;
  return {
    source: 'SELF_DECLARED',
    declaredAt: row.createdAt.toISOString(),
    padel: {
      current: fitRankingLabel('PADEL', row.padelCurrent),
      best: fitRankingLabel('PADEL', row.padelBest),
    },
    tennis: {
      current: fitRankingLabel('TENNIS', row.tennisCurrent),
      best: fitRankingLabel('TENNIS', row.tennisBest),
    },
  };
}

type RankingReader = {
  athleteFitRanking: Pick<Prisma.AthleteFitRankingDelegate, 'findFirst'>;
};

/** Classifica in vigore: l'ultima dichiarazione. */
export function loadFitRanking(prisma: RankingReader, userId: string) {
  return prisma.athleteFitRanking.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function loadFitRankingContext(
  prisma: RankingReader,
  userId: string,
) {
  return fitRankingContext(await loadFitRanking(prisma, userId));
}

const same = (a: FitRankingValues, b: FitRankingValues) =>
  a.padelCurrent === b.padelCurrent &&
  a.padelBest === b.padelBest &&
  a.tennisCurrent === b.tennisCurrent &&
  a.tennisBest === b.tennisBest &&
  (a.cardNumber ?? null) === (b.cardNumber ?? null);

/**
 * Registra una dichiarazione nello storico, se diversa dall'ultima, e la
 * copia nel profilo letto dal coaching. Restituisce true se è cambiata una
 * classifica (non basta il numero di tessera). Con `evaluated` la nuova
 * classifica resta in attesa di ricalcolo della R (`recalculatedAt` null).
 */
export async function saveFitRanking(
  tx: Prisma.TransactionClient,
  userId: string,
  values: FitRankingValues,
  source: 'JOURNEY' | 'PROFILE',
  evaluated = false,
) {
  const latest = await loadFitRanking(tx, userId);
  if (latest && same(latest, values)) return false;
  const changed =
    !latest ||
    FIT_RANKING_FIELDS.some(({ field }) => latest[field] !== values[field]);
  const row = await tx.athleteFitRanking.create({
    data: {
      userId,
      source,
      ...values,
      // Un ricalcolo ancora in sospeso non si perde con un cambio di tessera.
      recalculatedAt:
        (changed && evaluated) || (latest && !latest.recalculatedAt)
          ? null
          : new Date(),
    },
  });
  await saveProfileEntry(tx, userId, 'fit_ranking', {
    label: 'Classifica FIT dichiarata',
    value: fitRankingContext(row),
  });
  return changed;
}
