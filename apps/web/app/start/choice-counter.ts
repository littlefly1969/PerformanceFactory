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
  /** `value`: valore dell'opzione configurata che la fascia deve avere. */
  bands: { upTo: number; label: string; value: string }[];
  /**
   * Fascia in grigio sopra il numero. Sulla frequenza la demo V11 l'ha tolta
   * («3-4 volte»): resta solo per chi usa un lettore di schermo.
   */
  showBand: boolean;
};

const COUNTERS: Record<string, ChoiceCounter> = {
  pf4_experience: {
    // 0 vale «<1», 11 vale «10+»: si arriva agli estremi con un tocco in più.
    min: 0,
    max: 11,
    start: 3,
    display: (n) => (n <= 0 ? "<1" : n >= 11 ? "10+" : String(n)),
    showBand: true,
    bands: [
      { upTo: 0, label: "Meno di un anno", value: "Meno di un anno" },
      { upTo: 3, label: "1-3 anni", value: "1-3 anni" },
      { upTo: 5, label: "4-5 anni", value: "3-5 anni" },
      { upTo: Infinity, label: "Più di 5 anni", value: "Più di 5 anni" },
    ],
  },
  pf4_frequency: {
    min: 1,
    max: 7,
    start: 3,
    display: String,
    showBand: false,
    bands: [
      { upTo: 2, label: "1-2 volte", value: "1-2 volte" },
      { upTo: 4, label: "3-4 volte", value: "3-4 volte" },
      { upTo: Infinity, label: "5 o più volte", value: "5 o più volte" },
    ],
  },
};

/**
 * Il contatore della domanda, solo se le opzioni configurate sono proprio le
 * fasce attese e nello stesso ordine: un'opzione riordinata, aggiunta o
 * cambiata da back office riporta al selettore generico, così il numero
 * mostrato non salva mai la fascia sbagliata.
 */
export function counterFor(
  question: DiscoveryQuestion,
  options: DiscoveryOption[] = question.options,
) {
  const counter = COUNTERS[question.code];
  return question.type === "single_choice" &&
    question.ui?.presentation === "stepper" &&
    counter &&
    counter.bands.length === options.length &&
    counter.bands.every((band, i) => options[i].value === band.value)
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
