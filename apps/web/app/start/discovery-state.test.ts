import { describe, expect, it } from "vitest";
import {
  answerValid,
  emptyDraft,
  journeyHref,
  restoreDraft,
  setAnswer,
} from "./discovery-state";
import type {
  DiscoveryConfiguration,
  DiscoveryQuestion,
} from "./discovery-types";
const question: DiscoveryQuestion = {
  id: "q",
  code: "experience",
  title: "Da quanto?",
  type: "single_choice",
  required: true,
  order: 1,
  options: [{ id: "yes", label: "Un anno", value: 1 }],
};
const config: DiscoveryConfiguration = { version: 8, questions: [question] };

describe("Discovery browser draft", () => {
  it.each(["q", "result", "registration"])(
    "restores exact %s step and answers",
    (currentStep) => {
      const draft = { version: 8, currentStep, answers: { q: "yes" } };
      expect(restoreDraft(JSON.stringify(draft), config)).toEqual(draft);
    },
  );
  it("returns to a missing required answer before permitting result or registration", () => {
    expect(
      restoreDraft(
        JSON.stringify({
          version: 8,
          currentStep: "registration",
          answers: {},
        }),
        config,
      ).currentStep,
    ).toBe("q");
  });
  it.each([null, "{bad", '{"version":7}', '{"version":8,"answers":[]}'])(
    "handles corrupt or outdated storage",
    (raw) => {
      expect(restoreDraft(raw, config)).toEqual(emptyDraft(8));
    },
  );
  it("clears specialization when changing sport", () => {
    const draft = { ...emptyDraft(8), sportId: "a", specializationId: "a1" };
    expect(
      setAnswer(draft, { ...question, target: "sportId" }, "b")
        .specializationId,
    ).toBeUndefined();
  });
  it("does not use falsiness to reject zero or false", () => {
    expect(
      answerValid(
        { ...question, type: "boolean" },
        { ...emptyDraft(8), answers: { q: false } },
      ),
    ).toBe(true);
    expect(
      answerValid(
        { ...question, type: "number", min: 0, max: 5 },
        { ...emptyDraft(8), answers: { q: 0 } },
      ),
    ).toBe(true);
  });
  it("only maps backend steps; rejects arbitrary URLs", () => {
    expect(journeyHref("CONSENTS")).toBe("/journey?step=CONSENTS");
    expect(() => journeyHref("https://attacker.test")).toThrow();
  });
});
