/**
 * Contenuti che un micro-test non può contenere: diagnosi, terapie, farmaci,
 * prescrizioni alimentari e prove massimali (PF-FS-PREPAYWALL §4.4). È la
 * lista iniziale: quella in vigore la gestisce l'amministratore nel back
 * office (`CalibrationConfig.unsafeMicroTestTerms`).
 */
export const DEFAULT_UNSAFE_MICRO_TEST_TERMS = [
  'diagnos',
  'terapi',
  'farmac',
  'integrator',
  'prescri',
  'digiun',
  'dieta ipocalorica',
  'massimal',
  'esaurimento',
  'cedimento',
  'salti ripetuti',
  'sprint',
  'dolore come',
];

export const UNSAFE_TERMS_LIMITS = { maxTerms: 100, maxLength: 60 };

/**
 * Parole che escludono il termine che segue nella stessa frase: «ritmo non
 * massimale», «senza sprint», «evita sforzi massimali» sono indicazioni di
 * sicurezza, non contenuti vietati.
 */
const NEGATIONS = new Set([
  'non',
  'senza',
  'niente',
  'nessun',
  'nessuna',
  'nessuno',
  'mai',
  'no',
  'evita',
  'evitare',
  'evitando',
  'evitate',
]);
/** Quante parole prima del termine può stare la negazione. */
const NEGATION_WINDOW = 3;

/** Frasi del testo, ciascuna in parole minuscole senza accenti. */
function clauses(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[.,;:!?()\n«»"]+/)
    .map((clause) => clause.match(/[a-z0-9]+/g) ?? [])
    .filter((words) => words.length);
}

/**
 * Primo termine vietato presente nel testo, o null. Ogni parola del termine
 * deve essere l'inizio di una parola del testo, in sequenza («massimal» trova
 * «massimale», non «submassimale»); il termine preceduto da una negazione
 * nella stessa frase non conta.
 */
export function findUnsafeTerm(text: string, terms: string[]) {
  const sentences = clauses(text);
  for (const term of terms) {
    const parts = clauses(term)[0];
    if (!parts) continue;
    for (const words of sentences)
      for (let i = 0; i + parts.length <= words.length; i++) {
        if (!parts.every((part, k) => words[i + k].startsWith(part))) continue;
        const before = words.slice(Math.max(0, i - NEGATION_WINDOW), i);
        if (!before.some((word) => NEGATIONS.has(word))) return term;
      }
  }
  return null;
}

/** Lista pulita: termini senza spazi in eccesso, minuscoli, senza doppioni. */
export function cleanUnsafeTerms(terms: string[]) {
  return [
    ...new Set(
      terms
        .map((t) => t.trim().replace(/\s+/g, ' ').toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function unsafeTermsProblems(terms: string[]) {
  const problems: string[] = [];
  const { maxTerms, maxLength } = UNSAFE_TERMS_LIMITS;
  if (!terms.length)
    problems.push('Serve almeno una parola vietata nei micro-test');
  if (terms.length > maxTerms)
    problems.push(`Al massimo ${maxTerms} parole vietate nei micro-test`);
  for (const term of terms) {
    if (term.length > maxLength)
      problems.push(`«${term.slice(0, 20)}…» supera ${maxLength} caratteri`);
    else if (!clauses(term)[0] || clauses(term).length > 1)
      problems.push(`«${term}» non è una parola o frase valida`);
  }
  return problems;
}
