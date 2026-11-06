import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AiMonitoringService } from '../../src/ai-monitoring/ai-monitoring.service';
import { AiDiagnosticsSettingsService } from '../../src/ai-monitoring/ai-diagnostics-settings.service';
import { AiLogsService } from '../../src/ai-monitoring/ai-logs.service';
import { AiLogsQueryDto } from '../../src/ai-monitoring/ai-logs-query.dto';
import { withAiBusinessContext } from '../../src/common/ai-diagnostic-context';
import { recordAiValidationFailure } from '../../src/common/ai-telemetry';
import { aiFetch } from '../../src/common/ai-fetch';

describe('complete AI diagnostics persistence', () => {
  let db: PrismaClient;
  let control: {
    enabled: boolean;
    updatedAt: Date;
    updatedById: string | null;
  } | null;
  const prefix = randomUUID();
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
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
    control = await db.aiDiagnosticControl.findUnique({
      where: { id: 'global' },
    });
  }, 60000);
  afterAll(async () => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (!db) return;
    await db.aiOperationLog.deleteMany({ where: { contextId: prefix } });
    await db.aiDiagnosticControlChange.deleteMany({
      where: { actorId: prefix },
    });
    if (control)
      await db.aiDiagnosticControl.upsert({
        where: { id: 'global' },
        create: { id: 'global', ...control },
        update: control,
      });
    else await db.aiDiagnosticControl.deleteMany({ where: { id: 'global' } });
    await db.$disconnect();
  });

  it('stores full exchanges and precise validation, excludes payloads from list pages and cascades deletion', async () => {
    const settings = new AiDiagnosticsSettingsService(db as PrismaService);
    await settings.update(true, prefix);
    const state = await settings.read();
    expect(state.enabled).toBe(true);
    expect(state.changes[0].actorId).toBe(prefix);
    const monitoring = new AiMonitoringService(db as PrismaService, settings);
    process.env.OPENAI_API_KEY = `${prefix}-secret`;
    const request = JSON.stringify({
      prompt: 'Mario, anamnesi completa e dati di collaudo',
      schema: { required: ['planItems'] },
    });
    const response =
      '{\n"planItems": [{"durationMinutes": 120}], "notes": "Mario, dolore al ginocchio"\n}';
    global.fetch = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(response, { headers: { 'x-request-id': prefix } }),
        ),
      );
    await expect(
      withAiBusinessContext(prefix, 'TRAINING', () =>
        monitoring.run(
          'training_proposal',
          async () => {
            const received = await aiFetch(
              'https://ai.test',
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
                body: request,
              },
              { provider: 'openai' },
            );
            await received.json();
            recordAiValidationFailure(['durata oltre la disponibilità'], {
              path: '$.planItems[0].durationMinutes',
              received: 120,
              expected: 60,
            });
            throw new BadRequestException({
              code: 'INVALID_AI_OUTPUT',
              message:
                'Calendario AI non valido: durata oltre la disponibilità',
            });
          },
          { userId: prefix, health: 'dolore al ginocchio' },
        ),
      ),
    ).rejects.toThrow('durata oltre la disponibilità');
    expect(await monitoring.flush()).toBe(true);
    const logs = new AiLogsService(db as PrismaService);
    const summary = await logs.list(
      Object.assign(new AiLogsQueryDto(), { id: prefix, diagnostics: 'true' }),
    );
    expect(summary.total).toBe(1);
    expect(summary.rows[0].contextId).toBe(prefix);
    expect(summary.rows[0]).not.toHaveProperty('invocationInput');
    expect(summary.rows[0]).not.toHaveProperty('errorDetail');
    const detail = await logs.detail(summary.rows[0].id);
    expect(detail.status).toBe('ERROR');
    expect(detail.errorCode).toBe('INVALID_AI_OUTPUT');
    expect(detail.invocationInput).toContain('dolore al ginocchio');
    expect(detail.attempts[0].request).toMatchObject({
      body: request,
      headers: { authorization: '[CREDENTIAL REDACTED]' },
    });
    expect(detail.attempts[0].response).toMatchObject({
      body: response,
      headers: { 'x-request-id': prefix },
    });
    expect(detail.attempts[0].captureState).toBe('CAPTURED');
    expect(JSON.stringify(detail.events)).toContain(
      '$.planItems[0].durationMinutes',
    );
    expect(JSON.stringify(detail)).not.toContain(`${prefix}-secret`);
    await db.aiOperationLog.delete({ where: { id: detail.id } });
    expect(
      await db.aiDiagnosticEvent.count({ where: { operationId: detail.id } }),
    ).toBe(0);
    expect(
      await db.aiHttpAttempt.count({ where: { operationId: detail.id } }),
    ).toBe(0);
    await settings.update(false, prefix);
    await withAiBusinessContext(prefix, 'TRAINING', () =>
      monitoring.run(
        'training_proposal',
        () => Promise.resolve({ private: 'result' }),
        { private: 'input' },
      ),
    );
    await monitoring.flush();
    const basic = await db.aiOperationLog.findFirstOrThrow({
      where: { contextId: prefix },
    });
    expect(basic.diagnosticsEnabled).toBe(false);
    expect(basic.invocationInput).toBeNull();
    expect(basic.invocationOutput).toBeNull();
  });
});
