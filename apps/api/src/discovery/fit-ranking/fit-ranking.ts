import {
  OnboardingInputType,
  OnboardingQuestionScope,
  Prisma,
} from '@prisma/client';
import { TemplateRecord } from '../../onboarding/onboarding-model';
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
type RankingField = (typeof FIT_RANKING_FIELDS)[number]['field'];

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

/** Id delle domande del percorso: non sono template, vivono solo qui. */
export const FIT_QUESTION_PREFIX = 'fit:';
const CARD_QUESTION_ID = `${FIT_QUESTION_PREFIX}cardNumber`;
export const isFitQuestion = (id: string) => id.startsWith(FIT_QUESTION_PREFIX);

const TITLES: Record<RankingField, string> = {
  padelCurrent: 'Qual è la tua classifica FIT di padel attuale?',
  padelBest: 'Qual è la migliore classifica FIT di padel che hai avuto?',
  tennisCurrent: 'Qual è la tua classifica FIT di tennis attuale?',
  tennisBest: 'Qual è la migliore classifica FIT di tennis che hai avuto?',
};

/**
 * Quattro domande obbligatorie e il numero di tessera facoltativo, subito
 * dopo la disponibilità. Le opzioni della migliore dipendono dall'attuale già
 * risposta.
 */
export function fitRankingQuestions(
  answers: Record<string, unknown>,
): TemplateRecord[] {
  const record = (
    id: string,
    label: string,
    options: { value: string; label: string }[] | null,
    order: number,
  ): TemplateRecord => ({
    id,
    key: id,
    scope: OnboardingQuestionScope.GENERAL,
    areaId: null,
    label,
    helpText: null,
    inputType: options ? OnboardingInputType.SELECT : OnboardingInputType.TEXT,
    optionsJson: options,
    required: !!options,
    orderIndex: order,
    area: null,
  });
  return [
    ...FIT_RANKING_FIELDS.map(({ field, sport, best }, i) =>
      record(
        `${FIT_QUESTION_PREFIX}${field}`,
        TITLES[field],
        best
          ? bestOptions(
              sport,
              answers[`${FIT_QUESTION_PREFIX}${sport.toLowerCase()}Current`],
            )
          : FIT_RANKING_OPTIONS[sport],
        i,
      ),
    ),
    record(
      CARD_QUESTION_ID,
      'Numero di tessera FIT (facoltativo)',
      null,
      FIT_RANKING_FIELDS.length,
    ),
  ];
}

/** Valori della dichiarazione dalle risposte del percorso, se complete. */
export function fitRankingFromAnswers(
  answers: Record<string, unknown>,
): FitRankingValues | null {
  const value = (field: string) => answers[`${FIT_QUESTION_PREFIX}${field}`];
  const values = {
    padelCurrent: value('padelCurrent'),
    padelBest: value('padelBest'),
    tennisCurrent: value('tennisCurrent'),
    tennisBest: value('tennisBest'),
    cardNumber: normalizeCardNumber(value('cardNumber')) ?? null,
  } as FitRankingValues;
  return fitRankingProblems(values).length ? null : values;
}

/**
 * Risposta del percorso valida: opzione della lista per le classifiche,
 * testo breve (anche vuoto) per la tessera.
 */
export function validFitAnswer(question: TemplateRecord, value: unknown) {
  if (question.id === CARD_QUESTION_ID)
    return normalizeCardNumber(value) !== undefined;
  const options = (question.optionsJson ?? []) as { value: string }[];
  return typeof value === 'string' && options.some((o) => o.value === value);
}

/**
 * Risposte dopo un cambio dell'attuale: se la migliore già data è ora più
 * bassa, diventa uguale all'attuale.
 */
export function alignBest(answers: Record<string, unknown>) {
  const next = { ...answers };
  for (const sport of FIT_RANKING_SPORTS) {
    const prefix = `${FIT_QUESTION_PREFIX}${sport.toLowerCase()}`;
    const current = next[`${prefix}Current`];
    const best = next[`${prefix}Best`];
    if (
      typeof current === 'string' &&
      typeof best === 'string' &&
      !bestOptions(sport, current).some((o) => o.value === best)
    )
      next[`${prefix}Best`] = current;
  }
  return next;
}
