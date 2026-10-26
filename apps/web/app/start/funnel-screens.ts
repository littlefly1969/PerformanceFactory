import type { DiscoveryQuestion } from "./discovery-types";

export const HEIGHT_KEY = "general_height_cm";
export const WEIGHT_KEY = "general_weight_kg";

/**
 * Altezza e peso, quando entrambi visibili, condividono una schermata con la
 * figura: la schermata prende l'id della prima delle due domande.
 */
export function measurePair(questions: DiscoveryQuestion[]) {
  const find = (key: string) =>
    questions.find(
      (q) =>
        q.contextKey === key && (q.type === "number" || q.type === "scale"),
    );
  const height = find(HEIGHT_KEY);
  const weight = find(WEIGHT_KEY);
  if (!height || !weight) return undefined;
  const first =
    questions.indexOf(height) < questions.indexOf(weight) ? height : weight;
  return {
    height,
    weight,
    screenId: first.id,
    absorbedId: first === height ? weight.id : height.id,
  };
}

/** Una schermata per domanda visibile, tranne la coppia altezza/peso. */
export function screenIds(questions: DiscoveryQuestion[]) {
  const pair = measurePair(questions);
  return questions.map((q) => q.id).filter((id) => id !== pair?.absorbedId);
}

/** La schermata su cui compare una domanda. */
export function screenOf(questions: DiscoveryQuestion[], step: string) {
  const pair = measurePair(questions);
  return pair && step === pair.absorbedId ? pair.screenId : step;
}

/** Le domande mostrate da una schermata. */
export function screenQuestions(
  questions: DiscoveryQuestion[],
  screenId: string,
) {
  const pair = measurePair(questions);
  if (pair && screenId === pair.screenId) return [pair.height, pair.weight];
  return questions.filter((q) => q.id === screenId);
}
