import { OnboardingQuestionTemplate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildAssessmentConfiguration,
  semanticRoleOf,
} from './assessment-configuration';

const template = (
  id: string,
  extra: Partial<OnboardingQuestionTemplate>,
): OnboardingQuestionTemplate => ({
  id,
  key: id,
  scope: 'AREA',
  areaId: null,
  label: id,
  helpText: null,
  inputType: 'SELECT',
  optionsJson: null,
  required: true,
  orderIndex: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: null,
  updatedById: null,
  ...extra,
});
const operational = (role: string, orderIndex: number) =>
  template(`op_${role}`, {
    scope: 'GENERAL',
    orderIndex,
    optionsJson: {
      type: 'single_choice',
      semanticRole: role,
      options: [{ id: '1', label: '1', value: 1 }],
    },
  });
const scored = [
  { value: '0', label: 'Bene', score: 100 },
  { value: '1', label: 'Male', score: 0 },
];
const question = (
  areaId: string,
  orderIndex: number,
  options: unknown = scored,
  sportKey = 'PADEL',
) =>
  template(`${areaId}_${orderIndex}`, {
    areaId,
    orderIndex,
    optionsJson: {
      sportKey,
      options,
    } as OnboardingQuestionTemplate['optionsJson'],
  });
const drivers = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `area${i}`, name: `Area ${i}` }));
/** Due domande per driver, nell'ordine dei driver. */
const twoEach = (n: number) =>
  drivers(n).flatMap((d, i) => [
    question(d.id, i * 10 + 1),
    question(d.id, i * 10 + 2),
  ]);

function prisma(rows: OnboardingQuestionTemplate[]) {
  return {
    onboardingQuestionTemplate: {
      findMany: ({
        where,
      }: {
        where: {
          scope: string;
          isActive: boolean;
          areaId?: { in: string[] };
          optionsJson?: { equals: string };
        };
      }) =>
        Promise.resolve(
          rows
            .filter(
              (r) =>
                r.scope === where.scope &&
                r.isActive === where.isActive &&
                (!where.areaId || where.areaId.in.includes(r.areaId!)) &&
                (!where.optionsJson ||
                  (r.optionsJson as { sportKey?: string }).sportKey ===
                    where.optionsJson.equals),
            )
            .sort((a, b) => a.orderIndex - b.orderIndex),
        ),
    },
  } as unknown as PrismaService;
}
const fixed = [
  operational('TRAINING_AVAILABILITY_DAYS', 1),
  operational('TRAINING_SESSION_DURATION', 2),
];

describe('buildAssessmentConfiguration', () => {
  it.each([
    [5, 12, 4],
    [6, 14, 5],
    [4, 10, 4],
  ])(
    'con %i driver somma 2 operative e 2 domande per driver: %i domande, %i minuti',
    async (areas, count, minutes) => {
      const config = await buildAssessmentConfiguration(
        prisma([...fixed, ...twoEach(areas)]),
        'PADEL',
        drivers(areas),
      );
      expect(config).toMatchObject({
        fixedQuestionCount: 2,
        areaQuestionCount: areas * 2,
        count,
        estimatedMinutes: minutes,
        problems: [],
      });
    },
  );

  it.each([
    [1, 'found 1'],
    [3, 'found 3'],
  ])('rifiuta un driver con %i domande attive', async (n, found) => {
    const rows = [
      ...fixed,
      ...twoEach(2).filter((q) => q.areaId !== 'area1'),
      ...Array.from({ length: n }, (_, i) => question('area1', 20 + i)),
    ];
    const config = await buildAssessmentConfiguration(
      prisma(rows),
      'PADEL',
      drivers(2),
    );
    expect(config.problems).toEqual([
      `Area "Area 1": expected 2 active questions, ${found}`,
    ]);
  });

  it('ignora le domande di altri sport e pretende opzioni con punteggio', async () => {
    const rows = [
      ...fixed,
      question('area0', 1),
      question('area0', 2, [{ value: '0', label: 'Senza punteggio' }]),
      question('area0', 3, scored, 'RUNNING'),
    ];
    const config = await buildAssessmentConfiguration(
      prisma(rows),
      'PADEL',
      drivers(1),
    );
    expect(config.areaQuestionCount).toBe(2);
    expect(config.problems).toEqual([
      'Area "Area 0": question "area0_2" needs options with a score',
    ]);
  });

  it('segnala una domanda operativa mancante', async () => {
    const config = await buildAssessmentConfiguration(
      prisma([fixed[0], ...twoEach(1)]),
      'PADEL',
      drivers(1),
    );
    expect(config.problems).toEqual([
      'Domanda operativa TRAINING_SESSION_DURATION: expected 1 active question, found 0',
    ]);
  });

  it('mette le operative in testa con la chiave del training e ordina i driver', async () => {
    const rows = [
      ...fixed,
      question('area0', 30),
      question('area0', 31),
      question('area1', 10),
      question('area1', 11),
    ];
    const config = await buildAssessmentConfiguration(
      prisma(rows),
      'PADEL',
      drivers(2),
    );
    expect(config.operational.map((q) => [q.key, q.scope, q.areaId])).toEqual([
      ['training_days_available', 'GENERAL', null],
      ['training_session_duration', 'GENERAL', null],
    ]);
    expect(config.areas.map((a) => a.id)).toEqual(['area1', 'area0']);
  });

  it('riconosce solo i ruoli operativi previsti', () => {
    expect(
      semanticRoleOf({
        optionsJson: { semanticRole: 'TRAINING_SESSION_DURATION' },
      }),
    ).toBe('TRAINING_SESSION_DURATION');
    expect(
      semanticRoleOf({ optionsJson: { semanticRole: 'SOMETHING_ELSE' } }),
    ).toBeUndefined();
    expect(semanticRoleOf({ optionsJson: [] })).toBeUndefined();
  });
});
