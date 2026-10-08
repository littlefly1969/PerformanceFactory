import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FreeLessonsModule } from '../../src/free-lessons/free-lessons.module';
import { FreeLessonService } from '../../src/free-lessons/free-lesson.service';
import { FreeLessonAdminService } from '../../src/free-lessons/free-lesson-admin.service';
import { MicroTestGenerationService } from '../../src/free-lessons/micro-test-generation.service';
import { MICRO_TEST_GENERATION } from '../../src/free-lessons/free-lesson-rules';
import { FeatureFlagsService } from '../../src/features/feature-flags.service';
import { AiProposalProviderService } from '../../src/ai-orchestrator/proposal-provider.service';
import { MicroTestInput } from '../../src/ai-orchestrator/micro-test-generation';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

const AREAS = ['pf4-driver-0', 'pf4-driver-1'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Micro-test scritti dall'AI per l'atleta: una chiamata per lotto, catalogo come riserva. */
describe('AI micro-tests with PostgreSQL', () => {
  let prisma: PrismaService;
  let athletes: FreeLessonService;
  let admin: FreeLessonAdminService;
  let generation: MicroTestGenerationService;
  let flags: FeatureFlagsService;
  let ai: AiProposalProviderService;
  let generateSpy: jest.SpyInstance;
  let adminId: string;
  let catalogId: string;
  const inputs: MicroTestInput[] = [];
  const users: string[] = [];
  const originalUrl = process.env.DATABASE_URL;

  const user = async (role: UserRole = UserRole.USER) => {
    const created = await prisma.user.create({
      data: {
        email: `micro-test-${randomUUID()}@example.test`,
        password: 'x',
        role,
        firstName: 'Riservato',
        lastName: role,
      },
    });
    users.push(created.id);
    return created.id;
  };

  /** Atleta in calibrazione, valutato una volta con la confidence data per driver. */
  const athlete = async (confidences: number[]) => {
    const id = await user();
    const answers: Record<string, string> = {};
    for (const [i, areaId] of AREAS.entries()) {
      const q = await prisma.userOnboardingQuestion.create({
        data: {
          userId: id,
          areaId,
          text: `Domanda ${i}`,
          orderIndex: i,
          optionsJson: [
            { value: '1', label: 'Poco', score: 30 },
            { value: '2', label: 'Molto', score: 70 },
          ],
          provider: 'configuration',
          model: 'test',
          promptVersion: 'test',
          promptHash: 'test',
          inputJson: {},
        },
      });
      answers[q.id] = '2';
    }
    await prisma.athleteDiscovery.create({
      data: {
        userId: id,
        version: 1n,
        draft: { answers: {} },
        configuration: { questions: [] },
        phase: 'ASSESSMENT',
        assessmentAnswers: answers,
      },
    });
    await prisma.assessmentEvaluation.create({
      data: {
        userId: id,
        sequence: 1,
        summary: 's',
        overallConfidence: 50,
        level: 'INTERMEDIATE',
        levelConfidence: 60,
        minScore: 0,
        maxScore: 100,
        provider: 'stub',
        model: 'stub',
        promptHash: 'h',
        inputJson: {},
        outputJson: {},
        areas: {
          create: AREAS.map((areaId, i) => ({
            areaId,
            score: 50,
            confidence: confidences[i],
            rationale: 'r',
            evidenceGaps: ['Manca una prova pratica.'],
          })),
        },
      },
    });
    const now = new Date();
    await prisma.athleteCalibration.create({
      data: {
        userId: id,
        status: 'FREE_CALIBRATING',
        startedAt: now,
        deadlineAt: new Date(now.getTime() + 30 * DAY_MS),
      },
    });
    return id;
  };

  const batch = (userId: string) =>
    prisma.microTestGeneration.findFirstOrThrow({ where: { userId } });

  beforeAll(async () => {
    process.env.AI_PROVIDER = 'stub';
    process.env.DATABASE_URL = getRequiredTestDatabaseUrl();
    await ensureTestDatabaseExists(process.env.DATABASE_URL);
    execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
      cwd: resolve(__dirname, '../..'),
      env: process.env,
      stdio: 'pipe',
    });
    const module = await Test.createTestingModule({
      imports: [
        PrismaModule,
        FreeLessonsModule,
        ThrottlerModule.forRoot([{ name: 'default', limit: 100, ttl: 60000 }]),
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    await module.init();
    prisma = module.get(PrismaService);
    athletes = module.get(FreeLessonService);
    admin = module.get(FreeLessonAdminService);
    generation = module.get(MicroTestGenerationService);
    flags = module.get(FeatureFlagsService);
    ai = module.get(AiProposalProviderService);
    const original = ai.generateMicroTests.bind(ai);
    // Una chiamata lenta: le richieste parallele arrivano mentre è in corso.
    generateSpy = jest
      .spyOn(ai, 'generateMicroTests')
      .mockImplementation(async (input) => {
        inputs.push(input);
        await new Promise((r) => setTimeout(r, 50));
        return original(input);
      });
    adminId = await user(UserRole.ADMIN);
    for (const key of ['free_lesson', 'ai_micro_tests'] as const)
      await flags.update(key, { enabled: true, rolloutPercent: 100 }, adminId);
    await prisma.freeLessonConfig.deleteMany();
    catalogId = (
      await admin.createMicroTest({
        areaId: AREAS[1],
        title: 'Catalogo: bandeja',
        instructions: 'Dieci bandeje: quante finiscono in campo?',
        options: [
          { value: 'low', label: 'Meno di 5', score: 30 },
          { value: 'high', label: '5 o più', score: 70 },
        ],
      })
    ).id;
  });

  afterAll(async () => {
    for (const key of ['free_lesson', 'ai_micro_tests'] as const)
      await flags.update(key, { enabled: false }, adminId);
    await prisma.featureFlagChange.deleteMany({
      where: { actorId: { in: users } },
    });
    await prisma.freeLessonConfig.deleteMany();
    await prisma.microTest.deleteMany({ where: { id: catalogId } });
    // Lotti e test su misura seguono l'atleta.
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    process.env.DATABASE_URL = originalUrl;
    await prisma.$disconnect();
  });

  it('calls the AI once for parallel requests and shows the tailored tests before the catalog', async () => {
    const id = await athlete([40, 20]);
    const before = await athletes.view(id);
    expect(before.enabled && before.generateMicroTests).toBe(true);
    expect(before.enabled && before.microTests.map((t) => t.id)).toEqual([
      catalogId,
    ]);

    const calls = inputs.length;
    await Promise.all(
      Array.from({ length: 5 }, () => athletes.generateMicroTests(id)),
    );
    expect(inputs.length - calls).toBe(1);
    const done = await batch(id);
    expect(done).toMatchObject({ status: 'READY', attempts: 1, token: null });
    expect(done.promptVersionId).toBeTruthy();
    const personal = await prisma.microTest.findMany({
      where: { userId: id },
    });
    expect(personal.map((t) => t.areaId).sort()).toEqual([...AREAS].sort());

    // Storia dell'atleta, driver meno affidabile prima, nessun dato identificativo.
    const input = inputs.at(-1)!;
    expect(input.targets.map((t) => t.areaId)).toEqual([AREAS[1], AREAS[0]]);
    expect(input.targets[0].evidence[0].source).toBe('ASSESSMENT');
    expect(input.targets[0].evidenceGaps).toEqual(['Manca una prova pratica.']);
    expect(JSON.stringify(input)).not.toMatch(/example\.test|Riservato/);

    const after = await athletes.view(id);
    expect(after.enabled && after.generateMicroTests).toBe(false);
    expect(
      after.enabled && after.microTests.map((t) => [t.personal, t.areaName]),
    ).toEqual([
      [true, expect.any(String)],
      [true, expect.any(String)],
    ]);

    // Un test su misura vale solo per il suo atleta e non entra nel catalogo.
    const other = await athlete([40, 20]);
    await expect(
      athletes.completeMicroTest(other, personal[0].id, 'o1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await athletes.completeMicroTest(id, personal[0].id, 'o2');
    const overview = await admin.overview();
    expect(overview.microTests.map((t) => t.id)).not.toContain(personal[0].id);
    await expect(
      admin.setMicroTestActive(personal[1].id, false),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Un lotto pronto non si rifà per la stessa valutazione.
    await generation.generate(id);
    expect(inputs.length - calls).toBe(1);

    // Una nuova valutazione apre un nuovo lotto, che conosce i titoli già proposti.
    await prisma.assessmentEvaluation.create({
      data: {
        userId: id,
        sequence: 2,
        summary: 's',
        overallConfidence: 55,
        minScore: 0,
        maxScore: 100,
        provider: 'stub',
        model: 'stub',
        promptHash: 'h',
        inputJson: {},
        outputJson: {},
        areas: {
          create: AREAS.map((areaId) => ({
            areaId,
            score: 55,
            confidence: 45,
            rationale: 'r',
            evidenceGaps: [],
          })),
        },
      },
    });
    await generation.generate(id);
    expect(inputs.length - calls).toBe(2);
    expect(inputs.at(-1)!.proposedTitles).toEqual(
      expect.arrayContaining(personal.map((t) => t.title)),
    );
    expect(
      await prisma.microTestGeneration.count({ where: { userId: id } }),
    ).toBe(2);
  });

  it('keeps the catalog when the AI fails and retries only after the backoff', async () => {
    const id = await athlete([40, 20]);
    generateSpy.mockRejectedValueOnce(new Error('provider down'));
    const view = await athletes.generateMicroTests(id);
    expect(await batch(id)).toMatchObject({
      status: 'FAILED',
      attempts: 1,
      error: 'provider down',
    });
    expect(view.enabled && view.generateMicroTests).toBe(false);
    expect(view.enabled && view.microTests.map((t) => t.id)).toEqual([
      catalogId,
    ]);

    const later = new Date(Date.now() + MICRO_TEST_GENERATION.retryAfterMs + 1);
    expect(await generation.shouldGenerate(id, later)).toBe(true);
    await generation.generate(id, later);
    expect(await batch(id)).toMatchObject({ status: 'READY', attempts: 2 });
  });

  it('does nothing with the flag off: only the catalog', async () => {
    const id = await athlete([40, 20]);
    await flags.update('ai_micro_tests', { enabled: false }, adminId);
    try {
      const view = await athletes.generateMicroTests(id);
      expect(view.enabled && view.generateMicroTests).toBe(false);
      expect(
        await prisma.microTestGeneration.count({ where: { userId: id } }),
      ).toBe(0);
    } finally {
      await flags.update(
        'ai_micro_tests',
        { enabled: true, rolloutPercent: 100 },
        adminId,
      );
    }
  });
});
