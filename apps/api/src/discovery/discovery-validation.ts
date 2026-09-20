import { BadRequestException } from '@nestjs/common';
import {
  DiscoveryConfiguration,
  DiscoveryDraft,
  DiscoveryQuestion,
} from './discovery.types';

export function validAnswer(
  question: DiscoveryQuestion,
  value: unknown,
  sportId?: string,
): boolean {
  if (value === undefined || value === null || value === '')
    return !question.required;
  const options = question.options.filter(
    (o) => !question.dependsOn || o.parentId === sportId,
  );
  if (question.type === 'date')
    return (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
    );
  if (question.type === 'number' || question.type === 'scale') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    if (question.min !== undefined && value < question.min) return false;
    if (question.max !== undefined && value > question.max) return false;
    const units = (value - (question.min ?? 0)) / (question.step ?? 1);
    return Math.abs(units - Math.round(units)) < 1e-8;
  }
  if (question.type === 'boolean') return typeof value === 'boolean';
  const allowed = (id: unknown) =>
    typeof id === 'string' && options.some((o) => o.id === id);
  if (question.type === 'multi_choice')
    return (
      Array.isArray(value) &&
      (!question.required || value.length > 0) &&
      new Set(value).size === value.length &&
      value.every(allowed)
    );
  return allowed(value);
}

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
  for (const q of config.questions) {
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
    answers: draft.answers,
  };
}
