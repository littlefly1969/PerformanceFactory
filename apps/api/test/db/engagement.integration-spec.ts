import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { DiscoveryModule } from '../../src/discovery/discovery.module';
import { CalibrationService } from '../../src/discovery/calibration/calibration.service';
import { EngagementModule } from '../../src/engagement/engagement.module';
import {
  EngagementService,
  pendingWakeup,
} from '../../src/engagement/engagement.service';
import { recordMeaningfulInteraction } from '../../src/engagement/meaningful-interaction';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

const AREAS = ['pf4-driver-0', 'pf4-driver-1'];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Dormienza a 10 giorni e risveglio (PF-FS-PREPAYWALL §8): lo stato dipende
 * solo dall'ultima interazione significativa, ogni transizione produce un
 * solo evento e il ritorno riprende dal profilo esistente. AT-21..24.
 */
describe('Engagement and 10-day dormancy with PostgreSQL', () => {
  let prisma: PrismaService;
  let engagement: EngagementService;
  let calibration: CalibrationService;
  const users: string[] = [];
  const originalUrl = process.env.DATABASE_URL;

  const user = async (
    data: { role?: UserRole; isActive?: boolean; createdAt?: Date } = {},
  ) => {
    const created = await prisma.user.create({
      data: {
        email: `engagement-${randomUUID()}@example.test`,
        password: 'x',
        role: data.role ?? UserRole.USER,
        isActive: data.isActive ?? true,
        ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      },
    });
    users.push(created.id);
    return created.id;
  };

  /** Atleta con l'ultima interazione significativa `idleMs` fa. */
  const idle = async (idleMs: number, now: Date) => {
    const id = await user();
    await prisma.userEngagement.create({
      data: {
        userId: id,
        lastMeaningfulAt: new Date(now.getTime() - idleMs),
        stateChangedAt: new Date(now.getTime() - idleMs),
      },
    });
    return id;
  };

  const state = (userId: string) =>
    prisma.userEngagement.findUniqueOrThrow({ where: { userId } });
  const events = async (userId: string) =>
    (
      await prisma.analyticsEvent.findMany({
        where: { userId },
        orderBy: { receivedAt: 'asc' },
        select: { name: true },
      })
    ).map((e) => e.name);

  /** Atleta in calibrazione, valutato una volta, sotto la regola. */
  const calibrating = async () => {
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
        EngagementModule,
        ThrottlerModule.forRoot([{ name: 'default', limit: 100, ttl: 60000 }]),
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    await module.init();
    prisma = module.get(PrismaService);
    engagement = module.get(EngagementService);
    calibration = module.get(CalibrationService);
  });

  afterAll(async () => {
    // Engagement ed eventi seguono l'atleta.
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    process.env.DATABASE_URL = originalUrl;
    await prisma.$disconnect();
  });

  it('AT-21: eight idle days make the athlete sleepy, not dormant', async () => {
    const now = new Date();
    const recent = await idle(7 * DAY_MS, now);
    const sleepy = await idle(8 * DAY_MS, now);
    await engagement.classify(now);
    expect((await state(recent)).state).toBe('ACTIVE_RECENT');
    expect((await state(sleepy)).state).toBe('SLEEPY');
    expect(await events(sleepy)).toEqual(['user_became_sleepy']);
    expect(await pendingWakeup(prisma, sleepy)).toBe(false);
  });

  it('AT-22: exactly ten idle days start one in-app wake-up, once', async () => {
    const now = new Date();
    const almost = await idle(10 * DAY_MS - 1000, now);
    const dormant = await idle(10 * DAY_MS, now);
    // Due controlli, anche concorrenti, sullo stesso istante.
    await Promise.all([engagement.classify(now), engagement.classify(now)]);
    expect((await state(almost)).state).toBe('SLEEPY');
    expect(await state(dormant)).toMatchObject({
      state: 'DORMANT',
      wakeupSentAt: now,
    });
    // Nessun duplicato al controllo successivo, nessun passaggio per SLEEPY.
    expect(await events(dormant)).toEqual([
      'user_became_dormant',
      'wakeup_sent',
    ]);
    const sent = await prisma.analyticsEvent.findFirstOrThrow({
      where: { userId: dormant, name: 'wakeup_sent' },
    });
    expect(sent.properties).toEqual({ channel: 'IN_APP' });
    expect(await pendingWakeup(prisma, dormant)).toBe(true);
  });

  it('enrols athletes from their registration, never admins or disabled accounts', async () => {
    const now = new Date();
    const registered = await user({
      createdAt: new Date(now.getTime() - 11 * DAY_MS),
    });
    const admin = await user({
      role: UserRole.ADMIN,
      createdAt: new Date(now.getTime() - 11 * DAY_MS),
    });
    const disabled = await user({
      isActive: false,
      createdAt: new Date(now.getTime() - 11 * DAY_MS),
    });
    await engagement.classify(now);
    expect((await state(registered)).state).toBe('DORMANT');
    for (const id of [admin, disabled])
      expect(
        await prisma.userEngagement.findUnique({ where: { userId: id } }),
      ).toBeNull();
  });

  it('AT-23: a useful answer reactivates a dormant athlete on their existing profile', async () => {
    const id = await calibrating();
    const now = new Date();
    await prisma.userEngagement.create({
      data: {
        userId: id,
        state: 'DORMANT',
        lastMeaningfulAt: new Date(now.getTime() - 12 * DAY_MS),
        wakeupSentAt: new Date(now.getTime() - 2 * DAY_MS),
      },
    });
    await calibration.openRound(id);
    const round = await prisma.calibrationRound.findFirstOrThrow({
      where: { userId: id, status: 'OPEN' },
    });
    const questions = round.questionsJson as {
      id: string;
      options: { value: string }[];
    }[];
    await calibration.answerRound(
      id,
      round.id,
      Object.fromEntries(questions.map((q) => [q.id, q.options[0].value])),
    );
    const after = await state(id);
    expect(after.state).toBe('REACTIVATED');
    expect(after.reactivatedAt).not.toBeNull();
    expect(after.lastMeaningfulAt.getTime()).toBeGreaterThan(now.getTime());
    expect(await pendingWakeup(prisma, id)).toBe(false);
    expect(await events(id)).toEqual(
      expect.arrayContaining(['meaningful_interaction', 'user_reactivated']),
    );
    // Il profilo riprende dalla valutazione precedente, non da zero.
    expect(
      await prisma.assessmentEvaluation.findMany({
        where: { userId: id },
        orderBy: { sequence: 'asc' },
        select: { sequence: true },
      }),
    ).toEqual([{ sequence: 1 }, { sequence: 2 }]);
  });

  it('AT-24: opening the journey or refreshing never resets inactivity', async () => {
    const id = await calibrating();
    const now = new Date();
    const last = new Date(now.getTime() - 11 * DAY_MS);
    await prisma.userEngagement.create({
      data: { userId: id, state: 'DORMANT', lastMeaningfulAt: last },
    });
    await calibration.view(id);
    await calibration.view(id);
    await engagement.classify(now);
    expect(await state(id)).toMatchObject({
      state: 'DORMANT',
      lastMeaningfulAt: last,
    });
    expect(await events(id)).toEqual([]);
  });

  it('reactivates once when two useful answers race', async () => {
    const now = new Date();
    const id = await idle(12 * DAY_MS, now);
    await prisma.userEngagement.update({
      where: { userId: id },
      data: { state: 'DORMANT' },
    });
    await Promise.all(
      [0, 1].map(() =>
        prisma.$transaction((tx) =>
          recordMeaningfulInteraction(tx, id, 'CALIBRATION_ROUND'),
        ),
      ),
    );
    const names = await events(id);
    expect(names.filter((n) => n === 'user_reactivated')).toHaveLength(1);
    expect(names.filter((n) => n === 'meaningful_interaction')).toHaveLength(2);
    // Da sonnolente torna attivo senza contare come riattivazione.
    const sleepy = await idle(8 * DAY_MS, now);
    await engagement.classify(now);
    await recordMeaningfulInteraction(prisma, sleepy, 'ASSESSMENT_ANSWER');
    expect((await state(sleepy)).state).toBe('ACTIVE_RECENT');
    expect(await events(sleepy)).toEqual([
      'user_became_sleepy',
      'meaningful_interaction',
    ]);
  });
});
