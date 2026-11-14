import {
  DEFAULT_RANKING_CONFIG,
  bandExample,
  bandOf,
  boardWindow,
  publicName,
  rankEntries,
  rankingConfigProblems,
  rankingNumbers,
  rankingScore,
  toPercent,
} from './ranking-rules';

describe('ranking rules', () => {
  it('weights real 60 and potential 40 by default', () => {
    expect(rankingScore(30, 61, DEFAULT_RANKING_CONFIG)).toBeCloseTo(42.4);
    expect(
      rankingScore(30, 61, {
        ...DEFAULT_RANKING_CONFIG,
        realWeight: 100,
        potentialWeight: 0,
      }),
    ).toBe(30);
  });

  it('puts similar numbers in different bands as in the demo example', () => {
    // Luca 72 su 85 → 77,2 (PF2); Anna 70 su 87 → 76,8 (PF2) con 60/40.
    expect(
      bandOf(
        rankingScore(72, 85, DEFAULT_RANKING_CONFIG),
        DEFAULT_RANKING_CONFIG,
      ),
    ).toBe('PF2');
    expect(bandOf(80, DEFAULT_RANKING_CONFIG)).toBe('PF1');
    expect(bandOf(79.9, DEFAULT_RANKING_CONFIG)).toBe('PF2');
    expect(bandOf(66, DEFAULT_RANKING_CONFIG)).toBe('PF2');
    expect(bandOf(50, DEFAULT_RANKING_CONFIG)).toBe('PF3');
    expect(bandOf(49.9, DEFAULT_RANKING_CONFIG)).toBe('PF4');
  });

  it('ranks inside each band, ties broken by real then id', () => {
    const ranked = rankEntries(
      [
        { userId: 'c', real: 40, potential: 60, score: 48 },
        { userId: 'a', real: 90, potential: 95, score: 92 },
        { userId: 'b', real: 42, potential: 57, score: 48 },
        { userId: 'd', real: 41, potential: 58, score: 48 },
      ],
      DEFAULT_RANKING_CONFIG,
    );
    expect(ranked.map((r) => [r.userId, r.band, r.position])).toEqual([
      ['a', 'PF1', 1],
      ['b', 'PF4', 1],
      ['d', 'PF4', 2],
      ['c', 'PF4', 3],
    ]);
  });

  it('brings real and potential to 0-100 before comparing them', () => {
    const ten = { min: 0, max: 10 };
    const hundred = { min: 0, max: 100 };
    // Stessa scala 0-10: 7,2 e 8,5 diventano 72 e 85.
    const a = rankingNumbers(
      { value: 7.2, scale: ten },
      { value: 8.5, scale: ten },
    );
    expect(a.real).toBeCloseTo(72);
    expect(a.potential).toBeCloseTo(85);
    // Reale su 0-10, potenziale da una valutazione precedente su 0-100: il
    // massimo grezzo (max(64, 7,2) = 64) sarebbe sbagliato, normalizzato è 72.
    const b = rankingNumbers(
      { value: 7.2, scale: ten },
      { value: 64, scale: hundred },
    );
    expect(b.real).toBeCloseTo(72);
    expect(b.potential).toBeCloseTo(72);
    // Al contrario: reale 70 su 0-100, potenziale 8 su 0-10 → 80.
    const c = rankingNumbers(
      { value: 70, scale: hundred },
      { value: 8, scale: ten },
    );
    expect([c.real, c.potential]).toEqual([70, 80]);
    expect(
      rankingNumbers(
        { value: 5, scale: { min: 1, max: 9 } },
        {
          value: 9,
          scale: { min: 1, max: 9 },
        },
      ),
    ).toEqual({ real: 50, potential: 100 });
  });

  it('breaks ties on the normalised real across different scales', () => {
    // Stesso punteggio: vince il reale più alto su 0-100 (7,2/10 = 72 batte
    // 70/100), non il numero grezzo più grande.
    const tenths = rankingNumbers(
      { value: 7.2, scale: { min: 0, max: 10 } },
      { value: 7.5, scale: { min: 0, max: 10 } },
    );
    const percent = rankingNumbers(
      { value: 70, scale: { min: 0, max: 100 } },
      { value: 78, scale: { min: 0, max: 100 } },
    );
    const score = (n: { real: number; potential: number }) =>
      rankingScore(n.real, n.potential, DEFAULT_RANKING_CONFIG);
    expect(score(tenths)).toBeCloseTo(score(percent));
    const ranked = rankEntries(
      [
        { userId: 'a', ...percent, score: 73.2 },
        { userId: 'z', ...tenths, score: 73.2 },
      ],
      DEFAULT_RANKING_CONFIG,
    );
    expect(ranked.map((r) => [r.userId, r.position])).toEqual([
      ['z', 1],
      ['a', 2],
    ]);
  });

  it('validates weights and thresholds', () => {
    expect(rankingConfigProblems(DEFAULT_RANKING_CONFIG)).toEqual([]);
    expect(
      rankingConfigProblems({ ...DEFAULT_RANKING_CONFIG, realWeight: 70 }),
    ).toEqual(['I pesi di reale e potenziale devono sommare 100']);
    expect(
      rankingConfigProblems({ ...DEFAULT_RANKING_CONFIG, pf2Min: 85 }),
    ).toEqual(['Le soglie devono scendere da PF1 a PF3']);
    expect(
      rankingConfigProblems({ ...DEFAULT_RANKING_CONFIG, pf3Min: 0 }),
    ).toContain('Le soglie vanno da 1 a 100');
  });

  it('keeps the five-row board inside the band', () => {
    expect(boardWindow(395, 2600)).toEqual({ first: 393, last: 397 });
    expect(boardWindow(1, 2600)).toEqual({ first: 1, last: 5 });
    expect(boardWindow(2600, 2600)).toEqual({ first: 2596, last: 2600 });
    expect(boardWindow(2, 3)).toEqual({ first: 1, last: 3 });
  });

  it('shows first name and surname initial', () => {
    expect(publicName('Sara', 'Pini')).toBe('Sara P.');
    expect(publicName('Anna Maria', null)).toBe('Anna');
    expect(publicName(null, 'Rossi')).toBeNull();
  });

  it('maps the evaluation scale to 0-100', () => {
    expect(toPercent(3, { min: 1, max: 5 })).toBe(50);
    expect(toPercent(7, { min: 1, max: 5 })).toBe(100);
    expect(toPercent(3, { min: 5, max: 5 })).toBe(0);
  });

  it('builds the similar-numbers example from the current weights', () => {
    expect(bandExample(DEFAULT_RANKING_CONFIG)).toEqual({
      realFavoured: true,
      athletes: [
        { name: 'Luca', real: 65, potential: 68, band: 'PF2' },
        { name: 'Anna', real: 63, potential: 70, band: 'PF3' },
      ],
    });
    const potentialFirst = bandExample({
      ...DEFAULT_RANKING_CONFIG,
      realWeight: 30,
      potentialWeight: 70,
    });
    expect(potentialFirst?.realFavoured).toBe(false);
    expect(potentialFirst?.athletes.map((a) => a.band)).toEqual(['PF3', 'PF2']);
    expect(
      bandExample({
        ...DEFAULT_RANKING_CONFIG,
        realWeight: 50,
        potentialWeight: 50,
      }),
    ).toBeNull();
  });
});
