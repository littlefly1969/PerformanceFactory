import { validateDiscovery, validAnswer } from './discovery-validation';
import { assertDiscoveryMetadata } from './discovery-metadata';
import {
  DiscoveryConfiguration,
  DiscoveryDraft,
  DiscoveryQuestion,
} from './discovery.types';

const question: DiscoveryQuestion = {
  id: 'experience',
  code: 'experience',
  title: 'Esperienza',
  type: 'single_choice',
  required: true,
  order: 1,
  options: [{ id: 'one', label: 'Un anno', value: 1 }],
};
const config: DiscoveryConfiguration = { version: 123, questions: [question] };
const draft: DiscoveryDraft = {
  version: 123,
  currentStep: 'registration',
  answers: { experience: 'one' },
};

describe('Discovery registration boundary', () => {
  it('accepts current option IDs and returns only persistable draft fields', () => {
    expect(validateDiscovery(config, draft)).toEqual(draft);
  });
  it.each([
    { ...draft, version: 122 },
    { ...draft, answers: { experience: 'removed-option' } },
    { ...draft, answers: { experience: 'one', removed: true } },
    { ...draft, answers: {} },
    { ...draft, currentStep: 'experience' },
    { ...draft, admin: true },
    { ...draft, answers: [] },
  ])('rejects tampered, stale or incomplete payload %#', (value) => {
    expect(() => validateDiscovery(config, value)).toThrow();
  });
  it('validates specialization against its selected sport', () => {
    const q = {
      ...question,
      target: 'specializationId' as const,
      dependsOn: 'sportId' as const,
      options: [
        { id: 'one', label: 'Single', value: 'one', parentId: 'tennis' },
      ],
    };
    expect(validAnswer(q, 'one', 'tennis')).toBe(true);
    expect(validAnswer(q, 'one', 'running')).toBe(false);
  });
  it('checks multi-choice membership, duplicates and required selection', () => {
    const q = { ...question, type: 'multi_choice' as const };
    expect(validAnswer(q, ['one'])).toBe(true);
    for (const value of [[], ['one', 'one'], ['removed'], 'one'])
      expect(validAnswer(q, value)).toBe(false);
  });
  it.each(['number', 'scale'] as const)(
    'checks %s bounds, increments and JSON numeric type',
    (type) => {
      const q = { ...question, type, min: 1, max: 5, step: 0.5 };
      expect(validAnswer(q, 2.5)).toBe(true);
      for (const value of ['2', NaN, Infinity, 0, 6, 2.25])
        expect(validAnswer(q, value)).toBe(false);
    },
  );
  it('accepts boolean false and distinguishes it from missing and string values', () => {
    const q = { ...question, type: 'boolean' as const };
    expect(validAnswer(q, false)).toBe(true);
    expect(validAnswer(q, undefined)).toBe(false);
    expect(validAnswer(q, 'false')).toBe(false);
  });
  it('allows an omitted optional question', () => {
    expect(validAnswer({ ...question, required: false }, undefined)).toBe(true);
  });
  it('rejects invalid backend configuration before publication', () => {
    expect(() =>
      assertDiscoveryMetadata({ type: 'number', min: 5, max: 1 }, true),
    ).toThrow();
    expect(() =>
      assertDiscoveryMetadata(
        { type: 'single_choice', target: 'sportId' },
        false,
      ),
    ).toThrow();
    expect(() =>
      assertDiscoveryMetadata(
        {
          type: 'single_choice',
          options: [question.options[0], question.options[0]],
        },
        true,
      ),
    ).toThrow();
    expect(() =>
      assertDiscoveryMetadata(
        {
          type: 'boolean',
          options: [
            { id: 'yes', label: 'Sì', value: true },
            { id: 'no', label: 'No', value: false },
          ],
        },
        true,
      ),
    ).not.toThrow();
  });
});
