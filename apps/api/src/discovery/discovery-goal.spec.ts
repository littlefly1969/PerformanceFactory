import { discoveryGoalText } from './discovery-goal';
import { validateDiscovery } from './discovery-validation';
import { assertDiscoveryMetadata } from './discovery-metadata';
import { DiscoveryConfiguration, DiscoveryQuestion } from './discovery.types';

const goal: DiscoveryQuestion = {
  id: 'pf4_goal',
  code: 'pf4_goal',
  title: 'Quali sono i tuoi obiettivi?',
  type: 'multi_choice',
  required: true,
  order: 1,
  target: 'goalId',
  options: [
    { id: '0', label: 'Migliorare la tecnica', value: 'Migliorare la tecnica' },
    { id: '1', label: 'Aumentare la resistenza', value: 'x' },
    { id: '2', label: 'Perdere peso', value: 'y' },
  ],
};

describe('obiettivi a risposta multipla', () => {
  it('unisce gli obiettivi scelti nell’ordine configurato', () => {
    expect(discoveryGoalText(goal, ['0'])).toBe('Migliorare la tecnica');
    expect(discoveryGoalText(goal, ['1', '0'])).toBe(
      'Migliorare la tecnica e aumentare la resistenza',
    );
    expect(discoveryGoalText(goal, ['2', '1', '0'])).toBe(
      'Migliorare la tecnica, aumentare la resistenza e perdere peso',
    );
  });

  it('accetta ancora un obiettivo singolo (bozze della versione precedente)', () => {
    expect(discoveryGoalText({ ...goal, type: 'single_choice' }, '1')).toBe(
      'Aumentare la resistenza',
    );
    expect(() => discoveryGoalText(goal, [])).toThrow();
  });

  it('valida una lista di obiettivi e ne rifiuta una vuota', () => {
    const config: DiscoveryConfiguration = { version: 7, questions: [goal] };
    const draft = {
      version: 7,
      currentStep: 'registration',
      goalId: ['0', '2'],
      answers: {},
    };
    expect(validateDiscovery(config, draft).goalId).toEqual(['0', '2']);
    for (const goalId of [[], ['0', '0'], ['9'], '0'])
      expect(() => validateDiscovery(config, { ...draft, goalId })).toThrow();
  });

  it('permette la scelta multipla solo alla domanda obiettivo', () => {
    const options = [{ id: 'a', label: 'A', value: 'a' }];
    expect(() =>
      assertDiscoveryMetadata(
        { type: 'multi_choice', target: 'goalId', options },
        true,
      ),
    ).not.toThrow();
    for (const target of ['sportId', 'specializationId'])
      expect(() =>
        assertDiscoveryMetadata(
          { type: 'multi_choice', target, options },
          true,
        ),
      ).toThrow();
    expect(() =>
      assertDiscoveryMetadata(
        { type: 'multi_choice', target: 'goalId', options },
        false,
      ),
    ).toThrow();
  });
});
