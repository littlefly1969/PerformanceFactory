import type { DiscoveryOption, DiscoveryQuestion } from "./discovery-types";

/**
 * Contatore − / + della demo PF10: l'atleta sceglie un numero, la risposta
 * salvata resta la fascia configurata in cui cade (i valori delle opzioni non
 * cambiano: training-constraints li legge). Una fascia per opzione, nell'ordine.
 */
export type ChoiceCounter = {
  min: number;
  max: number;
  start: number;
  /** Testo nel pulsante: solo il numero, con «<1» e «10+» agli estremi. */
  display: (n: number) => string;
  bands: { upTo: number; label: string }[];
};

const COUNTERS: Record<string, ChoiceCounter> = {
  pf4_experience: {
    // 0 vale «<1», 11 vale «10+»: si arriva agli estremi con un tocco in più.
    min: 0,
    max: 11,
    start: 3,
    display: (n) => (n <= 0 ? "<1" : n >= 11 ? "10+" : String(n)),
    bands: [
      { upTo: 0, label: "Meno di un anno" },
      { upTo: 3, label: "1-3 anni" },
      { upTo: 5, label: "4-5 anni" },
      { upTo: Infinity, label: "Più di 5 anni" },
    ],
  },
  pf4_frequency: {
    min: 1,
    max: 7,
    start: 3,
    display: String,
    bands: [
      { upTo: 2, label: "1-2 volte" },
      { upTo: 4, label: "3-4 volte" },
      { upTo: Infinity, label: "5 o più volte" },
    ],
  },
};

/** Il contatore della domanda, se le fasce combaciano con le opzioni. */
export function counterFor(
  question: DiscoveryQuestion,
  options: DiscoveryOption[] = question.options,
) {
  const counter = COUNTERS[question.code];
  return question.type === "single_choice" &&
    question.ui?.presentation === "stepper" &&
    counter &&
    counter.bands.length === options.length
    ? counter
    : undefined;
}

export const bandIndex = (counter: ChoiceCounter, n: number) =>
  counter.bands.findIndex((band) => n <= band.upTo);

/** Il primo numero di una fascia, o il valore iniziale se vi cade. */
export function numberForBand(counter: ChoiceCounter, index: number) {
  if (bandIndex(counter, counter.start) === index) return counter.start;
  const low = index === 0 ? counter.min : counter.bands[index - 1].upTo + 1;
  return Math.min(counter.max, Math.max(counter.min, low));
}

/** Etichetta della fascia per il riepilogo, coerente con il contatore. */
export function counterLabel(
  question: DiscoveryQuestion,
  options: DiscoveryOption[],
  optionId: unknown,
) {
  const counter = counterFor(question, options);
  const index = options.findIndex((option) => option.id === optionId);
  return counter && index >= 0 ? counter.bands[index].label : undefined;
}
