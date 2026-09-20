import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AthleteModule } from '../../src/athlete/athlete.module';
import { AthleteService } from '../../src/athlete/athlete.service';
import { AnswersService } from '../../src/answers/answers.service';
import { OrchestratorService } from '../../src/ai-orchestrator/orchestrator.service';
import { signAccessToken } from '../../src/common/auth-token';
import {
  REQUIRED_CONSENTS,
  consentDocumentHash,
} from '../../src/consents/consent-texts';
import { publishTrainingPlan } from '../../src/ai-orchestrator/training-publication';
import {
  assertTrainingCycleFinished,
  athleteDate,
  createTrainingSessions,
} from '../../src/athlete/training-sessions';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

describe('PF4 athlete calendar with real PostgreSQL and authenticated HTTP', () => {
  let app: NestFastifyApplication,
    prisma: PrismaService,
    service: AthleteService;
  let userId: string,
    foreignId: string,
    releaseId: string,
    sportId: string,
    questionSetId: string;
  let headers: { authorization: string },
    foreignHeaders: { authorization: string };
  const originalUrl = process.env.DATABASE_URL;
  beforeAll(async () => {
    process.env.DATABASE_URL = getRequiredTestDatabaseUrl();
    await ensureTestDatabaseExists(process.env.DATABASE_URL);
    execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
      cwd: resolve(__dirname, '../..'),
      env: process.env,
      stdio: 'pipe',
    });
    const module = await Test.createTestingModule({
      imports: [PrismaModule, AthleteModule],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    service = app.get(AthleteService);
    const users = await Promise.all(
      [0, 1].map(() =>
        prisma.user.create({
          data: {
            email: `calendar-${randomUUID()}@test.local`,
            password: 'unused',
            role: 'USER',
            firstName: 'Ada',
          },
        }),
      ),
    );
    [userId, foreignId] = users.map((u) => u.id);
    headers = {
      authorization: `Bearer ${signAccessToken(users[0]).accessToken}`,
    };
    foreignHeaders = {
      authorization: `Bearer ${signAccessToken(users[1]).accessToken}`,
    };
    for (const user of users)
      for (const c of REQUIRED_CONSENTS)
        await prisma.consent.create({
          data: {
            userId: user.id,
            type: c.type,
            version: c.version,
            documentHash: consentDocumentHash(c),
          },
        });
    const sport = await prisma.sport.create({
      data: {
        key: `calendar-${randomUUID()}`,
        label: 'Padel test',
        specializations: { create: { key: 'STANDARD', label: 'Standard' } },
      },
      include: { specializations: true },
    });
    sportId = sport.id;
    const release = await prisma.trainingPlanRelease.create({
      data: {
        userId,
        version: 1,
        specializationId: sport.specializations[0].id,
        summaryText: 'Un ciclo reale',
        outputJson: {},
        provider: 'test',
        model: 'test',
        promptVersion: '1',
        promptHash: 'test',
        items: {
          create: [0, 1, 2].map((i) => ({
            id: `${3 - i}-${randomUUID()}`,
            orderIndex: i,
            title: `Sessione ${i + 1}`,
            type: 'EXERCISE',
            body: `Istruzioni ${i + 1}`,
            status: 'APPROVED',
          })),
        },
        questionSets: {
          create: {
            userId,
            specializationId: sport.specializations[0].id,
            type: 'TRAINING',
            questions: {
              create: {
                text: 'Come è andata?',
                orderIndex: 1,
                options: { create: { label: 'Bene', score: 75 } },
              },
            },
            approvals: { create: { coachId: foreignId, status: 'APPROVED' } },
          },
        },
      },
      include: { questionSets: true },
    });
    releaseId = release.id;
    questionSetId = release.questionSets[0].id;
  }, 60000);
  afterAll(async () => {
    if (prisma) {
      await prisma.trainingUserAnswer.deleteMany({ where: { userId } });
      await prisma.trainingPlanRelease.deleteMany({ where: { userId } });
      await prisma.performanceProfileSnapshotArea.deleteMany({
        where: { snapshot: { userId } },
      });
      await prisma.performanceProfileSnapshot.deleteMany({ where: { userId } });
      await prisma.consent.deleteMany({
        where: { userId: { in: [userId, foreignId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [userId, foreignId] } },
      });
      if (sportId) await prisma.sport.delete({ where: { id: sportId } });
    }
    await app?.close();
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });
  it('shows preparation without fabricated sessions before publication', async () => {
    const home = await service.home(userId);
    expect(home.primaryAction.type).toBe('PREPARING');
    expect(home.week.sessions).toEqual([]);
    expect(home.performance).toBeNull();
  });
  it('publishes idempotently under concurrent retries, preserving generator order', async () => {
    await Promise.all([
      publishTrainingPlan(prisma, releaseId, foreignId),
      publishTrainingPlan(prisma, releaseId, foreignId),
    ]);
    const sessions = await prisma.trainingSession.findMany({
      where: { userId },
      orderBy: { sequence: 'asc' },
      include: { trainingPlanItem: true },
    });
    expect(sessions).toHaveLength(3);
    expect(sessions.map((s) => s.trainingPlanItem.title)).toEqual([
      'Sessione 1',
      'Sessione 2',
      'Sessione 3',
    ]);
    expect(sessions[0].scheduledDate.toISOString().slice(0, 10)).toBe(
      athleteDate(),
    );
    expect(
      (sessions[2].scheduledDate.getTime() -
        sessions[0].scheduledDate.getTime()) /
        86400000,
    ).toBe(4);
    expect((await service.home(userId)).primaryAction.type).toBe(
      'TRAINING_SESSION',
    );
    expect(await service.checkIn(userId)).toBeNull();
    await expect(assertTrainingCycleFinished(prisma, userId)).rejects.toThrow();
  });
  it('bounds queries, validates ratings, and enforces ownership and authentication', async () => {
    const session = await prisma.trainingSession.findFirstOrThrow({
      where: { userId },
    });
    for (const query of [
      'from=2026-02-30&to=2026-03-01',
      'from=2026-01-01&to=2026-12-31',
      'from=2026-09-20&to=2026-09-19',
      '',
    ]) {
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/athlete/training/calendar?${query}`,
            headers,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (await app.inject({ method: 'GET', url: '/api/athlete/home' }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/athlete/training/sessions/${session.id}`,
          headers: foreignHeaders,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/athlete/training/sessions/${session.id}/complete`,
          headers,
          payload: { completionRating: 6 },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/athlete/training/sessions/${session.id}/skip`,
          headers: foreignHeaders,
        })
      ).statusCode,
    ).toBe(404);
    const calendar = await service.calendar(
      foreignId,
      '2026-09-01',
      '2026-09-30',
    );
    expect(calendar.sessions).toEqual([]);
  });
  it('prioritizes today, then the next date; overdue work is not silently skipped', async () => {
    const sessions = await prisma.trainingSession.findMany({
      where: { userId },
      orderBy: { sequence: 'asc' },
    });
    try {
      const future = new Date(sessions[0].scheduledDate.getTime() + 86400000);
      await prisma.trainingSession.update({
        where: { id: sessions[0].id },
        data: { scheduledDate: future },
      });
      const next = (await service.home(userId)).primaryAction;
      expect(next.type).toBe('TRAINING_SESSION');
      expect('session' in next && next.session?.date).toBe(
        future.toISOString().slice(0, 10),
      );
      await prisma.trainingSession.updateMany({
        where: { userId },
        data: { scheduledDate: new Date('2020-01-01T00:00:00Z') },
      });
      expect((await service.home(userId)).primaryAction.type).toBe('NONE');
      expect(
        (await service.session(userId, sessions[0].id)).displayStatus,
      ).toBe('MISSED');
      expect(await service.checkIn(userId)).toBeNull();
    } finally {
      for (const session of sessions)
        await prisma.trainingSession.update({
          where: { id: session.id },
          data: { scheduledDate: session.scheduledDate },
        });
    }
  });
  it('aggregates stored performance and returns real snapshot history', async () => {
    const area = await prisma.area.findFirstOrThrow();
    for (const rankingGlobal of [48, 62])
      await prisma.performanceProfileSnapshot.create({
        data: {
          userId,
          rankingGlobal,
          reason: 'test',
          createdAt: new Date(
            `2026-09-${rankingGlobal === 48 ? '18' : '19'}T00:00:00Z`,
          ),
          areas: {
            create: { areaId: area.id, realR: rankingGlobal, potentialP: 78 },
          },
        },
      });
    const progress = await service.progress(userId);
    expect(progress.current).toMatchObject({
      current: 62,
      potential: 78,
      gap: 16,
    });
    expect(progress.history.map((s) => s.current)).toEqual([62, 48]);
    expect((await service.home(userId)).performance).toEqual(progress.current);
    expect((await service.progress(foreignId)).history).toEqual([]);
  });
  it('atomically completes and skips, then exposes the existing check-in', async () => {
    const sessions = await prisma.trainingSession.findMany({
      where: { userId },
      orderBy: { sequence: 'asc' },
    });
    const answers = new AnswersService(prisma, {} as OrchestratorService);
    const q = await prisma.trainingQuestion.findFirstOrThrow({
      where: { trainingQuestionSetId: questionSetId },
      include: { options: true },
    });
    const input = {
      questionSetId,
      answers: [{ questionId: q.id, answerOptionId: q.options[0].id }],
    };
    await expect(
      answers.submitTrainingBatch({ id: userId, role: 'USER' }, input),
    ).rejects.toThrow('sessioni');
    const response = await app.inject({
      method: 'POST',
      url: `/api/athlete/training/sessions/${sessions[0].id}/complete`,
      headers,
      payload: { completionRating: 4, completionNotes: 'Buone sensazioni' },
    });
    expect(response.statusCode).toBe(200);
    await service.finish(userId, sessions[0].id, 'COMPLETED', {
      completionRating: 1,
    }); // Retry cannot overwrite.
    const item = await prisma.trainingPlanItem.findUniqueOrThrow({
      where: { id: sessions[0].trainingPlanItemId },
    });
    const session = await service.session(userId, sessions[0].id);
    expect(item.status).toBe('COMPLETED');
    expect(item.completionRating).toBe(4);
    expect(session.completedAt).toEqual(item.completedAt);
    expect(session.completionNotes).toBe('Buone sensazioni');
    await expect(
      service.finish(userId, sessions[0].id, 'SKIPPED'),
    ).rejects.toThrow();
    const race = await Promise.allSettled([
      service.finish(userId, sessions[1].id, 'COMPLETED'),
      service.finish(userId, sessions[1].id, 'SKIPPED'),
    ]);
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const raced = await prisma.trainingSession.findUniqueOrThrow({
      where: { id: sessions[1].id },
      include: { trainingPlanItem: true },
    });
    expect(raced.status).toBe(raced.trainingPlanItem.status);
    await service.finish(userId, sessions[2].id, 'SKIPPED');
    const skipped = await service.session(userId, sessions[2].id);
    expect(skipped.skippedAt).not.toBeNull();
    expect(skipped.displayStatus).toBe('SKIPPED');
    expect((await service.home(userId)).primaryAction.type).toBe('CHECK_IN');
    await expect(assertTrainingCycleFinished(prisma, userId)).rejects.toThrow();
    await answers.submitTrainingBatch({ id: userId, role: 'USER' }, input);
    await expect(
      answers.submitTrainingBatch({ id: userId, role: 'USER' }, input),
    ).rejects.toThrow();
    expect(await service.checkIn(userId)).toBeNull();
    await expect(
      assertTrainingCycleFinished(prisma, userId),
    ).resolves.toBeUndefined();
    await prisma.$transaction((tx) =>
      createTrainingSessions(tx, releaseId, new Date()),
    );
    expect(await prisma.trainingSession.count({ where: { userId } })).toBe(3);
    expect(
      (await service.session(userId, sessions[0].id)).completionRating,
    ).toBe(4);
  });
  it('rolls back session writes when source-item transition cannot be made', async () => {
    const session = await prisma.trainingSession.findFirstOrThrow({
      where: { userId, status: 'SKIPPED' },
    });
    await prisma.trainingSession.update({
      where: { id: session.id },
      data: { status: 'SCHEDULED', skippedAt: null },
    });
    await expect(
      service.finish(userId, session.id, 'COMPLETED'),
    ).rejects.toThrow();
    expect((await service.session(userId, session.id)).status).toBe(
      'SCHEDULED',
    );
  });
  it('backfills an existing published release in original output order and preserves completions', async () => {
    const rollback = new Error('rollback isolated migration schema');
    await expect(
      prisma.$transaction(async (tx) => {
        const schema = `pf4_migration_${randomUUID().replaceAll('-', '')}`;
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        await tx.$executeRawUnsafe(
          'CREATE TABLE "User" ("id" TEXT PRIMARY KEY)',
        );
        await tx.$executeRawUnsafe(
          `CREATE TABLE "TrainingPlanRelease" ("id" TEXT PRIMARY KEY, "userId" TEXT, "status" TEXT, "publishedAt" TIMESTAMP, "createdAt" TIMESTAMP, "outputJson" JSONB)`,
        );
        await tx.$executeRawUnsafe(
          `CREATE TABLE "TrainingPlanItem" ("id" TEXT PRIMARY KEY, "trainingPlanReleaseId" TEXT, "title" TEXT, "body" TEXT, "status" TEXT, "completedAt" TIMESTAMP, "completionNotes" TEXT, "completionRating" INTEGER)`,
        );
        await tx.$executeRawUnsafe(`INSERT INTO "User" VALUES ('athlete')`);
        await tx.$executeRawUnsafe(
          `INSERT INTO "TrainingPlanRelease" VALUES ('plan', 'athlete', 'ACTIVE', '2026-09-19 22:30:00', '2026-09-19', '{"planItems":[{"title":"First","body":"A"},{"title":"Second","body":"B"}]}')`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "TrainingPlanItem" VALUES ('z-first','plan','First','A','COMPLETED','2026-09-20','Saved',4), ('a-second','plan','Second','B','ACTIVE',NULL,NULL,NULL)`,
        );
        const sql = readFileSync(
          resolve(
            __dirname,
            '../../prisma/migrations/20260919120000_training_sessions/migration.sql',
          ),
          'utf8',
        );
        for (const statement of sql.split(';').filter((s) => s.trim()))
          await tx.$executeRawUnsafe(statement);
        const rows = await tx.$queryRawUnsafe<
          Array<{
            trainingPlanItemId: string;
            status: string;
            sequence: number;
            completionRating: number | null;
            date: string;
          }>
        >(
          `SELECT "trainingPlanItemId", "status", "sequence", "completionRating", "scheduledDate"::text AS date FROM "TrainingSession" ORDER BY "sequence"`,
        );
        expect(rows).toEqual([
          {
            trainingPlanItemId: 'z-first',
            status: 'COMPLETED',
            sequence: 1,
            completionRating: 4,
            date: '2026-09-20',
          },
          {
            trainingPlanItemId: 'a-second',
            status: 'SCHEDULED',
            sequence: 2,
            completionRating: null,
            date: '2026-09-23',
          },
        ]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
