import { CalibrationQuestion } from '../../ai-orchestrator/calibration-questions';
import {
  isDeclaredLimitation,
  microTestBalance,
  microTestsByArea,
  publicMicroTest,
  roundEvidence,
  situationFeedback,
  validRoundAnswers,
} from './micro-test-step';

/** Voce di una situazione di gioco, con la corretta in o2. */
const situationItem = (index: number): CalibrationQuestion => ({
  id: `t${index + 1}`,
  areaId: 'a',
  text: `Situazione ${index + 1}?`,
  options: [
    { value: 'o1', label: 'Attacco', score: 20 },
    { value: 'o2', label: 'Aspetto', score: 80 },
  ],
  microTest: {
    id: 'm1',
    title: 'Il terzo colpo decide il punto.',
    instructions: 'Tre situazioni.',
    format: 'SITUATIONAL',
    situation: {
      index,
      total: 2,
      label: index ? 'Posizionamento' : 'Uscita dal fondo',
      context: 'Siete a rete.',
      options: [
        { value: 'o1', correct: false, feedback: 'Così perdi la rete.' },
        { value: 'o2', correct: true, feedback: 'Esatto.' },
      ],
      video: null,
    },
  } as CalibrationQuestion['microTest'],
});

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

  it('counts game situations once, by the test title', () => {
    const tests = microTestsByArea([
      {
        status: 'EVALUATED',
        questionsJson: [situationItem(0), situationItem(1)],
      },
    ]);
    expect(tests.get('a')).toEqual(['Il terzo colpo decide il punto.']);
  });

  it('shows a situation without its correct answer until the athlete answers', () => {
    const item = situationItem(0);
    const shown = publicMicroTest(item);
    expect(shown.microTest).toMatchObject({
      format: 'SITUATIONAL',
      title: 'Il terzo colpo decide il punto.',
      situation: { index: 0, total: 2, label: 'Uscita dal fondo' },
    });
    expect(JSON.stringify(shown)).not.toMatch(/correct|feedback|Esatto/);
    expect(publicMicroTest(item, { t1: 'o1' }).microTest).toMatchObject({
      feedback: {
        value: 'o1',
        correct: false,
        correctValue: 'o2',
        feedback: { o1: 'Così perdi la rete.', o2: 'Esatto.' },
      },
    });
    expect(situationFeedback(item, 'o9')).toBeNull();
  });

  it('keeps the situation answers given before the explanation', () => {
    const round = {
      questionsJson: [situationItem(0), situationItem(1)],
      answersJson: { t1: 'o1' },
    };
    expect(validRoundAnswers(round, { t1: 'o1', t2: 'o2' })).toBe(true);
    expect(validRoundAnswers(round, { t1: 'o2', t2: 'o2' })).toBe(false);
    expect(validRoundAnswers(round, { t1: 'o1' })).toBe(false);
    expect(validRoundAnswers(round, { t1: 'o1', t2: 'o9' })).toBe(false);
  });

  it('tells the evaluation whether a situation was answered correctly', () => {
    const item = situationItem(0);
    expect(roundEvidence(item, { label: 'Aspetto' })).toEqual({
      question:
        'Micro-test «Il terzo colpo decide il punto.», situazione «Uscita dal fondo»: Situazione 1?',
      answer: 'Aspetto (risposta corretta)',
      source: 'MICRO_TEST',
    });
    expect(roundEvidence(item, { label: 'Attacco' }).answer).toBe(
      'Attacco (risposta non corretta)',
    );
  });
});
