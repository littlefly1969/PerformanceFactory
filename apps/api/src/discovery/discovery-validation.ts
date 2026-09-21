import { validAnswer } from './discovery-answer';
export { validAnswer } from './discovery-answer';
import { pruneHiddenAnswers, visibleQuestions } from './discovery-branches';
import { BadRequestException } from '@nestjs/common';
import { DiscoveryConfiguration, DiscoveryDraft } from './discovery.types';

export function validateDiscovery(
  config: DiscoveryConfiguration,
  input: unknown,
): DiscoveryDraft {
  const fail = (message: string): never => {
    throw new BadRequestException(message);
  };
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return fail('Discovery mancante');
  const draft = input as DiscoveryDraft;
  if (
    Object.keys(draft).some(
      (key) =>
        ![
          'version',
          'currentStep',
          'sportId',
          'specializationId',
          'goalId',
          'answers',
        ].includes(key),
    )
  )
    return fail('Campi discovery non previsti');
  if (draft.version !== config.version)
    return fail('La discovery è cambiata. Ricarica e verifica le risposte.');
  if (
    typeof draft.currentStep !== 'string' ||
    !['result', 'registration'].includes(draft.currentStep)
  )
    return fail('Discovery incompleta');
  if (
    !draft.answers ||
    typeof draft.answers !== 'object' ||
    Array.isArray(draft.answers)
  )
    return fail('Risposte non valide');
  const keys = new Set(
    config.questions.filter((q) => !q.target).map((q) => q.id),
  );
  if (Object.keys(draft.answers).some((id) => !keys.has(id)))
    return fail('Domanda non presente nella configurazione');
  for (const q of visibleQuestions(config.questions, draft)) {
    const value = q.target ? draft[q.target] : draft.answers[q.id];
    if (!validAnswer(q, value, draft.sportId))
      return fail(`Risposta non valida: ${q.title}`);
  }
  return {
    version: draft.version,
    currentStep: 'registration',
    sportId:
      config.sportContext?.mode === 'fixed'
        ? config.sportContext.sport.id
        : draft.sportId,
    specializationId:
      config.sportContext?.mode === 'fixed'
        ? config.sportContext.specialization.id
        : draft.specializationId,
    goalId: draft.goalId,
    answers: pruneHiddenAnswers(config.questions, draft).answers,
  };
}
