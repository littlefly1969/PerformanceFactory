import { visibleQuestions, pruneHiddenAnswers } from './discovery-branches';
import { DiscoveryQuestion, DiscoveryDraft } from './discovery.types';
import { validateDiscovery } from './discovery-validation';
import {
  assertDiscoveryGraph,
  assertDiscoveryCondition,
} from './discovery-conditions';

const question = (
  code: string,
  type: DiscoveryQuestion['type'] = 'single_choice',
): DiscoveryQuestion => ({
  id: code + '-id',
  code,
  title: code,
  type,
  required: true,
  order: 1,
  options: [
    { id: 'event', label: 'Torneo', value: 'Torneo' },
    { id: 'none', label: 'Nessuno', value: 'Nessuno' },
  ],
});
const event = question('event');
const date: DiscoveryQuestion = {
  ...question('date', 'date'),
  visibleWhen: {
    match: 'all',
    rules: [{ question: 'event', operator: 'in', values: ['event'] }],
  },
};
const child: DiscoveryQuestion = {
  ...question('child'),
  visibleWhen: {
    match: 'all',
    rules: [{ question: 'date', operator: 'not_in', values: ['2026-12-01'] }],
  },
};
const questions = [event, date, child];
const draft = (answers: Record<string, unknown>): DiscoveryDraft => ({
  version: 1,
  currentStep: 'registration',
  answers,
});

describe('Conditional discovery paths', () => {
  it('skips the event date and every descendant when there is no event', () => {
    const d = draft({
      'event-id': 'none',
      'date-id': '2026-12-02',
      'child-id': 'event',
    });
    expect(visibleQuestions(questions, d).map((q) => q.code)).toEqual([
      'event',
    ]);
    expect(pruneHiddenAnswers(questions, d).answers).toEqual({
      'event-id': 'none',
    });
  });
  it('opens multiple levels only after valid answers, including negated conditions', () => {
    expect(visibleQuestions(questions, draft({}))).toEqual([event]);
    expect(
      visibleQuestions(questions, draft({ 'event-id': 'forged' })),
    ).toEqual([event]);
    expect(visibleQuestions(questions, draft({ 'event-id': 'event' }))).toEqual(
      [event, date],
    );
    expect(
      visibleQuestions(
        questions,
        draft({ 'event-id': 'event', 'date-id': '2026-12-02' }),
      ),
    ).toEqual(questions);
  });
  it('supports all/any rules, multiple selections, zero and false', () => {
    const number = { ...question('number', 'number'), min: 0, max: 5 };
    const bool = question('bool', 'boolean');
    const multiple = question('multi', 'multi_choice');
    const branch: DiscoveryQuestion = {
      ...question('branch'),
      visibleWhen: {
        match: 'all',
        rules: [
          { question: 'number', operator: 'in', values: [0] },
          { question: 'bool', operator: 'in', values: [false] },
          { question: 'multi', operator: 'in', values: ['event'] },
        ],
      },
    };
    const config = [number, bool, multiple, branch];
    expect(
      visibleQuestions(
        config,
        draft({ 'number-id': 0, 'bool-id': false, 'multi-id': ['event'] }),
      ),
    ).toEqual(config);
    expect(visibleQuestions(config, draft({ 'bool-id': false }))).not.toContain(
      branch,
    );
    const any = {
      ...branch,
      visibleWhen: { ...branch.visibleWhen!, match: 'any' as const },
    };
    expect(
      visibleQuestions(
        [number, bool, multiple, any],
        draft({ 'bool-id': false }),
      ),
    ).toContain(any);
  });
});

describe('Discovery tree registration and configuration', () => {
  it('discards hidden payload and requires visible date server-side', () => {
    expect(
      validateDiscovery(
        { version: 1, questions },
        draft({ 'event-id': 'none', 'date-id': 'forged' }),
      ).answers,
    ).toEqual({ 'event-id': 'none' });
    expect(() =>
      validateDiscovery(
        { version: 1, questions },
        draft({ 'event-id': 'event' }),
      ),
    ).toThrow();
    expect(
      validateDiscovery(
        { version: 1, questions },
        draft({ 'event-id': 'event', 'date-id': '2026-12-01' }),
      ).answers,
    ).toEqual({ 'event-id': 'event', 'date-id': '2026-12-01' });
  });
  it('rejects malformed, missing, later, cyclic, inactive and invalid-option references', () => {
    for (const value of [
      null,
      {},
      { match: 'all', rules: [] },
      {
        match: 'any',
        rules: [{ question: 'event', operator: 'eval', values: ['event'] }],
      },
    ])
      expect(() => assertDiscoveryCondition(value)).toThrow();
    const templates = questions.map((q, i) => ({
      key: q.code,
      orderIndex: i + 1,
      isActive: true,
      optionsJson: q,
    }));
    expect(() => assertDiscoveryGraph(templates)).not.toThrow();
    expect(() => assertDiscoveryGraph(templates.slice(1))).toThrow();
    expect(() =>
      assertDiscoveryGraph(
        templates.map((t, i) => (i === 0 ? { ...t, orderIndex: 3 } : t)),
      ),
    ).toThrow();
    expect(() =>
      assertDiscoveryGraph(
        templates.map((t, i) => (i === 0 ? { ...t, isActive: false } : t)),
      ),
    ).toThrow();
    expect(() =>
      assertDiscoveryGraph(
        templates.map((t, i) =>
          i === 0
            ? { ...t, optionsJson: { ...t.optionsJson, options: [] } }
            : t,
        ),
      ),
    ).toThrow();
  });
});
