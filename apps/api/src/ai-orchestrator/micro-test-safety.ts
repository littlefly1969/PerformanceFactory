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

/** Negazioni che in italiano si rafforzano a vicenda: «non … mai» resta una. */
const NEGATIONS = new Set([
  'non',
  'senza',
  'niente',
  'nessun',
  'nessuna',
  'nessuno',
  'mai',
  'no',
]);
/** Verbi che escludono: ognuno inverte, quindi «non evitare gli sprint» li chiede. */
const AVOID = new Set(['evita', 'evitare', 'evitando', 'evitate', 'eviti']);
/** Articoli, preposizioni e congiunzioni fra la negazione e il termine. */
const FILLERS = new Set(
  (
    'il lo la i gli le l un uno una di del dello della dei degli delle d ' +
    'a al allo alla ai agli alle ad da dal dallo dalla dai dagli dalle ' +
    'in nel nello nella nei negli nelle con e o oppure'
  ).split(' '),
);
/** Parole ponte ammesse: descrivono lo sforzo escluso, non un'altra attività. */
const BRIDGES = new Set([
  'sforzo',
  'sforzi',
  'ritmo',
  'ritmi',
  'intensita',
  'velocita',
  'carico',
  'carichi',
  'prova',
  'prove',
  'arrivare',
  'arrivando',
  'spingerti',
]);
/** Quante parole al massimo si risalgono dal termine. */
const EXCLUSION_REACH = 5;

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
 * «massimale», non «submassimale»). Il termine non conta solo se la frase lo
 * esclude davvero: «ritmo non massimale», «senza sprint», «evita sforzi
 * massimali», «non arrivare mai al cedimento». Risalendo dal termine si
 * attraversano solo negazioni, articoli e preposizioni, poche parole ponte e
 * altri termini vietati della stessa esclusione («niente sprint o salti
 * ripetuti»); qualunque altra parola chiude la ricerca, così «nessuna pausa tra
 * sprint» o «senza pause sprint brevi» restano vietate.
 */
export function findUnsafeTerm(text: string, terms: string[]) {
  const sentences = clauses(text);
  const banned = terms.flatMap((term) => clauses(term)[0] ?? []);
  for (const term of terms) {
    const parts = clauses(term)[0];
    if (!parts) continue;
    for (const words of sentences)
      for (let i = 0; i + parts.length <= words.length; i++) {
        if (!parts.every((part, k) => words[i + k].startsWith(part))) continue;
        if (!excluded(words, i, banned)) return term;
      }
  }
  return null;
}

/** Il termine che inizia alla parola `at` è escluso dalle parole che lo precedono? */
function excluded(words: string[], at: number, banned: string[]) {
  let negated = false;
  let avoids = 0;
  for (let j = at - 1; j >= 0 && at - j <= EXCLUSION_REACH; j--) {
    const word = words[j];
    if (NEGATIONS.has(word)) negated = true;
    else if (AVOID.has(word)) avoids++;
    else if (
      !FILLERS.has(word) &&
      !BRIDGES.has(word) &&
      !banned.some((part) => word.startsWith(part))
    )
      break;
  }
  return (avoids + (negated ? 1 : 0)) % 2 === 1;
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

/** Problemi di una lista di parole vietate; `where` dice a quali contenuti vale. */
export function unsafeTermsProblems(terms: string[], where = 'nei micro-test') {
  const problems: string[] = [];
  const { maxTerms, maxLength } = UNSAFE_TERMS_LIMITS;
  if (terms.length > maxTerms)
    problems.push(`Al massimo ${maxTerms} parole vietate ${where}`);
  for (const term of terms) {
    if (term.length > maxLength)
      problems.push(`«${term.slice(0, 20)}…» supera ${maxLength} caratteri`);
    else if (!clauses(term)[0] || clauses(term).length > 1)
      problems.push(`«${term}» non è una parola o frase valida`);
  }
  return problems;
}
