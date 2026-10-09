import {
  isDeclaredLimitation,
  microTestBalance,
  microTestsByArea,
  roundEvidence,
} from './micro-test-step';

describe('micro-test step', () => {
  it('counts micro-tests done and skipped against the questions answered', () => {
    const q = (n: number) => Array.from({ length: n }, () => ({}));
    const rounds = [
      { status: 'EVALUATED', action: 'ASK_GROUP', questionsJson: q(3) },
      { status: 'EVALUATED', action: null, questionsJson: q(2) },
      {
        status: 'EVALUATED',
        action: 'PROPOSE_MICRO_TEST',
        questionsJson: q(1),
      },
      { status: 'SKIPPED', action: 'PROPOSE_MICRO_TEST', questionsJson: q(1) },
      { status: 'OPEN', action: 'ASK_SINGLE', questionsJson: q(1) },
    ];
    expect(microTestBalance(rounds, 4)).toEqual({
      questionsPerMicroTest: 4,
      microTestsDone: 1,
      microTestsSkipped: 1,
      questionsAnswered: 5,
    });
  });

  it.each([
    ['Hai dolori o infortuni recenti?', 'Mal di schiena da un mese', true],
    ['Stato di salute, limitazioni note', 'Ginocchio operato', true],
    ['Hai dolori o infortuni recenti?', 'No', false],
    ['Hai dolori o infortuni recenti?', 'Nessuno', false],
    ['Hai dolori o infortuni recenti?', null, false],
    ['Da quanto giochi?', 'Infortunio al polso anni fa', false],
  ])(
    'reads a declared limitation from «%s» → %s',
    (question, answer, expected) => {
      expect(isDeclaredLimitation({ question, answer })).toBe(expected);
    },
  );

  it('tells the engine which micro-tests were proposed, marking the skipped ones', () => {
    const test = (areaId: string, text: string) => ({
      id: 't1',
      areaId,
      text,
      options: [],
      microTest: {} as never,
    });
    const tests = microTestsByArea([
      { status: 'EVALUATED', questionsJson: [test('a', 'Volée a muro')] },
      { status: 'SKIPPED', questionsJson: [test('a', 'Uscita dalla parete')] },
      {
        status: 'EVALUATED',
        questionsJson: [
          { id: 'q1', areaId: 'b', text: 'Domanda', options: [] },
        ],
      },
    ]);
    expect(tests.get('a')).toEqual([
      'Volée a muro',
      'Uscita dalla parete (saltato)',
    ]);
    expect(tests.has('b')).toBe(false);
  });

  it('marks a micro-test outcome as self-reported evidence', () => {
    const option = { value: 'o2', label: '4-7 su 10', score: 50 };
    expect(
      roundEvidence(
        {
          id: 't1',
          areaId: 'a',
          text: 'Volée a muro',
          options: [option],
          microTest: { instructions: 'Dieci volée.' } as never,
        },
        option,
      ),
    ).toEqual({
      question: 'Micro-test «Volée a muro»: Dieci volée.',
      answer: "4-7 su 10 (esito riportato dall'atleta)",
      source: 'MICRO_TEST',
    });
    expect(
      roundEvidence(
        { id: 'q1', areaId: 'a', text: 'Domanda?', options: [option] },
        option,
      ),
    ).toEqual({
      question: 'Domanda?',
      answer: '4-7 su 10',
      source: 'CALIBRATION',
    });
  });
});
