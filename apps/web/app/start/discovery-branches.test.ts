import { describe, expect, it } from "vitest";
import { visibleQuestions, pruneHiddenAnswers } from "./discovery-branches";
import type { DiscoveryQuestion, DiscoveryDraft } from "./discovery-types";
import { restoreDraft } from "./discovery-state";

const question = (
  code: string,
  type: DiscoveryQuestion["type"] = "single_choice",
): DiscoveryQuestion => ({
  id: code + "-id",
  code,
  title: code,
  type,
  required: true,
  order: 1,
  options: [
    { id: "event", label: "Torneo", value: "Torneo" },
    { id: "none", label: "Nessuno", value: "Nessuno" },
  ],
});
const event = question("event");
const date: DiscoveryQuestion = {
  ...question("date", "date"),
  visibleWhen: {
    match: "all",
    rules: [{ question: "event", operator: "in", values: ["event"] }],
  },
};
const child: DiscoveryQuestion = {
  ...question("child"),
  visibleWhen: {
    match: "all",
    rules: [{ question: "date", operator: "not_in", values: ["2026-12-01"] }],
  },
};
const questions = [event, date, child];
const draft = (answers: Record<string, unknown>): DiscoveryDraft => ({
  version: 1,
  currentStep: "registration",
  answers,
});

describe("Conditional discovery paths", () => {
  it("skips the event date and every descendant when there is no event", () => {
    const d = draft({
      "event-id": "none",
      "date-id": "2026-12-02",
      "child-id": "event",
    });
    expect(visibleQuestions(questions, d).map((q) => q.code)).toEqual([
      "event",
    ]);
    expect(pruneHiddenAnswers(questions, d).answers).toEqual({
      "event-id": "none",
    });
  });
  it("opens multiple levels only after valid answers, including negated conditions", () => {
    expect(visibleQuestions(questions, draft({}))).toEqual([event]);
    expect(
      visibleQuestions(questions, draft({ "event-id": "forged" })),
    ).toEqual([event]);
    expect(visibleQuestions(questions, draft({ "event-id": "event" }))).toEqual(
      [event, date],
    );
    expect(
      visibleQuestions(
        questions,
        draft({ "event-id": "event", "date-id": "2026-12-02" }),
      ),
    ).toEqual(questions);
  });
  it("supports all/any rules, multiple selections, zero and false", () => {
    const number = { ...question("number", "number"), min: 0, max: 5 };
    const bool = question("bool", "boolean");
    const multiple = question("multi", "multi_choice");
    const branch: DiscoveryQuestion = {
      ...question("branch"),
      visibleWhen: {
        match: "all",
        rules: [
          { question: "number", operator: "in", values: [0] },
          { question: "bool", operator: "in", values: [false] },
          { question: "multi", operator: "in", values: ["event"] },
        ],
      },
    };
    const config = [number, bool, multiple, branch];
    expect(
      visibleQuestions(
        config,
        draft({ "number-id": 0, "bool-id": false, "multi-id": ["event"] }),
      ),
    ).toEqual(config);
    expect(visibleQuestions(config, draft({ "bool-id": false }))).not.toContain(
      branch,
    );
    const any = {
      ...branch,
      visibleWhen: { ...branch.visibleWhen!, match: "any" as const },
    };
    expect(
      visibleQuestions(
        [number, bool, multiple, any],
        draft({ "bool-id": false }),
      ),
    ).toContain(any);
  });
});

it("resumes at the first visible unanswered question and removes stale branch answers", () => {
  const config = { version: 1, questions };
  expect(
    restoreDraft(JSON.stringify(draft({ "event-id": "event" })), config)
      .currentStep,
  ).toBe("date-id");
  expect(
    restoreDraft(
      JSON.stringify({
        ...draft({ "event-id": "none", "date-id": "2026-12-02" }),
        currentStep: "date-id",
      }),
      config,
    ),
  ).toMatchObject({ currentStep: "result", answers: { "event-id": "none" } });
  expect(
    restoreDraft(JSON.stringify(draft({ "event-id": "none" })), config)
      .currentStep,
  ).toBe("registration");
});
