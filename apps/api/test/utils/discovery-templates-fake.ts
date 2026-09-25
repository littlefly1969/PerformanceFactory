import { PrismaService } from '../../src/prisma/prisma.service';

export type FakeTemplate = {
  id: string;
  key: string;
  scope: string;
  areaId: string | null;
  label: string;
  helpText: string | null;
  inputType: string;
  optionsJson: unknown;
  required: boolean;
  orderIndex: number;
  isActive: boolean;
  updatedAt: Date;
  updatedById?: string | null;
  createdById?: string | null;
};

export function discoveryTemplate(
  key: string,
  orderIndex: number,
  optionsJson: Record<string, unknown>,
  extra: Partial<FakeTemplate> = {},
): FakeTemplate {
  return {
    id: key,
    key,
    scope: 'DISCOVERY',
    areaId: null,
    label: key.toUpperCase(),
    helpText: null,
    inputType: 'SELECT',
    optionsJson,
    required: true,
    orderIndex,
    isActive: true,
    updatedAt: new Date('2026-09-25T00:00:00Z'),
    ...extra,
  };
}

/** Percorso tipico: sport fisso, obiettivo, infortunio con ramo e peso. */
export function discoveryFixture() {
  return [
    discoveryTemplate('sport', 5, { type: 'single_choice', target: 'sportId' }),
    discoveryTemplate('goal', 10, {
      type: 'single_choice',
      target: 'goalId',
      options: [{ id: 'g1', label: 'Resistenza', value: 'g1' }],
    }),
    discoveryTemplate('injury', 20, {
      type: 'boolean',
      options: [
        { id: 'yes', label: 'Sì', value: true },
        { id: 'no', label: 'No', value: false },
      ],
    }),
    discoveryTemplate('injury_detail', 30, {
      type: 'single_choice',
      options: [{ id: 'knee', label: 'Ginocchio', value: 'knee' }],
      visibleWhen: {
        match: 'all',
        rules: [{ question: 'injury', operator: 'in', values: [true] }],
      },
    }),
    discoveryTemplate(
      'weight',
      40,
      { type: 'number', min: 30, max: 250, contextKey: 'general_weight_kg' },
      { inputType: 'NUMBER' },
    ),
    discoveryTemplate(
      'archived',
      50,
      { type: 'single_choice', options: [{ id: 'a', label: 'A', value: 'a' }] },
      { isActive: false },
    ),
  ];
}

/**
 * Prisma in memoria per i soli template onboarding. $transaction ripristina lo
 * stato se il callback fallisce, come un ROLLBACK.
 */
export function discoveryTemplatesPrisma(initial: FakeTemplate[]) {
  let rows = initial.map((t) => ({ ...t }));
  const where = (w: Partial<FakeTemplate> = {}) =>
    rows.filter((r) =>
      Object.entries(w).every(
        ([key, value]) => r[key as keyof FakeTemplate] === value,
      ),
    );
  const onboardingQuestionTemplate = {
    findMany: ({ where: w }: { where?: Partial<FakeTemplate> } = {}) =>
      Promise.resolve(
        where(w)
          .sort((a, b) => a.orderIndex - b.orderIndex || (a.id < b.id ? -1 : 1))
          .map((r) => ({ ...r })),
      ),
    findFirst: ({ where: w }: { where: Partial<FakeTemplate> }) =>
      Promise.resolve(where(w)[0] ?? null),
    findUnique: ({ where: w }: { where: Partial<FakeTemplate> }) =>
      Promise.resolve(where(w)[0] ?? null),
    aggregate: ({ where: w }: { where: Partial<FakeTemplate> }) =>
      Promise.resolve({
        _max: {
          orderIndex: where(w).length
            ? Math.max(...where(w).map((r) => r.orderIndex))
            : null,
        },
      }),
    create: ({ data }: { data: Partial<FakeTemplate> }) => {
      const row = {
        ...discoveryTemplate(String(data.key), 0, {}),
        ...data,
        id: String(data.key),
      } as FakeTemplate;
      rows.push(row);
      return Promise.resolve({ ...row });
    },
    update: ({
      where: w,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeTemplate>;
    }) => {
      const row = rows.find((r) => r.id === w.id);
      if (!row) return Promise.reject(new Error('Record not found'));
      Object.assign(row, data);
      return Promise.resolve({ ...row });
    },
    delete: ({ where: w }: { where: { id: string } }) => {
      rows = rows.filter((r) => r.id !== w.id);
      return Promise.resolve({ id: w.id });
    },
  };
  const prisma = {
    onboardingQuestionTemplate,
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      const snapshot = rows.map((r) => ({ ...r }));
      try {
        return await callback(prisma);
      } catch (error) {
        rows = snapshot;
        throw error;
      }
    },
  };
  return {
    prisma: prisma as unknown as PrismaService,
    rows: () => rows,
    reset: (next: FakeTemplate[]) => {
      rows = next.map((t) => ({ ...t }));
    },
  };
}
