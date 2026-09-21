import { DiscoveryQuestion } from './discovery.types';

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
