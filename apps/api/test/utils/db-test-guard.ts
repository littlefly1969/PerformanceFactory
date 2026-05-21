const SAFE_TEST_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
const FORBIDDEN_DATABASE_NAMES = new Set([
  'postgres',
  'template0',
  'template1',
  'performancefactory',
]);

export function getRequiredTestDatabaseUrl(env = process.env) {
  const databaseUrl = env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL is required for DB integration tests. Example: postgresql://postgres:postgres@localhost:5432/performancefactory_test',
    );
  }

  assertSafeTestDatabaseUrl(databaseUrl);
  return databaseUrl;
}

export function getTestDatabaseName(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
}

export function getMaintenanceDatabaseUrl(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  parsed.pathname = '/postgres';
  return parsed.toString();
}

export function assertSafeTestDatabaseUrl(databaseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }

  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    throw new Error('TEST_DATABASE_URL must use the PostgreSQL protocol');
  }

  if (!SAFE_TEST_HOSTS.has(parsed.hostname)) {
    throw new Error(
      'TEST_DATABASE_URL host must be localhost, 127.0.0.1, ::1, or postgres',
    );
  }

  const databaseName = getTestDatabaseName(databaseUrl);
  const normalizedName = databaseName.toLowerCase();
  if (!databaseName || FORBIDDEN_DATABASE_NAMES.has(normalizedName)) {
    throw new Error('TEST_DATABASE_URL must target a dedicated test database');
  }

  if (!normalizedName.includes('test')) {
    throw new Error('TEST_DATABASE_URL database name must include "test"');
  }
}
