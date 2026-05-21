import { PrismaClient } from '@prisma/client';
import {
  getMaintenanceDatabaseUrl,
  getRequiredTestDatabaseUrl,
  getTestDatabaseName,
} from '../utils/db-test-guard';

describe('Prisma real database integration', () => {
  let prisma: PrismaClient | undefined;

  beforeAll(async () => {
    const databaseUrl = getRequiredTestDatabaseUrl();
    await ensureTestDatabaseExists(databaseUrl);
    prisma = new PrismaClient({
      datasources: {
        db: { url: databaseUrl },
      },
    });
    await prisma.$connect();
  });

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
});

async function ensureTestDatabaseExists(databaseUrl: string) {
  const databaseName = getTestDatabaseName(databaseUrl);
  const admin = new PrismaClient({
    datasources: {
      db: { url: getMaintenanceDatabaseUrl(databaseUrl) },
    },
  });

  try {
    const rows = await admin.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(
        SELECT 1 FROM pg_database WHERE datname = ${databaseName}
      ) AS "exists"
    `;

    if (!rows[0]?.exists) {
      await admin.$executeRawUnsafe(
        `CREATE DATABASE ${quotePostgresIdentifier(databaseName)}`,
      );
    }
  } finally {
    await admin.$disconnect();
  }
}

function quotePostgresIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}
