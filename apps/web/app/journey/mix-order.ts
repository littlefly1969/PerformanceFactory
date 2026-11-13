/**
 * Ordine delle risposte dell'assessment e della calibrazione (demo V11).
 * L'AI scrive le opzioni in ordine di punteggio: a video si mescolano, così
 * la risposta migliore non è sempre la prima o l'ultima. L'ordine è fisso
 * per domanda (stessa chiave, stesso ordine: ricarica e indietro non lo
 * cambiano) e tocca solo la presentazione: valori e punteggi restano quelli.
 * Le opzioni esclusive («Nessuna») restano in fondo.
 */
type Option = { value: string | number; label: string; exclusive?: boolean };

/** Schemi senza sequenze ordinate, per 3 e 4 opzioni (come la demo). */
const PATTERNS: Record<number, number[][]> = {
  3: [
    [0, 2, 1],
    [1, 0, 2],
    [2, 0, 1],
  ],
  4: [
    [1, 3, 0, 2],
    [2, 0, 3, 1],
    [3, 0, 2, 1],
    [1, 2, 0, 3],
  ],
};

/** Permutazione di `n` posizioni, stabile per la stessa chiave. */
export function mixOrder(n: number, key: string) {
  const ids = Array.from({ length: n }, (_, i) => i);
  if (n < 3) return ids;
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const pattern = PATTERNS[n];
  if (pattern) return pattern[h % pattern.length]!.slice();
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const j = h % (i + 1);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return ids;
}

/** Le opzioni nell'ordine mostrato; le esclusive in fondo, nel loro ordine. */
export function mixedOptions<T extends Option>(options: T[], key: string) {
  const regular = options.filter((o) => !o.exclusive);
  const exclusive = options.filter((o) => o.exclusive);
  return [
    ...mixOrder(regular.length, key).map((i) => regular[i]!),
    ...exclusive,
  ];
}
