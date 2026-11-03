import {
  bestOptions,
  fitRankingContext,
  fitRankingProblems,
  normalizeCardNumber,
  normalizePlaytomicLevel,
} from './fit-ranking';

const valid = {
  padelCurrent: '3',
  padelBest: '2',
  tennisCurrent: 'NONE',
  tennisBest: 'NONE',
  cardNumber: null,
  playtomicLevel: null,
};

describe('FIT ranking', () => {
  it('offers as best only the current ranking and the ones above it', () => {
    expect(bestOptions('PADEL', '3').map((o) => o.value)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(bestOptions('TENNIS', '1').map((o) => o.value)).toEqual(['1']);
    // Senza attuale si vede tutta la lista.
    expect(bestOptions('TENNIS').at(-1)?.value).toBe('NONE');
  });

  it('rejects a best ranking below the current one and unknown values', () => {
    expect(fitRankingProblems(valid)).toEqual([]);
    expect(fitRankingProblems({ ...valid, padelBest: '4' })).toEqual([
      "La migliore classifica padel non può essere più bassa dell'attuale",
    ]);
    expect(fitRankingProblems({ ...valid, tennisCurrent: '5.1' })).toEqual([
      'Classifica tennis attuale non valida',
    ]);
    expect(
      fitRankingProblems({ ...valid, cardNumber: '<script>' as never }),
    ).toEqual(['Numero di tessera non valido']);
  });

  it('keeps the card number short and plain, empty meaning none', () => {
    expect(normalizeCardNumber(' 12/AB ')).toBe('12/AB');
    expect(normalizeCardNumber('')).toBeNull();
    expect(normalizeCardNumber(undefined)).toBeNull();
    expect(normalizeCardNumber('x'.repeat(31))).toBeUndefined();
    expect(normalizeCardNumber(12)).toBeUndefined();
  });

  it('accepts a Playtomic level from 0 to 7 with at most two decimals', () => {
    expect(normalizePlaytomicLevel(2.75)).toBe(2.75);
    expect(normalizePlaytomicLevel('2,5')).toBe(2.5);
    expect(normalizePlaytomicLevel(0)).toBe(0);
    expect(normalizePlaytomicLevel(7)).toBe(7);
    expect(normalizePlaytomicLevel(null)).toBeNull();
    expect(normalizePlaytomicLevel('')).toBeNull();
    for (const bad of [7.01, -1, 2.755, '2,755', 'abc', true])
      expect(normalizePlaytomicLevel(bad)).toBeUndefined();
    expect(fitRankingProblems({ ...valid, playtomicLevel: 8 })).toEqual([
      'Il livello Playtomic va da 0 a 7',
    ]);
  });

  it('passes the Playtomic level to the AI only when declared', () => {
    const context = fitRankingContext({
      ...valid,
      playtomicLevel: 2.5,
      createdAt: new Date('2026-10-12T00:00:00Z'),
    });
    expect(context?.padel).toEqual({
      current: '3ª fascia',
      best: '2ª fascia',
      playtomic: '2.50',
    });
  });

  it('gives the AI readable labels and never the card number', () => {
    const context = fitRankingContext({
      ...valid,
      cardNumber: '999',
      createdAt: new Date('2026-10-12T00:00:00Z'),
    });
    expect(context).toEqual({
      source: 'SELF_DECLARED',
      declaredAt: '2026-10-12T00:00:00.000Z',
      padel: { current: '3ª fascia', best: '2ª fascia' },
      tennis: { current: 'Nessuna classifica', best: 'Nessuna classifica' },
    });
    expect(JSON.stringify(context)).not.toContain('999');
    expect(fitRankingContext(null)).toBeNull();
  });
});
