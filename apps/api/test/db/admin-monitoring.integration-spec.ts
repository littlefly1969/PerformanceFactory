import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RegistrationReportService } from '../../src/analytics/registration-report.service';
import { AiLogsService } from '../../src/ai-monitoring/ai-logs.service';
import { AiLogsQueryDto } from '../../src/ai-monitoring/ai-logs-query.dto';

describe('admin monitoring on PostgreSQL', () => {
  let db: PrismaClient;
  const prefix = randomUUID();
  const users: string[] = [];
  const logs: string[] = [];
  beforeAll(async () => {
    const url = getRequiredTestDatabaseUrl();
    await ensureTestDatabaseExists(url);
    execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.$connect();
  }, 60000);
  afterAll(async () => {
    if (!db) return;
    await db.analyticsEvent.deleteMany({
      where: {
        OR: [
          { anonymousId: { startsWith: prefix } },
          { userId: { in: users } },
        ],
      },
    });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.aiOperationLog.deleteMany({ where: { id: { in: logs } } });
    await db.$disconnect();
  });

  it('deduplicates starts, links completions by browser, ignores client completions, and uses Rome days', async () => {
    const [{ start }] = await db.$queryRaw<Array<{ start: Date }>>`
      SELECT (((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Rome')::date)::timestamp
        AT TIME ZONE 'Europe/Rome' AT TIME ZONE 'UTC') AS start`;
    const yesterday = new Date(start.getTime() - 86400000);
    const beforePeriod = new Date(start.getTime() - 10 * 86400000);
    const now = new Date();
    const service = new RegistrationReportService(db as PrismaService);
    const baseline = await service.report(3);
    for (let n = 0; n < 3; n++) {
      const u = await db.user.create({
        data: {
          email: `${prefix}-${n}@example.test`,
          password: 'unused',
          role: 'USER',
        },
      });
      users.push(u.id);
    }
    const event = (
      name: string,
      anonymous: string | null,
      occurredAt: Date,
      userId: string | null = null,
      origin = 'CLIENT',
    ) => ({
      name,
      anonymousId: anonymous ? `${prefix}-${anonymous}` : null,
      occurredAt,
      userId,
      origin,
    });
    await db.analyticsEvent.createMany({
      data: [
        event('registration_started', 'a', yesterday),
        event('registration_started', 'a', now),
        event('registration_started', 'a', now),
        // 00:15 Rome is still the previous UTC date.
        event(
          'registration_started',
          'b',
          new Date(yesterday.getTime() + 15 * 60000),
        ),
        event('registration_started', 'c', beforePeriod),
        event('registration_completed', 'a', now, users[0], 'SERVER'),
        event('registration_completed', 'a', now, users[0], 'SERVER'),
        event('registration_completed', 'c', now, users[1], 'SERVER'),
        event('registration_completed', null, now, users[2], 'SERVER'),
        event('registration_completed', 'b', now, users[0]),
        event(
          'registration_started',
          'future',
          new Date(now.getTime() + 86400000),
        ),
      ],
    });
    const result = await service.report(3);
    expect(result.daily).toHaveLength(3);
    expect(result.totals.started - baseline.totals.started).toBe(2);
    expect(result.totals.pending - baseline.totals.pending).toBe(1);
    expect(result.totals.completed - baseline.totals.completed).toBe(3);
    expect(result.daily[1].started - baseline.daily[1].started).toBe(2);
    expect(result.daily[1].pending - baseline.daily[1].pending).toBe(1);
    expect(result.daily[0].started - baseline.daily[0].started).toBe(0);
    expect(result.daily[0].completed - baseline.daily[0].completed).toBe(3);
    expect(result.daily[2]).toEqual(baseline.daily[2]);
  });

  it('paginates persistent logs, detects missing outcomes, and cascades attempt deletion', async () => {
    const operation = await db.aiOperationLog.create({
      data: {
        operation: 'initial_questions',
        provider: 'gemini',
        model: 'test-model',
        status: 'ERROR',
        errorCode: 'INVALID_OUTPUT',
        validationFailures: 1,
        attempts: {
          create: {
            sequence: 1,
            provider: 'gemini',
            status: 'SUCCESS',
            httpStatus: 200,
            durationMs: 50,
            startedAt: new Date(),
          },
        },
      },
    });
    logs.push(operation.id);
    const stale = await db.aiOperationLog.create({
      data: {
        operation: 'initial_questions',
        startedAt: new Date(Date.now() - 2 * 3600000),
      },
    });
    logs.push(stale.id);
    const expired = await db.aiOperationLog.create({
      data: {
        operation: 'potential',
        startedAt: new Date(Date.now() - 31 * 86400000),
      },
    });
    logs.push(expired.id);
    const service = new AiLogsService(db as PrismaService);
    const result = await service.list(
      Object.assign(new AiLogsQueryDto(), {
        id: operation.id,
        provider: 'gemini',
        status: 'ERROR',
        page: 999,
      }),
    );
    expect(result).toMatchObject({
      total: 1,
      page: 1,
      pages: 1,
      counts: { ERROR: 1 },
    });
    expect(result.rows[0]._count.attempts).toBe(1);
    expect((await service.detail(operation.id)).attempts[0].httpStatus).toBe(
      200,
    );
    const interrupted = await service.list(
      Object.assign(new AiLogsQueryDto(), {
        id: stale.id,
        status: 'INTERRUPTED',
      }),
    );
    expect(interrupted.rows[0].status).toBe('INTERRUPTED');
    expect(interrupted.counts).toMatchObject({ RUNNING: 0, INTERRUPTED: 1 });
    await expect(service.detail(expired.id)).rejects.toThrow('scaduto');
    await db.aiOperationLog.delete({ where: { id: operation.id } });
    expect(
      await db.aiHttpAttempt.count({ where: { operationId: operation.id } }),
    ).toBe(0);
  });
});
