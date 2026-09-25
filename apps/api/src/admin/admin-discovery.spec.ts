import {
  createDiscoveryTemplate,
  deleteDiscoveryTemplate,
  discoveryAdminStats,
  planDiscoveryReorder,
  reorderDiscoveryTemplates,
  updateDiscoveryTemplate,
} from './admin-discovery';
import {
  discoveryFixture,
  discoveryTemplate,
  discoveryTemplatesPrisma,
} from '../../test/utils/discovery-templates-fake';

const order = (rows: { id: string; orderIndex: number; scope: string }[]) =>
  rows
    .filter((r) => r.scope === 'DISCOVERY')
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((r) => r.id);

describe('discoveryAdminStats', () => {
  it('deriva i conteggi escludendo sport e specializzazione con sport fisso', () => {
    expect(discoveryAdminStats(discoveryFixture(), 'fixed')).toEqual({
      configured: 6,
      active: 5,
      inactive: 1,
      conditional: 1,
      unconditional: 3,
      maxVisible: 4,
    });
  });

  it('include sport e specializzazione quando lo sport e a scelta', () => {
    expect(discoveryAdminStats(discoveryFixture(), 'user_choice')).toEqual(
      expect.objectContaining({ unconditional: 4, maxVisible: 5 }),
    );
  });
});

describe('planDiscoveryReorder', () => {
  const ids = [
    'sport',
    'goal',
    'injury',
    'injury_detail',
    'weight',
    'archived',
  ];

  it('assegna 10, 20, 30… nell ordine richiesto', () => {
    const reordered = planDiscoveryReorder(
      discoveryFixture(),
      ['weight', ...ids.filter((id) => id !== 'weight')],
      'fixed',
    );
    expect(reordered.map((t) => [t.id, t.orderIndex])).toEqual([
      ['weight', 10],
      ['sport', 20],
      ['goal', 30],
      ['injury', 40],
      ['injury_detail', 50],
      ['archived', 60],
    ]);
  });

  it('rifiuta una domanda condizionale prima della domanda da cui dipende', () => {
    expect(() =>
      planDiscoveryReorder(
        discoveryFixture(),
        ['sport', 'goal', 'injury_detail', 'injury', 'weight', 'archived'],
        'fixed',
      ),
    ).toThrow(/deve dipendere/);
  });

  it('pretende ogni domanda una sola volta', () => {
    for (const invalid of [
      ids.slice(1),
      [...ids.slice(1), 'goal'],
      [...ids.slice(1), 'unknown'],
    ])
      expect(() =>
        planDiscoveryReorder(discoveryFixture(), invalid, 'fixed'),
      ).toThrow(/una sola volta/);
  });

  it('con sport a scelta tiene lo sport prima della specializzazione', () => {
    const templates = [
      ...discoveryFixture(),
      discoveryTemplate('specialization', 7, {
        type: 'single_choice',
        target: 'specializationId',
      }),
    ];
    expect(() =>
      planDiscoveryReorder(
        templates,
        ['specialization', ...ids],
        'user_choice',
      ),
    ).toThrow(/sport deve precedere/);
  });
});

describe('reorderDiscoveryTemplates', () => {
  it('salva il nuovo ordine e restituisce i conteggi aggiornati', async () => {
    const { prisma, rows } = discoveryTemplatesPrisma(discoveryFixture());
    const ids = [
      'goal',
      'sport',
      'injury',
      'injury_detail',
      'archived',
      'weight',
    ];
    const result = await reorderDiscoveryTemplates(prisma, ids, 'admin');
    expect(order(rows())).toEqual(ids);
    expect(result.templates.map((t) => t.id)).toEqual(ids);
    expect(result.stats.maxVisible).toBe(4);
  });

  it('non scrive nulla quando il nuovo ordine rompe una dipendenza', async () => {
    const { prisma, rows } = discoveryTemplatesPrisma(discoveryFixture());
    const before = rows().map((r) => ({ ...r }));
    await expect(
      reorderDiscoveryTemplates(
        prisma,
        ['sport', 'goal', 'injury_detail', 'injury', 'weight', 'archived'],
        'admin',
      ),
    ).rejects.toThrow(/deve dipendere/);
    expect(rows()).toEqual(before);
  });
});

