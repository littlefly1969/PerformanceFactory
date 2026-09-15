import { ensureTestDatabaseExists } from '../utils/ensure-test-database';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';

describe('Prisma real database integration', () => {
  let prisma: PrismaClient | undefined;

  beforeAll(async () => {
    const databaseUrl = getRequiredTestDatabaseUrl();
    await ensureTestDatabaseExists(databaseUrl);
    execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({
      datasources: {
        db: { url: databaseUrl },
      },
    });
    await prisma.$connect();
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('connects to PostgreSQL and runs a simple query', async () => {
    if (!prisma) {
      throw new Error('Prisma client was not initialized');
    }

    const rows = await prisma.$queryRaw<Array<{ ok: number }>>`
      SELECT 1::int AS ok
    `;

    expect(rows).toEqual([{ ok: 1 }]);
  });

  it('applies every migration successfully', async () => {
    const migrations = await prisma!.$queryRaw<Array<{ unfinished: bigint }>>`
      SELECT COUNT(*)::bigint AS unfinished FROM "_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
    `;
    expect(migrations[0].unfinished).toBe(0n);
    expect(await prisma!.user.count()).toBeGreaterThanOrEqual(0);
  });

  it('persists related performance records atomically and rolls them back', async () => {
    const email = `integration-${randomUUID()}@example.test`;
    const rollback = new Error('intentional test rollback');
    await expect(
      prisma!.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email, password: 'unused-test-hash', role: 'USER' },
        });
        const area = await tx.area.create({
          data: { name: `Area ${randomUUID()}` },
        });
        const snapshot = await tx.performanceProfileSnapshot.create({
          data: {
            userId: user.id,
            rankingGlobal: 60,
            reason: 'integration',
            areas: { create: { areaId: area.id, realR: 60, potentialP: 80 } },
          },
          include: { areas: true, user: true },
        });
        expect(snapshot.user.email).toBe(email);
        expect(snapshot.areas).toEqual([
          expect.objectContaining({
            areaId: area.id,
            realR: 60,
            potentialP: 80,
          }),
        ]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(await prisma!.user.findUnique({ where: { email } })).toBeNull();
  });

  it('enforces unique user emails at the database boundary', async () => {
    const email = `duplicate-${randomUUID()}@example.test`;
    await expect(
      prisma!.$transaction(async (tx) => {
        const data = {
          email,
          password: 'unused-test-hash',
          role: 'USER' as const,
        };
        await tx.user.create({ data });
        await tx.user.create({ data });
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma!.user.findUnique({ where: { email } })).toBeNull();
  });

  it('rejects a snapshot without a real athlete', async () => {
    await expect(
      prisma!.performanceProfileSnapshot.create({
        data: {
          userId: randomUUID(),
          rankingGlobal: 0,
          reason: 'invalid relation',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});
