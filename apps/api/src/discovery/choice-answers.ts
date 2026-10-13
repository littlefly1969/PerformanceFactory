import { normalizeOptions } from '../onboarding/onboarding-answers';
import {
  OnboardingAnswer,
  TemplateRecord,
} from '../onboarding/onboarding-model';

/**
 * Risposte alle domande a scelta scritte dall'AI: una sola opzione, oppure
 * più opzioni quando l'AI ha marcato la domanda come multipla. Un'opzione
 * esclusiva («Nessuna») non si combina con le altre.
 */
type Choice = { value?: unknown; label?: unknown; exclusive?: unknown };

const sameValue = (option: Choice, value: unknown) =>
  (typeof value === 'string' || typeof value === 'number') &&
  String(option.value) === String(value);

/** Opzioni scelte nell'ordine della risposta, o null se la risposta non è valida. */
export function chosenOptions<T extends Choice>(
  options: T[],
  value: unknown,
  multiple = false,
): T[] | null {
  if (!multiple) {
    const option = options.find((o) => sameValue(o, value));
    return option ? [option] : null;
  }
  if (
    !Array.isArray(value) ||
    !value.length ||
    new Set(value.map(String)).size !== value.length
  )
    return null;
  const chosen = value.map((v) => options.find((o) => sameValue(o, v)));
  if (chosen.some((o) => !o)) return null;
  if (chosen.length > 1 && chosen.some((o) => o!.exclusive === true))
    return null;
  return chosen as T[];
}

/**
 * Evidenza per l'AI: le etichette scelte e lo score di riferimento. Con più
 * opzioni lo score è la media (serve al calcolo di riserva senza AI) e ogni
 * opzione resta con il suo score, che l'AI pesa da sola.
 */
export function choiceEvidence(
  chosen: { label?: unknown; score?: unknown }[],
  multiple = false,
) {
  const label = (o: { label?: unknown }) =>
    typeof o.label === 'string' ? o.label : '';
  const scores = chosen.map((o) => Number(o.score));
  const optionScore = scores.every(Number.isFinite)
    ? scores.reduce((sum, s) => sum + s, 0) / Math.max(1, scores.length)
    : null;
  return {
    answer: chosen.map(label).join('; '),
    optionScore: chosen.length ? optionScore : null,
    ...(multiple
      ? {
          selectedOptions: chosen.map((o) => ({
            label: label(o),
            score: Number(o.score),
          })),
        }
      : {}),
  };
}

/**
 * Valore per il baseline: una risposta multipla diventa il testo delle
 * opzioni scelte, come le scelte multiple del funnel. Resta senza score per
 * risposta: la R del baseline arriva dalla valutazione AI.
 */
export function baselineValue(
  q: TemplateRecord,
  value: unknown,
): OnboardingAnswer['value'] {
  if (!q.multiple) return value as OnboardingAnswer['value'];
  const options = normalizeOptions(q.optionsJson) as Choice[];
  return choiceEvidence(chosenOptions(options, value, true) ?? []).answer;
}

/** Risposte di un round: valori o, per le domande multiple, elenchi di valori. */
export const roundAnswers = (answers: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(answers).map(([id, value]) => [
      id,
      Array.isArray(value) ? value.map(String) : String(value),
    ]),
  );
