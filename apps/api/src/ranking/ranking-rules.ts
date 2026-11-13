/**
 * Regole del ranking PF1-PF4 della piattaforma (funzione nuova, fuori
 * Blueprint, decisa con Stefano il 13/11/2026):
 *
 * - entra solo chi ha un abbonamento che dà accesso al programma;
 * - reale = R globale dell'ultima valutazione; potenziale = P dell'orizzonte
 *   pagato (se l'abbonamento cambia orizzonte, segue quello pagato);
 * - punteggio = media pesata di reale e potenziale, 60/40 di partenza;
 * - fascia dal punteggio con soglie 80 / 66 / 50, modificabili dal back
 *   office insieme ai pesi;
 * - dentro la fascia ognuno ha la sua posizione.
 */

export const RANKING_BANDS = ['PF1', 'PF2', 'PF3', 'PF4'] as const;
export type RankingBand = (typeof RANKING_BANDS)[number];

export const BAND_TEXT: Record<RankingBand, string> = {
  PF1: 'I giocatori più completi',
  PF2: 'Gioco solido su tutte le aree',
  PF3: 'Basi buone, margini chiari',
  PF4: 'Il punto di partenza',
};

export type RankingConfigValues = {
  realWeight: number;
  potentialWeight: number;
  pf1Min: number;
  pf2Min: number;
  pf3Min: number;
};

export const DEFAULT_RANKING_CONFIG: RankingConfigValues = {
  realWeight: 60,
  potentialWeight: 40,
  pf1Min: 80,
  pf2Min: 66,
  pf3Min: 50,
};

/**
 * Errori di una configurazione: pesi interi da 0 a 100 che sommano 100,
 * soglie intere fra 1 e 100 in ordine strettamente decrescente.
 */
export function rankingConfigProblems(config: RankingConfigValues) {
  const problems: string[] = [];
  const values = Object.values(config);
  if (values.some((v) => !Number.isInteger(v)))
    problems.push('Pesi e soglie devono essere numeri interi');
  const { realWeight, potentialWeight, pf1Min, pf2Min, pf3Min } = config;
  if (
    [realWeight, potentialWeight].some((w) => w < 0 || w > 100) ||
    realWeight + potentialWeight !== 100
  )
    problems.push('I pesi di reale e potenziale devono sommare 100');
  if ([pf1Min, pf2Min, pf3Min].some((t) => t < 1 || t > 100))
    problems.push('Le soglie vanno da 1 a 100');
  if (!(pf1Min > pf2Min && pf2Min > pf3Min))
    problems.push('Le soglie devono scendere da PF1 a PF3');
  return problems;
}

/** Valore della scala della valutazione riportato a 0-100. */
export function toPercent(value: number, scale: { min: number; max: number }) {
  const span = scale.max - scale.min;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, ((value - scale.min) / span) * 100));
}

/** Punteggio 0-100 da reale e potenziale già in percentuale. */
export function rankingScore(
  real: number,
  potential: number,
  config: RankingConfigValues,
) {
  const total = config.realWeight + config.potentialWeight;
  if (total <= 0) return real;
  return (
    (real * config.realWeight + potential * config.potentialWeight) / total
  );
}

export function bandOf(score: number, config: RankingConfigValues) {
  if (score >= config.pf1Min) return 'PF1';
  if (score >= config.pf2Min) return 'PF2';
  if (score >= config.pf3Min) return 'PF3';
  return 'PF4';
}

export type RankingEntry = {
  userId: string;
  /** Reale e potenziale nella scala della valutazione, per lo schermo. */
  real: number;
  potential: number;
  /** Punteggio 0-100 che decide fascia e posizione. */
  score: number;
};

export type RankedEntry = RankingEntry & {
  band: RankingBand;
  position: number;
};

/**
 * Fascia e posizione di ciascuno. A parità di punteggio vale il reale più
 * alto, poi l'ordine dell'id: la posizione è stabile fra due letture.
 */
export function rankEntries(
  entries: RankingEntry[],
  config: RankingConfigValues,
) {
  const sorted = [...entries].sort(
    (a, b) =>
      b.score - a.score ||
      b.real - a.real ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );
  const counters = new Map<RankingBand, number>();
  return sorted.map((entry): RankedEntry => {
    const band = bandOf(entry.score, config);
    const position = (counters.get(band) ?? 0) + 1;
    counters.set(band, position);
    return { ...entry, band, position };
  });
}

/** Cinque righe intorno alla posizione, dentro i limiti della fascia. */
export function boardWindow(position: number, size: number, rows = 5) {
  const first = Math.max(
    1,
    Math.min(position - Math.floor(rows / 2), size - rows + 1),
  );
  const last = Math.min(size, first + rows - 1);
  return { first, last };
}

/** «Sara P.»: nome e iniziale del cognome, se c'è. */
export function publicName(firstName: string | null, lastName: string | null) {
  const first = firstName?.trim().split(/\s+/)[0] ?? '';
  const initial = lastName?.trim().charAt(0).toUpperCase() ?? '';
  if (!first) return null;
  return initial ? `${first} ${initial}.` : first;
}

/**
 * Esempio «numeri simili, fasce diverse» coerente con pesi e soglie di oggi:
 * due atleti a cavallo della soglia di PF2, uno con più reale e uno con più
 * potenziale. Con pesi uguali i due numeri si compensano e l'esempio non c'è.
 */
export function bandExample(config: RankingConfigValues) {
  const realFavoured = config.realWeight > config.potentialWeight;
  if (config.realWeight === config.potentialWeight) return null;
  const threshold = config.pf2Min;
  for (let real = threshold; real >= threshold - 20; real--) {
    for (let potential = real + 3; potential <= real + 30; potential++) {
      const luca = { name: 'Luca', real, potential };
      const anna = { name: 'Anna', real: real - 2, potential: potential + 2 };
      if (anna.real < 0 || anna.potential > 100) continue;
      const sLuca = rankingScore(luca.real, luca.potential, config);
      const sAnna = rankingScore(anna.real, anna.potential, config);
      const [up, down] = realFavoured ? [sLuca, sAnna] : [sAnna, sLuca];
      if (up >= threshold && down < threshold)
        return {
          realFavoured,
          athletes: [
            { ...luca, band: bandOf(sLuca, config) },
            { ...anna, band: bandOf(sAnna, config) },
          ],
        };
    }
  }
  return null;
}
