import { answerValid } from "./discovery-answer";
export { answerValid, questionValue, optionsFor } from "./discovery-answer";
import { pruneHiddenAnswers, visibleQuestions } from "./discovery-branches";
import { screenIds, screenOf, screenQuestions } from "./funnel-screens";
import type {
  DiscoveryConfiguration,
  DiscoveryDraft,
  DiscoveryQuestion,
} from "./discovery-types";

export const DRAFT_KEY = "pf.discovery.v1";
export function emptyDraft(version: number): DiscoveryDraft {
  return { version, currentStep: "intro", answers: {} };
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
    let draft = JSON.parse(raw ?? "null") as DiscoveryDraft | null;
    if (
      !draft ||
      draft.version !== config.version ||
      !draft.answers ||
      typeof draft.answers !== "object" ||
      Array.isArray(draft.answers)
    )
      return emptyDraft(config.version);
    draft = pruneHiddenAnswers(config.questions, draft);
    const questions = visibleQuestions(config.questions, draft);
    const screens = screenIds(questions);
    draft.currentStep = screenOf(questions, draft.currentStep);
    const steps = ["intro", ...screens, "processing", "result", "registration"];
    const index = steps.indexOf(draft.currentStep);
    if (index < 0) {
      const originalIndex = config.questions.findIndex(
        (q) => q.id === draft!.currentStep,
      );
      if (originalIndex < 0) return emptyDraft(config.version);
      draft.currentStep =
        questions.find((q) => config.questions.indexOf(q) >= originalIndex)
          ?.id ?? "result";
      return restoreDraft(JSON.stringify(draft), config);
    }
    const firstInvalid = screens.findIndex((id) =>
      screenQuestions(questions, id).some((q) => !answerValid(q, draft!)),
    );
    if (firstInvalid >= 0 && firstInvalid + 1 < index)
      return { ...draft, currentStep: screens[firstInvalid] };
    return draft;
  } catch {
    return emptyDraft(config.version);
  }
}
export function journeyHref(nextStep: string) {
  if (
    ![
      "CONSENTS",
      "ASSESSMENT_INTRO",
      "ASSESSMENT_UNAVAILABLE",
      "ASSESSMENT",
      "PROCESSING",
      "RESULT",
      "DURATION",
      "COMPLETE",
    ].includes(nextStep)
  )
    throw new Error("Passaggio del percorso non riconosciuto");
  return `/journey?step=${encodeURIComponent(nextStep)}`;
}
