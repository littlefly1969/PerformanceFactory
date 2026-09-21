import { DiscoveryDraft, DiscoveryQuestion } from './discovery.types';
import { validAnswer } from './discovery-answer';

/** Earlier visible, answered questions decide each branch. Hidden ancestors never match. */
export function visibleQuestions(
  questions: DiscoveryQuestion[],
  draft: DiscoveryDraft,
): DiscoveryQuestion[] {
  const visible = new Map<string, DiscoveryQuestion>();
  return questions.filter((question) => {
    const condition = question.visibleWhen;
    const matches =
      !condition ||
      condition.rules[condition.match === 'all' ? 'every' : 'some']((rule) => {
        const parent = visible.get(rule.question);
        if (!parent) return false;
        const value = parent.target
          ? draft[parent.target]
          : draft.answers[parent.id];
        if (
          value === undefined ||
          value === null ||
          value === '' ||
          (Array.isArray(value) && value.length === 0) ||
          !validAnswer(parent, value, draft.sportId)
        )
          return false;
        const selected = Array.isArray(value) ? value : [value];
        const included = rule.values.some((v) => selected.includes(v));
        return rule.operator === 'in' ? included : !included;
      });
    if (matches) visible.set(question.code, question);
    return matches;
  });
}

export function pruneHiddenAnswers(
  questions: DiscoveryQuestion[],
  draft: DiscoveryDraft,
): DiscoveryDraft {
  const visible = new Set(visibleQuestions(questions, draft).map((q) => q.id));
  return {
    ...draft,
    answers: Object.fromEntries(
      Object.entries(draft.answers).filter(([id]) => visible.has(id)),
    ),
  };
}
