import { AssessmentEvaluationInput } from '../ai-orchestrator/assessment-evaluation-model';

const range = { min: 0, max: 100 };
const driver = (
  areaId: string,
  name: string,
  answers: Array<[string, string, number]>,
) => ({
  areaId,
  name,
  answers: answers.map(([question, answer, optionScore]) => ({
    question,
    answer,
    optionScore,
    optionScoreRange: range,
  })),
});

/** Caso di prova inventato: nessun dato di atleti reali lascia il sistema. */
export const SYNTHETIC_ASSESSMENT_CASE: Omit<
  AssessmentEvaluationInput,
  'basePrompt' | 'promptVersionId'
> = {
  scale: { minScore: 0, maxScore: 100 },
  athleteContext: [
    { question: 'Quanti anni hai?', answer: '30-39' },
    { question: 'Da quanto tempo pratichi?', answer: 'Da 1 a 3 anni' },
    { question: 'Quante volte ti alleni a settimana?', answer: '1-2 volte' },
    { question: 'Hai dolori o limitazioni fisiche?', answer: 'Nessuna' },
    {
      question: 'Qual è il tuo obiettivo principale?',
      answer: 'Salire di categoria',
    },
  ],
  availability: [
    {
      question: 'Quanti giorni alla settimana puoi allenarti?',
      answer: '3 giorni',
    },
    { question: 'Quanto tempo per sessione?', answer: '60 minuti' },
  ],
  drivers: [
    driver('synthetic-tecnica', 'Tecnico-tattico', [
      [
        'A rete, cosa succede più spesso?',
        'Chiudo, ma senza decidere dove',
        67,
      ],
      ['Il colpo dopo la parete di fondo.', 'Esce, ma senza direzione', 33],
    ]),
    driver('synthetic-preparazione', 'Preparazione', [
      ['Al terzo set come stai?', 'Cala la velocità ma tengo', 67],
      ['Allenamenti fuori dal campo a settimana?', 'Nessuno', 0],
    ]),
    driver('synthetic-mental', 'Mental', [
      ['Sotto 4-5 nel set decisivo?', 'Gioco il mio gioco', 100],
      ['Dopo un errore grave?', 'Mi servono un paio di punti', 67],
    ]),
    driver('synthetic-nutrizione', 'Nutrizione', [
      ['Cosa mangi prima di giocare?', 'Quello che capita', 33],
      ['E dopo la partita?', 'Mangio quando torno a casa', 33],
    ]),
    driver('synthetic-attrezzatura', 'Attrezzatura', [
      ['Come hai scelto la pala?', 'Consigliata da un esperto', 67],
      ['Scarpe e overgrip.', 'Cambio quando sono consumate', 67],
    ]),
    driver('synthetic-biomeccanica', 'Biomeccanica', [
      [
        'Dolori ricorrenti dopo aver giocato?',
        'Rigidità che passa in un giorno',
        67,
      ],
      ['Mobilità di spalla e anca.', 'Discreta, senza lavoro specifico', 33],
    ]),
  ],
};
