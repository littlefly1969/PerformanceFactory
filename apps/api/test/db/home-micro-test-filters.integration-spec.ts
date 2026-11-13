import { Test } from '@nestjs/testing';
import { BadGatewayException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { DiscoveryModule } from '../../src/discovery/discovery.module';
import { CalibrationService } from '../../src/discovery/calibration/calibration.service';
import { HomeMicroTestService } from '../../src/discovery/calibration/home-micro-test';
import {
  SLOT_STALE_MS,
  romeDay,
} from '../../src/discovery/calibration/home-micro-test-prepare';
import { FeatureFlagsService } from '../../src/features/feature-flags.service';
import { AiProposalProviderService } from '../../src/ai-orchestrator/proposal-provider.service';
import { MicroTestInput } from '../../src/ai-orchestrator/micro-test-generation';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

const AREAS = ['pf4-driver-0', 'pf4-driver-1'];
const DAY_MS = 24 * 60 * 60 * 1000;

type Question = {
  id: string;
  options: { value: string }[];
  microTest: {
    id: string;
    setting?: string | null;
    steps?: string[];
    timerSeconds?: number | null;
    question?: string;
    situation?: unknown;
  };
};

/**
 * Micro-test della home per filtro (demo V10): Teorici, Pratici sul campo e
 * fuori dal campo, ciascuno con il suo test e al massimo `microTestsPerDay`
 * al giorno, anche con richieste concorrenti.
 */
describe('Home micro-test filters with PostgreSQL', () => {
  let prisma: PrismaService;
  let calibration: CalibrationService;
  let home: HomeMicroTestService;
  let ai: AiProposalProviderService;
  let testSpy: jest.SpiedFunction<
    AiProposalProviderService['generateMicroTests']
  >;
  let generate: AiProposalProviderService['generateMicroTests'];
  const tests: MicroTestInput[] = [];
  const users: string[] = [];
  const originalUrl = process.env.DATABASE_URL;

  const user = async (role: UserRole = UserRole.USER) => {
    const created = await prisma.user.create({
      data: {
        email: `micro-filter-${randomUUID()}@example.test`,
        password: 'x',
        role,
      },
    });
    users.push(created.id);
    return created.id;
  };

  /** Atleta in calibrazione con una valutazione, consenso AI compreso. */
  const athlete = async () => {
    const id = await user();
    await prisma.athleteDiscovery.create({
      data: {
        userId: id,
        version: 1n,
        draft: { answers: {} },
        configuration: { questions: [] },
        phase: 'ASSESSMENT',
        assessmentAnswers: {},
      },
    });
    await prisma.assessmentEvaluation.create({
      data: {
        userId: id,
        sequence: 1,
        summary: 's',
        overallConfidence: 30,
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
          create: AREAS.map((areaId) => ({
            areaId,
            score: 50,
            confidence: 30,
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

  const filterState = async (id: string, filter: string, now?: Date) =>
    (await home.view(id, now)).filters.find((f) => f.filter === filter)!;

  const slots = (userId: string, filter?: string) =>
    prisma.microTestSlot.findMany({
      where: { userId, ...(filter ? { filter } : {}) },
    });

  /** L'AI risponde dopo un po': le richieste concorrenti si sovrappongono. */
  const slowAi = (ms: number) =>
    testSpy.mockImplementation(async (input) => {
      tests.push(input);
      await new Promise((r) => setTimeout(r, ms));
      return generate(input);
    });

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
        DiscoveryModule,
        ThrottlerModule.forRoot([{ name: 'default', limit: 100, ttl: 60000 }]),
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    await module.init();
    prisma = module.get(PrismaService);
    calibration = module.get(CalibrationService);
    home = module.get(HomeMicroTestService);
    ai = module.get(AiProposalProviderService);
    generate = ai.generateMicroTests.bind(ai);
    testSpy = jest.spyOn(ai, 'generateMicroTests');
    const adminId = await user(UserRole.ADMIN);
    await module
      .get(FeatureFlagsService)
      .update('free_lesson', { enabled: false }, adminId);
  });

  beforeEach(() => {
    testSpy.mockImplementation((input) => {
      tests.push(input);
      return generate(input);
    });
  });

  afterEach(() => testSpy.mockReset());

  afterAll(async () => {
    await prisma.featureFlagChange.deleteMany({
      where: { actorId: { in: users } },
    });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    process.env.DATABASE_URL = originalUrl;
    await prisma.$disconnect();
  });

  it('prepares one test per filter: game situations for theory, steps and timer for practice', async () => {
    const id = await athlete();
    const empty = await home.view(id);
    expect(empty.filters.map((f) => [f.filter, f.status])).toEqual([
      ['THEORY', 'PREPARING'],
      ['ON_COURT', 'PREPARING'],
      ['OFF_COURT', 'PREPARING'],
    ]);
    expect(empty).toMatchObject({ limit: 2, status: 'PREPARING' });

    await home.prepare(id, 'THEORY');
    expect(tests.at(-1)).toMatchObject({ filter: 'THEORY' });
    await home.prepare(id, 'OFF_COURT');
    expect(tests.at(-1)).toMatchObject({ filter: 'OFF_COURT' });
    const view = await home.prepare(id, 'ON_COURT');
    expect(tests.at(-1)).toMatchObject({ filter: 'ON_COURT' });

    const [theory, onCourt, offCourt] = view.filters;
    expect(theory).toMatchObject({
      status: 'READY',
      usedToday: 1,
      test: { filter: 'THEORY', format: 'SITUATIONAL' },
    });
    expect(onCourt.test).toMatchObject({
      filter: 'ON_COURT',
      format: 'PRACTICAL',
    });
    expect(offCourt.test).toMatchObject({
      filter: 'OFF_COURT',
      format: 'PRACTICAL',
    });
    // Il riepilogo per la home è il primo pronto.
    expect(view).toMatchObject({ status: 'READY', test: { filter: 'THEORY' } });

    // Il pratico mostra luogo, passaggi, timer e domanda; il teorico no.
    const practical = offCourt.test!.round.questions[0].microTest!;
    expect(practical).toMatchObject({
      format: 'PRACTICAL',
      setting: 'OFF_COURT',
      timerSeconds: 45,
      question: 'Com’è andata?',
    });
    expect(practical).toHaveProperty(
      'steps',
      expect.arrayContaining([expect.any(String)]),
    );
    expect(theory.test!.round.questions[0].microTest).not.toHaveProperty(
      'steps',
    );

    // Il test su misura conserva forma, luogo, passaggi e timer.
    const round = await prisma.calibrationRound.findUniqueOrThrow({
      where: { id: offCourt.test!.roundId },
    });
    const [question] = round.questionsJson as Question[];
    expect(
      await prisma.microTest.findUniqueOrThrow({
        where: { id: question.microTest.id },
      }),
    ).toMatchObject({
      format: 'PRACTICAL',
      setting: 'OFF_COURT',
      timerSeconds: 45,
      steps: expect.arrayContaining([expect.any(String)]) as string[],
    });
    // Un posto del giorno per filtro, legato al suo round.
    const taken = await slots(id);
    expect(taken).toHaveLength(3);
    expect(taken.every((s) => s.status === 'READY' && s.roundId)).toBe(true);
    expect(new Set(taken.map((s) => s.day))).toEqual(
      new Set([romeDay(new Date())]),
    );
    const events = await prisma.analyticsEvent.findMany({
      where: { userId: id, name: 'ai_micro_test_presented' },
    });
    expect(
      events.map((e) => (e.properties as { filter: string }).filter).sort(),
    ).toEqual(['OFF_COURT', 'ON_COURT', 'THEORY']);
  });

  it('allows two tests per filter per Italian day, skipped ones included, then the next day again', async () => {
    const id = await athlete();
    const now = new Date();
    for (let n = 1; n <= 2; n++) {
      const view = await home.prepare(id, 'ON_COURT');
      const state = view.filters.find((f) => f.filter === 'ON_COURT')!;
      expect(state).toMatchObject({ status: 'READY', usedToday: n });
      await calibration.skipMicroTest(id, state.test!.roundId);
    }
    const calls = testSpy.mock.calls.length;
    await home.prepare(id, 'ON_COURT');
    // Limite raggiunto: nessuna chiamata AI, nessun test, nessun posto.
    expect(testSpy.mock.calls.length).toBe(calls);
    expect(await filterState(id, 'ON_COURT')).toMatchObject({
      status: 'DONE_TODAY',
      usedToday: 2,
      limit: 2,
      test: null,
    });
    expect(await slots(id, 'ON_COURT')).toHaveLength(2);
    // Gli altri filtri hanno i loro posti.
    expect(await filterState(id, 'OFF_COURT')).toMatchObject({
      status: 'PREPARING',
      usedToday: 0,
    });
    await home.prepare(id, 'OFF_COURT');
    expect(await filterState(id, 'OFF_COURT')).toMatchObject({
      status: 'READY',
    });

    // Il limite è del back office.
    await prisma.calibrationConfig.update({
      where: { id: 'default' },
      data: { microTestsPerDay: 3 },
    });
    try {
      expect(await filterState(id, 'ON_COURT')).toMatchObject({
        status: 'PREPARING',
        usedToday: 2,
        limit: 3,
      });
    } finally {
      await prisma.calibrationConfig.update({
        where: { id: 'default' },
        data: { microTestsPerDay: 2 },
      });
    }

    // Il giorno dopo (in Italia) il filtro riparte.
    const tomorrow = new Date(now.getTime() + DAY_MS);
    expect(await filterState(id, 'ON_COURT', tomorrow)).toMatchObject({
      status: 'PREPARING',
      usedToday: 0,
    });
    await calibration.prepareMicroTest(id, 'ON_COURT', tomorrow);
    expect(await filterState(id, 'ON_COURT', tomorrow)).toMatchObject({
      status: 'READY',
      usedToday: 1,
    });
  });

  it('prepares a single test when many requests for the same filter arrive together', async () => {
    const id = await athlete();
    slowAi(150);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => home.prepare(id, 'THEORY')),
    );
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(tests.filter((t) => t.filter === 'THEORY').length).toBeGreaterThan(
      0,
    );
    expect(testSpy).toHaveBeenCalledTimes(1);
    expect(
      await prisma.calibrationRound.count({
        where: { userId: id, action: 'PROPOSE_MICRO_TEST' },
      }),
    ).toBe(1);
    expect(await slots(id)).toHaveLength(1);
    expect(await filterState(id, 'THEORY')).toMatchObject({ status: 'READY' });
  });

  it('never exceeds the daily limit when the athlete races through tests in parallel', async () => {
    const id = await athlete();
    slowAi(30);
    // Ogni «giro» prepara il test del filtro e lo salta subito: senza limite
    // ne nascerebbero otto.
    const lap = async () => {
      const view = await home.prepare(id, 'OFF_COURT');
      const test = view.filters.find((f) => f.filter === 'OFF_COURT')!.test;
      if (test)
        await calibration
          .skipMicroTest(id, test.roundId)
          .catch(() => undefined);
    };
    for (let wave = 0; wave < 4; wave++)
      await Promise.allSettled([lap(), lap(), lap(), lap()]);
    expect(await slots(id, 'OFF_COURT')).toHaveLength(2);
    expect(
      await prisma.calibrationRound.count({
        where: { userId: id, action: 'PROPOSE_MICRO_TEST' },
      }),
    ).toBe(2);
    expect(testSpy).toHaveBeenCalledTimes(2);
    expect(await filterState(id, 'OFF_COURT')).toMatchObject({
      status: 'DONE_TODAY',
    });
  });

  it('migration: counts the micro-tests proposed earlier today, before the deploy', async () => {
    const id = await athlete();
    const now = new Date();
    let sequence = 0;
    /** Round storico del micro-test, come lo salvava il codice prima dei filtri. */
    const legacy = (
      microTest: Record<string, unknown>,
      status: string,
      createdAt = now,
    ) =>
      prisma.calibrationRound.create({
        data: {
          userId: id,
          sequence: ++sequence,
          status,
          action: 'PROPOSE_MICRO_TEST',
          targetAreas: [AREAS[0]],
          provider: 'stub',
          model: 'stub',
          promptHash: 'h',
          createdAt,
          questionsJson: [
            {
              id: 't1',
              areaId: AREAS[0],
              text: 'Prova storica',
              options: [
                { value: 'o1', label: 'Poco', score: 20 },
                { value: 'o2', label: 'Molto', score: 80 },
              ],
              microTest: {
                instructions: 'Istruzioni.',
                durationMinutes: 5,
                safetyNotes: '',
                title: 'Prova storica',
                ...microTest,
              },
            },
          ] as Prisma.InputJsonValue,
        },
      });
    const situation = { situation: { index: 0, total: 1, label: 'Fondo' } };
    const theory = [
      await legacy(situation, 'SKIPPED', new Date(now.getTime() - 1000)),
      await legacy(situation, 'EVALUATED'),
    ];
    const practical = await legacy({}, 'OPEN');
    const offCourt = await legacy({ setting: 'OFF_COURT' }, 'SKIPPED');
    // Ieri non conta: il limite è del giorno.
    await legacy(situation, 'SKIPPED', new Date(now.getTime() - 2 * DAY_MS));

    // Il blocco di backfill della migrazione, eseguito sui dati storici (due volte: è idempotente).
    const sql = readFileSync(
      resolve(
        __dirname,
        '../../prisma/migrations/20261113190000_micro_test_filtri/migration.sql',
      ),
      'utf8',
    );
    const backfill = sql.slice(sql.indexOf('-- BACKFILL-MICRO-TEST-SLOTS'));
    await prisma.$executeRawUnsafe(backfill);
    await prisma.$executeRawUnsafe(backfill);

    const taken = await slots(id);
    expect(
      taken
        .map((s) => [s.roundId, s.filter, s.slot, s.status, s.day])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual(
      [
        [theory[0].id, 'THEORY', 1, 'READY', romeDay(now)],
        [theory[1].id, 'THEORY', 2, 'READY', romeDay(now)],
        [practical.id, 'ON_COURT', 1, 'READY', romeDay(now)],
        [offCourt.id, 'OFF_COURT', 1, 'READY', romeDay(now)],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
    // Teorici: due già proposti oggi, quindi niente AI fino a domani.
    const calls = testSpy.mock.calls.length;
    await home.prepare(id, 'THEORY');
    expect(testSpy.mock.calls.length).toBe(calls);
    const view = await home.view(id);
    expect(view.filters.map((f) => [f.filter, f.status, f.usedToday])).toEqual([
      ['THEORY', 'DONE_TODAY', 2],
      ['ON_COURT', 'READY', 1],
      ['OFF_COURT', 'PREPARING', 1],
    ]);
    // Fuori dal campo resta un posto, poi basta.
    await home.prepare(id, 'OFF_COURT');
    expect(testSpy.mock.calls.length).toBe(calls + 1);
    expect(await filterState(id, 'OFF_COURT')).toMatchObject({
      status: 'READY',
      usedToday: 2,
    });
    expect((await slots(id, 'OFF_COURT')).map((s) => s.slot).sort()).toEqual([
      1, 2,
    ]);
  });

  it('keeps the limit in the database: the same slot cannot be taken twice', async () => {
    const id = await athlete();
    const slot = {
      userId: id,
      day: romeDay(new Date()),
      filter: 'THEORY',
      slot: 1,
      claimedAt: new Date(),
    };
    await prisma.microTestSlot.create({ data: slot });
    await expect(prisma.microTestSlot.create({ data: slot })).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );
    await expect(
      prisma.microTestSlot.create({ data: { ...slot, slot: 2, filter: 'X' } }),
    ).rejects.toThrow();
  });

  it('frees the slot when the AI fails, and takes over a preparation that stalled', async () => {
    const id = await athlete();
    testSpy.mockRejectedValueOnce(
      new BadGatewayException({ code: 'INVALID_MICRO_TESTS' }),
    );
    await expect(home.prepare(id, 'ON_COURT')).rejects.toThrow(
      BadGatewayException,
    );
    // Il tentativo fallito non consuma un posto del giorno.
    expect(await slots(id)).toHaveLength(0);
    expect(await filterState(id, 'ON_COURT')).toMatchObject({
      status: 'PREPARING',
      usedToday: 0,
    });

    // Una preparazione ancora in corso blocca le altre richieste...
    const stalled = await prisma.microTestSlot.create({
      data: {
        userId: id,
        day: romeDay(new Date()),
        filter: 'ON_COURT',
        slot: 1,
        token: 'other',
        claimedAt: new Date(),
      },
    });
    const calls = testSpy.mock.calls.length;
    await home.prepare(id, 'ON_COURT');
    expect(testSpy.mock.calls.length).toBe(calls);
    // ...ma una ferma da troppo tempo si riprende, senza superare il limite.
    await prisma.microTestSlot.update({
      where: { id: stalled.id },
      data: { claimedAt: new Date(Date.now() - SLOT_STALE_MS - 1000) },
    });
    await home.prepare(id, 'ON_COURT');
    expect(testSpy.mock.calls.length).toBe(calls + 1);
    const taken = await slots(id, 'ON_COURT');
    expect(taken).toHaveLength(1);
    expect(taken[0]).toMatchObject({ status: 'READY', slot: 1 });
    expect(taken[0].id).not.toBe(stalled.id);
  });

  it('does not save a test whose slot was taken over while the AI was writing it', async () => {
    const id = await athlete();
    testSpy.mockImplementationOnce(async (input) => {
      // Mentre l'AI scrive, la preparazione risulta ferma e un'altra la riprende.
      await prisma.microTestSlot.updateMany({
        where: { userId: id },
        data: { token: 'taken-over' },
      });
      return generate(input);
    });
    await home.prepare(id, 'THEORY');
    expect(
      await prisma.calibrationRound.count({
        where: { userId: id, action: 'PROPOSE_MICRO_TEST' },
      }),
    ).toBe(0);
    // Il posto resta a chi l'ha ripreso.
    expect(await slots(id)).toMatchObject([
      { status: 'PREPARING', token: 'taken-over' },
    ]);
  });
});