describe('domande discovery admin', () => {
  const env = process.env.PF4_SPORT_MODE;
  beforeEach(() => delete process.env.PF4_SPORT_MODE);
  afterAll(() => (process.env.PF4_SPORT_MODE = env));
  const numberQuestion = {
    key: 'height',
    label: 'Quanto sei alto?',
    inputType: 'NUMBER' as const,
    optionsJson: {
      type: 'number',
      contextKey: 'general_height_cm',
      min: 120,
      max: 230,
      step: 0.5,
      ui: { unit: 'cm' },
    },
  };

  it('crea una domanda numerica in fondo al percorso con i suoi metadati', async () => {
    const { prisma, rows } = discoveryTemplatesPrisma(discoveryFixture());
    await createDiscoveryTemplate(prisma, numberQuestion, 'admin');
    const created = rows().find((r) => r.key === 'height')!;
    expect(created).toMatchObject({
      scope: 'DISCOVERY',
      orderIndex: 60,
      isActive: true,
      optionsJson: numberQuestion.optionsJson,
    });
  });

  it('rifiuta un codice gia usato', async () => {
    const { prisma } = discoveryTemplatesPrisma(discoveryFixture());
    await expect(
      createDiscoveryTemplate(
        prisma,
        { ...numberQuestion, key: 'weight' },
        'admin',
      ),
    ).rejects.toThrow(/già usato/);
  });

  it('rifiuta una seconda domanda obiettivo', async () => {
    const { prisma } = discoveryTemplatesPrisma(discoveryFixture());
    await expect(
      createDiscoveryTemplate(
        prisma,
        {
          key: 'goal_bis',
          label: 'Altro obiettivo',
          inputType: 'SELECT',
          optionsJson: {
            type: 'single_choice',
            target: 'goalId',
            options: [{ id: 'g2', label: 'Forza', value: 'g2' }],
          },
        },
        'admin',
      ),
    ).rejects.toThrow(/una sola domanda attiva per l'obiettivo/);
  });

  it('rifiuta una condizione numerica con valori testuali', async () => {
    const { prisma } = discoveryTemplatesPrisma(discoveryFixture());
    await expect(
      createDiscoveryTemplate(
        prisma,
        {
          key: 'heavy',
          label: 'Da quando?',
          inputType: 'TEXT',
          optionsJson: {
            type: 'date',
            visibleWhen: {
              match: 'all',
              rules: [{ question: 'weight', operator: 'in', values: ['90'] }],
            },
          },
        },
        'admin',
      ),
    ).rejects.toThrow(/condizioni numeriche richiedono numeri/);
  });

  it('disattiva con una modifica parziale lasciando invariato il resto', async () => {
    const { prisma, rows } = discoveryTemplatesPrisma(discoveryFixture());
    await updateDiscoveryTemplate(prisma, 'weight', { isActive: false }, 'a');
    const weight = rows().find((r) => r.id === 'weight')!;
    expect(weight).toMatchObject({
      isActive: false,
      label: 'WEIGHT',
      orderIndex: 40,
    });
    expect(weight.optionsJson).toMatchObject({ type: 'number' });
    expect(discoveryAdminStats(rows(), 'fixed').active).toBe(4);
  });

  it('non lascia la discovery senza obiettivo', async () => {
    const { prisma } = discoveryTemplatesPrisma(discoveryFixture());
    await expect(
      updateDiscoveryTemplate(prisma, 'goal', { isActive: false }, 'a'),
    ).rejects.toThrow(/richiede una domanda attiva per l'obiettivo/);
  });

  it('rifiuta una condizione su una domanda successiva', async () => {
    const { prisma } = discoveryTemplatesPrisma(discoveryFixture());
    await expect(
      updateDiscoveryTemplate(
        prisma,
        'injury',
        {
          optionsJson: {
            type: 'boolean',
            options: [
              { id: 'yes', label: 'Sì', value: true },
              { id: 'no', label: 'No', value: false },
            ],
            visibleWhen: {
              match: 'all',
              rules: [
                { question: 'injury_detail', operator: 'in', values: ['knee'] },
              ],
            },
          },
        },
        'a',
      ),
    ).rejects.toThrow(/deve dipendere/);
  });

  it('non elimina una domanda usata in una condizione', async () => {
    const { prisma, rows } = discoveryTemplatesPrisma(discoveryFixture());
    await expect(deleteDiscoveryTemplate(prisma, 'injury')).rejects.toThrow(
      'Impossibile eliminare «INJURY»: la usa la condizione di «INJURY_DETAIL»',
    );
    await deleteDiscoveryTemplate(prisma, 'injury_detail');
    await deleteDiscoveryTemplate(prisma, 'injury');
    expect(rows().map((r) => r.id)).not.toContain('injury');
  });

  it('gestisce soltanto domande discovery', async () => {
    const { prisma } = discoveryTemplatesPrisma([
      ...discoveryFixture(),
      discoveryTemplate('area', 1, {}, { scope: 'AREA' }),
    ]);
    await expect(deleteDiscoveryTemplate(prisma, 'area')).rejects.toThrow(
      /non trovata/,
    );
    await expect(
      updateDiscoveryTemplate(prisma, 'area', { isActive: false }, 'a'),
    ).rejects.toThrow(/non trovata/);
  });
});
