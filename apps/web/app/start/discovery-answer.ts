import type { DiscoveryDraft, DiscoveryQuestion } from "./discovery-types";

export function questionValue(
  draft: DiscoveryDraft,
  question: DiscoveryQuestion,
) {
  return question.target ? draft[question.target] : draft.answers[question.id];
}
export function optionsFor(question: DiscoveryQuestion, draft: DiscoveryDraft) {
  return question.options.filter(
    (option) =>
      !question.dependsOn || option.parentId === draft[question.dependsOn],
  );
}
export function answerValid(
  question: DiscoveryQuestion,
  draft: DiscoveryDraft,
) {
  const value = questionValue(draft, question);
  if (value === undefined || value === null || value === "")
    return !question.required;
  if (question.type === "date")
    return (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
    );
  if (question.type === "boolean") return typeof value === "boolean";
  if (question.type === "number" || question.type === "scale") {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    const units = (value - (question.min ?? 0)) / (question.step ?? 1);
    return (
      (question.min === undefined || value >= question.min) &&
      (question.max === undefined || value <= question.max) &&
      Math.abs(units - Math.round(units)) < 1e-8
    );
  }
  const allowed = (id: unknown) =>
    optionsFor(question, draft).some((option) => option.id === id);
  return question.type === "multi_choice"
    ? Array.isArray(value) &&
        (!question.required || value.length > 0) &&
        value.every(allowed) &&
        new Set(value).size === value.length
    : allowed(value);
}
