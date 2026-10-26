import {
  normalizeObjectives,
  normalizeSessionContent,
  sessionContentMetadata,
  sessionContentSchemaProperties,
  objectivesSchema,
} from './session-content';
import { sessionContent } from '../athlete/athlete-views';

describe('session content written by the AI', () => {
  it('keeps complete exercises in order and drops malformed ones', () => {
    const content = normalizeSessionContent({
      mode: 'PARTNER',
      goal: ' Spinta laterale ',
      prerequisites: '',
      exercises: [
        {
          name: 'Skip laterale',
          prescription: '2 × 40 sec',
          cue: 'Busto alto.',
          demo: 'Skip lungo la linea di fondo.',
          workSeconds: 40,
          restSeconds: 45,
        },
        { name: 'Senza prescrizione' },
        'non un oggetto',
        {
          name: 'Affondi laterali',
          prescription: '12 per lato',
          cue: 'Ginocchio sopra il piede.',
          demo: 'Affondo laterale.',
          workSeconds: 0,
          restSeconds: 0,
        },
      ],
    });
    expect(content).toEqual({
      mode: 'PARTNER',
      goal: 'Spinta laterale',
      prerequisites: null,
      exercises: [
        {
          name: 'Skip laterale',
          prescription: '2 × 40 sec',
          cue: 'Busto alto.',
          demo: 'Skip lungo la linea di fondo.',
          workSeconds: 40,
          restSeconds: 45,
        },
        {
          name: 'Affondi laterali',
          prescription: '12 per lato',
          cue: 'Ginocchio sopra il piede.',
          demo: 'Affondo laterale.',
          workSeconds: null,
          restSeconds: 0,
        },
      ],
    });
    expect(
      normalizeSessionContent({
        exercises: [{ name: 'A', prescription: '1', restSeconds: 5000 }],
      }).exercises[0].restSeconds,
    ).toBeNull();
    expect(sessionContentMetadata(content)).toEqual({
      mode: 'PARTNER',
      goal: 'Spinta laterale',
      exercises: content.exercises,
    });
  });

  it('reads sessions published before exercises existed', () => {
    expect(
      sessionContent(
        { durationMinutes: 30, schedule: { dayOffset: 8 } },
        '2026-09-09',
        new Date('2026-09-01T00:00:00Z'),
      ),
    ).toEqual({
      durationMinutes: 30,
      restSeconds: null,
      equipment: null,
      mode: null,
      goal: null,
      prerequisites: null,
      exercises: [],
      week: 2,
    });
  });

  it('accepts only measurable objectives with a target and a known source', () => {
    expect(
      normalizeObjectives([
        {
          area: 'Preparazione atletica',
          title: 'Plank',
          unit: 'sec',
          baseline: 48,
          current: null,
          target: 60,
          targetLabel: null,
          deadline: 'Entro fine blocco',
          source: 'CHECK_IN_TEST',
        },
        {
          area: 'Tecnico-tattico',
          title: 'Rovescio di parete',
          unit: null,
          baseline: null,
          current: null,
          target: null,
          targetLabel: 'Valutazione del coach',
          deadline: 'Prossima lezione',
          source: 'COACH_EVALUATION',
        },
        { area: 'Mental', title: 'Senza bersaglio', source: 'ATHLETE_ANSWERS' },
        { area: 'Nutrizione', title: 'Fonte ignota', target: 1, source: 'X' },
      ]),
    ).toEqual([
      expect.objectContaining({ title: 'Plank', current: 48, target: 60 }),
      expect.objectContaining({
        title: 'Rovescio di parete',
        targetLabel: 'Valutazione del coach',
      }),
    ]);
  });

  it('is strict-schema friendly: every property is required', () => {
    const exercise = sessionContentSchemaProperties().exercises.items;
    expect(exercise.required).toEqual(Object.keys(exercise.properties));
    expect(exercise.additionalProperties).toBe(false);
    const objective = objectivesSchema().items;
    expect(objective.required).toEqual(Object.keys(objective.properties));
  });
});
