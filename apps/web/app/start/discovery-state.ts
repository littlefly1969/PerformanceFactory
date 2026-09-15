import type {
  DiscoveryConfiguration,
  DiscoveryDraft,
  DiscoveryQuestion,
} from "./discovery-types";

export const DRAFT_KEY = "pf.discovery.v1";
export function emptyDraft(version: number): DiscoveryDraft {
  return { version, currentStep: "intro", answers: {} };
}
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
export function setAnswer(
  draft: DiscoveryDraft,
  question: DiscoveryQuestion,
  value: unknown,
): DiscoveryDraft {
  if (question.target)
    return {
      ...draft,
      [question.target]: value,
      ...(question.target === "sportId" && value !== draft.sportId
        ? { specializationId: undefined }
        : {}),
    };
  return { ...draft, answers: { ...draft.answers, [question.id]: value } };
}
export function restoreDraft(
  raw: string | null,
  config: DiscoveryConfiguration,
): DiscoveryDraft {
  try {
    const draft = JSON.parse(raw ?? "null") as DiscoveryDraft | null;
    if (
      !draft ||
      draft.version !== config.version ||
      !draft.answers ||
      typeof draft.answers !== "object" ||
      Array.isArray(draft.answers)
    )
      return emptyDraft(config.version);
    const steps = [
      "intro",
      ...config.questions.map((q) => q.id),
      "result",
      "registration",
    ];
    const index = steps.indexOf(draft.currentStep);
    if (index < 0) return emptyDraft(config.version);
    const firstInvalid = config.questions.findIndex(
      (q) => !answerValid(q, draft),
    );
    if (firstInvalid >= 0 && firstInvalid + 1 < index)
      return { ...draft, currentStep: config.questions[firstInvalid].id };
    return draft;
  } catch {
    return emptyDraft(config.version);
  }
}
export function journeyHref(nextStep: string) {
  if (!["CONSENTS", "ASSESSMENT"].includes(nextStep))
    throw new Error("Passaggio del percorso non riconosciuto");
  return `/journey?step=${encodeURIComponent(nextStep)}`;
}
