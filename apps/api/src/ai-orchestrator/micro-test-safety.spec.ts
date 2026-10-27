import {
  DEFAULT_UNSAFE_MICRO_TEST_TERMS,
  cleanUnsafeTerms,
  findUnsafeTerm,
  unsafeTermsProblems,
} from './micro-test-safety';

describe('micro-test safety terms', () => {
  const terms = DEFAULT_UNSAFE_MICRO_TEST_TERMS;

  it.each([
    ['Fai 10 sprint massimali e conta i secondi.', 'massimal'],
    ['Prendi un integratore prima.', 'integrator'],
    ['Ripeti fino a esaurimento delle forze.', 'esaurimento'],
    ['Non fermarti. Sprint fino alla rete.', 'sprint'],
    ['Una DIAGNOSI del dolore al gomito.', 'diagnos'],
  ])('finds banned content in %p', (text, term) => {
    expect(findUnsafeTerm(text, terms)).toBe(term);
  });

  it.each([
    'A ritmo non massimale, conta le volée.',
    'Senza sprint: cammina fino alla rete.',
    'Evita sforzi massimali.',
    'Non arrivare mai al cedimento.',
    'Un ritmo submassimale, a passo tranquillo.',
    'Nessuna terapia: è solo un esercizio di tecnica.',
  ])('lets a negated or harmless phrase through: %p', (text) => {
    expect(findUnsafeTerm(text, terms)).toBeNull();
  });

  it('matches multi-word terms in sequence, ignoring case and accents', () => {
    expect(findUnsafeTerm('Fai SALTI ripetuti sul posto', terms)).toBe(
      'salti ripetuti',
    );
    expect(findUnsafeTerm('Salti, poi ripetuti appoggi', terms)).toBeNull();
    expect(findUnsafeTerm('Colpo più veloce', ['piu veloce'])).toBe(
      'piu veloce',
    );
  });

  it('cleans and validates the back office list', () => {
    expect(
      cleanUnsafeTerms([' Sprint ', 'sprint', '', 'Dieta  Ipocalorica']),
    ).toEqual(['sprint', 'dieta ipocalorica']);
    expect(unsafeTermsProblems(terms)).toEqual([]);
    expect(unsafeTermsProblems([])).toHaveLength(1);
    expect(unsafeTermsProblems(['...'])).toHaveLength(1);
    expect(unsafeTermsProblems(['x'.repeat(61)])).toHaveLength(1);
  });
});
