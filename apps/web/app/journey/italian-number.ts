const UNITS = [
  "zero",
  "uno",
  "due",
  "tre",
  "quattro",
  "cinque",
  "sei",
  "sette",
  "otto",
  "nove",
  "dieci",
  "undici",
  "dodici",
  "tredici",
  "quattordici",
  "quindici",
  "sedici",
  "diciassette",
  "diciotto",
  "diciannove",
];
const TENS = [
  "",
  "",
  "venti",
  "trenta",
  "quaranta",
  "cinquanta",
  "sessanta",
  "settanta",
  "ottanta",
  "novanta",
];

/** Numero in lettere, 0-99; oltre si usano le cifre. */
export function italianNumber(n: number) {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 20) return UNITS[n];
  const unit = n % 10;
  const tens = TENS[Math.floor(n / 10)];
  if (!unit) return tens;
  // Ventuno e ventotto elidono la vocale; ventitré prende l'accento.
  const stem = unit === 1 || unit === 8 ? tens.slice(0, -1) : tens;
  return stem + (unit === 3 ? "tré" : UNITS[unit]);
}

/** «quattordici domande», «una domanda»: il numero arriva dal backend. */
export const questionsInWords = (n: number) =>
  n === 1 ? "una domanda" : `${italianNumber(n)} domande`;
export const minutesInWords = (n: number) =>
  n === 1 ? "un minuto" : `${italianNumber(n)} minuti`;
