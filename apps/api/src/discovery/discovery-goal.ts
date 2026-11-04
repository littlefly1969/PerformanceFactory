import { DiscoveryQuestion } from './discovery.types';

/**
 * Testo dell'obiettivo del programma dalle risposte del funnel: uno o più
 * obiettivi nell'ordine configurato, uniti in una frase («Migliorare la
 * tecnica e aumentare la resistenza»). La risposta è già validata.
 */
export function discoveryGoalText(
  question: DiscoveryQuestion | undefined,
  goalId: string | string[] | undefined,
) {
  const chosen = Array.isArray(goalId) ? goalId : [goalId];
  const labels = (question?.options ?? [])
    .filter((option) => chosen.includes(option.id))
    .map((option, index) =>
      index === 0
        ? option.label
        : option.label.charAt(0).toLocaleLowerCase('it-IT') +
          option.label.slice(1),
    );
  if (!labels.length) throw new Error('Obiettivo della discovery mancante');
  return labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}
