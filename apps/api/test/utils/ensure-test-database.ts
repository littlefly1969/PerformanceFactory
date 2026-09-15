import { PrismaClient } from '@prisma/client';
import {
  getMaintenanceDatabaseUrl,
  getTestDatabaseName,
} from './db-test-guard';

export async function ensureTestDatabaseExists(databaseUrl: string) {
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
