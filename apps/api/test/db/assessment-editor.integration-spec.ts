import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  createAssessmentTemplate,
  deleteAssessmentTemplate,
  listAssessmentTemplates,
  reorderAssessmentTemplates,
  updateAssessmentTemplate,
} from '../../src/admin/admin-assessment';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

const options = [
  { value: 'a', label: 'Bene', score: 100 },
  { value: 'b', label: 'Male', score: 0 },
];

describe('Assessment editor with PostgreSQL', () => {
  let prisma: PrismaService;
  let sportId: string;
  let admin: string;
  const created: string[] = [];
  const env = {
    sport: process.env.PF4_SPORT_KEY,
    specialization: process.env.PF4_SPECIALIZATION_KEY,
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = getRequiredTestDatabaseUrl();
    await ensureTestDatabaseExists(process.env.DATABASE_URL);
    execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
      cwd: resolve(__dirname, '../..'),
      env: process.env,
      stdio: 'pipe',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    admin = (
      await prisma.user.create({
        data: {
          email: `assessment-admin-${randomUUID()}@example.com`,
          password: 'not-used',
          role: 'ADMIN',
        },
      })
    ).id;
    // Sport di test con i sei driver PF4 e una copia delle domande padel.
    const key = `assessment-test-${randomUUID()}`;
    const demo = await prisma.onboardingQuestionTemplate.findMany({
      where: { key: { startsWith: 'pf4_padel_assessment_' } },
    });
    const sport = await prisma.sport.create({
      data: {
        key,
        label: 'Assessment test',
        specializations: {
          create: {
            key: 'single',
            label: 'Singolo',
            prompts: {
              create: [...new Set(demo.map((q) => q.areaId!))].map(
                (areaId) => ({ areaId, basePrompt: 'Driver di test' }),
              ),
            },
          },
        },
      },
    });
    sportId = sport.id;
    process.env.PF4_SPORT_KEY = key;
    process.env.PF4_SPECIALIZATION_KEY = 'single';
    for (const q of demo)
      created.push(
        (
          await prisma.onboardingQuestionTemplate.create({
            data: {
              key: `test-${randomUUID()}`,
              scope: 'AREA',
              areaId: q.areaId,
              label: q.label,
              inputType: q.inputType,
              orderIndex: q.orderIndex,
              optionsJson: { ...(q.optionsJson as object), sportKey: key },
            },
          })
        ).id,
      );
  }, 60000);

  afterAll(async () => {
    if (!prisma) return;
    const sportKey = process.env.PF4_SPORT_KEY!;
    await prisma.onboardingQuestionTemplate.deleteMany({
      where: { optionsJson: { path: ['sportKey'], equals: sportKey } },
    });
    await prisma.sportSpecializationAreaPrompt.deleteMany({
      where: { specialization: { sportId } },
    });
    await prisma.sportSpecialization.deleteMany({ where: { sportId } });
    await prisma.sport.delete({ where: { id: sportId } });
    await prisma.user.delete({ where: { id: admin } });
    process.env.PF4_SPORT_KEY = env.sport;
    process.env.PF4_SPECIALIZATION_KEY = env.specialization;
    await prisma.$disconnect();
  });

  const nutrition = async () =>
    (await listAssessmentTemplates(prisma)).areas.find(
      (a) => a.name === 'Nutrizione',
    )!;

  it('shows locked operational questions, two questions per driver and journey counts', async () => {
    const list = await listAssessmentTemplates(prisma);
    expect(list.operational.map((q) => q.semanticRole)).toEqual([
      'TRAINING_AVAILABILITY_DAYS',
      'TRAINING_SESSION_DURATION',
    ]);
    expect(list.areas).toHaveLength(6);
    expect(list.areas.every((a) => a.templates.length === 2)).toBe(true);
    expect(list.stats).toEqual({
      fixedQuestionCount: 2,
      areaQuestionCount: 12,
      count: 14,
      estimatedMinutes: 5,
    });
    expect(list.problems).toEqual([]);
  });

  it('never edits or deletes an operational question', async () => {
    const [days] = (await listAssessmentTemplates(prisma)).operational;
    await expect(
      updateAssessmentTemplate(prisma, days.id, { label: 'Altro' }, admin),
    ).rejects.toThrow(/Domanda di sistema/);
    await expect(deleteAssessmentTemplate(prisma, days.id)).rejects.toThrow(
      /Domanda di sistema/,
    );
  });

  it('edits text, help and scored options of a driver question', async () => {
    const [question] = (await nutrition()).templates;
    const updated = await updateAssessmentTemplate(
      prisma,
      question.id,
      {
        label: 'Come ti alimenti prima della partita?',
        helpText: 'Onestà',
        options,
      },
      admin,
    );
    expect(updated).toMatchObject({
      label: 'Come ti alimenti prima della partita?',
      helpText: 'Onestà',
      options,
    });
    await expect(
      updateAssessmentTemplate(
        prisma,
        question.id,
        { options: [options[0], { ...options[1], value: 'a' }] },
        admin,
      ),
    ).rejects.toThrow(/valore univoco/);
  });

  it('allows from zero to four active questions per driver', async () => {
    const area = await nutrition();
    const [first, second] = area.templates;
    // Un driver può restare senza anamnesi: lo approfondisce la calibrazione.
    await updateAssessmentTemplate(
      prisma,
      first.id,
      { isActive: false },
      admin,
    );
    await deleteAssessmentTemplate(prisma, second.id);
    let list = await listAssessmentTemplates(prisma);
    expect(list.problems).toEqual([]);
    expect(list.stats.count).toBe(12);
    await updateAssessmentTemplate(prisma, first.id, { isActive: true }, admin);
    for (const label of ['Seconda', 'Terza', 'Quarta'])
      await createAssessmentTemplate(
        prisma,
        { areaId: area.id, label, options },
        admin,
      );
    await expect(
      createAssessmentTemplate(
        prisma,
        { areaId: area.id, label: 'Quinta', options },
        admin,
      ),
    ).rejects.toThrow('Il driver può avere al massimo 4 domande attive.');
    // Una bozza disattivata è ammessa ma non può diventare la quinta attiva.
    const draft = await createAssessmentTemplate(
      prisma,
      { areaId: area.id, label: 'Bozza', options, isActive: false },
      admin,
    );
    await expect(
      updateAssessmentTemplate(prisma, draft.id, { isActive: true }, admin),
    ).rejects.toThrow('Il driver può avere al massimo 4 domande attive.');
    list = await listAssessmentTemplates(prisma);
    expect(list.maxPerArea).toBe(4);
    expect(list.stats.count).toBe(16);
    expect(list.problems).toEqual([]);
  });

  it('never leaves the anamnesis without a driver question', async () => {
    const list = await listAssessmentTemplates(prisma);
    const active = list.areas.flatMap((a) =>
      a.templates.filter((t) => t.isActive),
    );
    const last = active.pop()!;
    for (const t of active)
      await updateAssessmentTemplate(prisma, t.id, { isActive: false }, admin);
    await expect(
      updateAssessmentTemplate(prisma, last.id, { isActive: false }, admin),
    ).rejects.toThrow(
      'L’anamnesi deve avere almeno una domanda di driver attiva.',
    );
    await expect(deleteAssessmentTemplate(prisma, last.id)).rejects.toThrow(
      'L’anamnesi deve avere almeno una domanda di driver attiva.',
    );
  });

  it('reorders questions inside a driver without moving the driver', async () => {
    const before = await listAssessmentTemplates(prisma);
    const area = before.areas.find((a) => a.name === 'Nutrizione')!;
    const ids = area.templates.map((t) => t.id).reverse();
    const after = await reorderAssessmentTemplates(prisma, area.id, ids, admin);
    expect(
      after.areas.find((a) => a.id === area.id)!.templates.map((t) => t.id),
    ).toEqual(ids);
    expect(after.areas.map((a) => a.id)).toEqual(before.areas.map((a) => a.id));
    await expect(
      reorderAssessmentTemplates(prisma, area.id, [ids[0]], admin),
    ).rejects.toThrow(/una sola volta/);
  });
});
