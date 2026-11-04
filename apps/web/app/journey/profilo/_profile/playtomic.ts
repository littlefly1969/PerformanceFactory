/** Fasce Playtomic della demo: toccarne una propone il valore centrale. */
export const PLAYTOMIC_BANDS = [
  { name: "Iniziazione", range: "0 – 0,99", min: 0, max: 1, mid: "0,5" },
  { name: "Principiante", range: "1,0 – 1,49", min: 1, max: 1.5, mid: "1,25" },
  {
    name: "Intermedio iniziale",
    range: "1,5 – 2,4",
    min: 1.5,
    max: 2.5,
    mid: "2",
  },
  { name: "Intermedio", range: "2,5 – 3,4", min: 2.5, max: 3.5, mid: "3" },
  { name: "Intermedio alto", range: "3,5 – 4,4", min: 3.5, max: 4.5, mid: "4" },
  {
    name: "Intermedio avanzato",
    range: "4,5 – 5,4",
    min: 4.5,
    max: 5.5,
    mid: "5",
  },
  { name: "Competizione", range: "5,5 – 7", min: 5.5, max: 7.01, mid: "6" },
];

/** «2,75» o «2.75» → 2.75; vuoto → null; non valido → undefined. */
export function parsePlaytomic(text: string) {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return undefined;
  const n = Number(t.replace(",", "."));
  return n >= 0 && n <= 7 ? n : undefined;
}
