import { choiceEvidence, chosenOptions } from './choice-answers';

const options = [
  { value: '0', label: 'Nessuno', score: 100, exclusive: true },
  { value: '1', label: 'Gomito', score: 40 },
  { value: '2', label: 'Schiena', score: 20 },
];

describe('choice answers', () => {
  it('reads a single choice by value', () => {
    expect(chosenOptions(options, '1')).toEqual([options[1]]);
    expect(chosenOptions(options, 1)).toEqual([options[1]]);
    expect(chosenOptions(options, ['1'])).toBeNull();
    expect(chosenOptions(options, '9')).toBeNull();
  });

  it('reads a multiple choice and keeps an exclusive option alone', () => {
    expect(chosenOptions(options, ['2', '1'], true)).toEqual([
      options[2],
      options[1],
    ]);
    expect(chosenOptions(options, ['0'], true)).toEqual([options[0]]);
    for (const value of [[], ['1', '1'], ['0', '1'], ['9'], '1'])
      expect(chosenOptions(options, value, true)).toBeNull();
  });

  it('sends every chosen option to the AI with the mean as fallback', () => {
    expect(choiceEvidence([options[1], options[2]], true)).toEqual({
      answer: 'Gomito; Schiena',
      optionScore: 30,
      selectedOptions: [
        { label: 'Gomito', score: 40 },
        { label: 'Schiena', score: 20 },
      ],
    });
    expect(choiceEvidence([options[1]])).toEqual({
      answer: 'Gomito',
      optionScore: 40,
    });
  });
});
