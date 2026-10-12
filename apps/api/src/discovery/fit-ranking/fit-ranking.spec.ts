import {
  alignBest,
  bestOptions,
  fitRankingContext,
  fitRankingFromAnswers,
  fitRankingProblems,
  fitRankingQuestions,
  normalizeCardNumber,
  validFitAnswer,
} from './fit-ranking';

const valid = {
  padelCurrent: '3',
  padelBest: '2',
  tennisCurrent: 'NONE',
  tennisBest: 'NONE',
  cardNumber: null,
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

  it('asks four rankings and the optional card, best after current', () => {
    const questions = fitRankingQuestions({ 'fit:padelCurrent': '2' });
    expect(questions.map((q) => q.id)).toEqual([
      'fit:padelCurrent',
      'fit:padelBest',
      'fit:tennisCurrent',
      'fit:tennisBest',
      'fit:cardNumber',
    ]);
    expect(questions.map((q) => q.required)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(validFitAnswer(questions[1], '3')).toBe(false);
    expect(validFitAnswer(questions[1], '1')).toBe(true);
    expect(validFitAnswer(questions[4], '')).toBe(true);
    expect(validFitAnswer(questions[4], 7)).toBe(false);
  });

  it('raises the best answer when the current one goes above it', () => {
    expect(
      alignBest({ 'fit:padelCurrent': '1', 'fit:padelBest': '3' }),
    ).toEqual({ 'fit:padelCurrent': '1', 'fit:padelBest': '1' });
  });

  it('builds the declaration only when the four rankings are answered', () => {
    const answers = {
      'fit:padelCurrent': '3',
      'fit:padelBest': '2',
      'fit:tennisCurrent': 'NONE',
    };
    expect(fitRankingFromAnswers(answers)).toBeNull();
    expect(
      fitRankingFromAnswers({ ...answers, 'fit:tennisBest': 'NONE' }),
    ).toEqual(valid);
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
