import { BadRequestException, Logger } from '@nestjs/common';
import { AiMonitoringService } from './ai-monitoring.service';
import { AiDiagnosticsSettingsService } from './ai-diagnostics-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { aiFetch } from '../common/ai-fetch';
import {
  recordAiError,
  recordAiValidationFailure,
} from '../common/ai-telemetry';
import { withAiBusinessContext } from '../common/ai-diagnostic-context';
import { validateTrainingSchedule } from '../ai-orchestrator/training-schedule';
import {
  diagnosticHeaders,
  redactAiText,
  redactAiValue,
} from '../common/ai-diagnostic-redaction';

function fixture(enabled = true) {
  const db = {
    aiOperationLog: {
      create: jest
        .fn<Promise<unknown>, [{ data: Record<string, unknown> }]>()
        .mockResolvedValue({}),
      update: jest
        .fn<
          Promise<unknown>,
          [{ where: unknown; data: Record<string, unknown> }]
        >()
        .mockResolvedValue({}),
    },
    aiHttpAttempt: {
      create: jest
        .fn<Promise<unknown>, [{ data: Record<string, unknown> }]>()
        .mockResolvedValue({}),
      update: jest
        .fn<
          Promise<unknown>,
          [{ where: unknown; data: Record<string, unknown> }]
        >()
        .mockResolvedValue({}),
    },
    aiDiagnosticEvent: {
      create: jest
        .fn<Promise<unknown>, [{ data: Record<string, unknown> }]>()
        .mockResolvedValue({}),
    },
  };
  const controls = { snapshot: () => enabled };
  return {
    db,
    service: new AiMonitoringService(
      db as unknown as PrismaService,
      controls as AiDiagnosticsSettingsService,
    ),
  };
}
describe('complete administrator AI diagnostics', () => {
  const env = { ...process.env };
  const originalFetch = global.fetch;
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'real-secret-api-key';
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => {
    process.env = { ...env };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('preserves full wire text, athlete data, schema, errors and process ID after HTTP 200, removing only credentials', async () => {
    const { db, service } = fixture();
    const body = JSON.stringify({
      output_text: '{"sessionsPerWeek": 2, "planItems": [}',
      patient: 'Mario, fastidio ginocchio',
      apiKey: process.env.OPENAI_API_KEY,
    });
    global.fetch = jest.fn().mockResolvedValue(
      new Response(body, {
        headers: {
          'x-request-id': 'provider-request-42',
          'set-cookie': 'session=secret-cookie',
        },
      }),
    );
    await expect(
      withAiBusinessContext('lifecycle-95', 'TRAINING_LIFECYCLE', () =>
        service.run(
          'training_proposal',
          async () => {
            const response = await aiFetch(
              'https://ai.test?key=real-secret-api-key&mode=json',
              {
                method: 'POST',
                headers: {
                  Authorization: 'Bearer real-secret-api-key',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  prompt: 'Mario, 42 anni, fastidio ginocchio',
                  schema: { required: ['planItems'] },
                }),
              },
              { provider: 'openai', model: 'test-model' },
            );
            const payload = (await response.json()) as { output_text: string };
            try {
              JSON.parse(payload.output_text);
            } catch (e) {
              recordAiError(e, 'PARSE');
            }
            recordAiValidationFailure(['planItems non conforme'], {
              path: '$.planItems',
              expected: 'array',
            });
            throw new BadRequestException({
              code: 'INVALID_AI_OUTPUT',
              message: 'Output training non JSON',
            });
          },
          { athlete: { name: 'Mario', health: 'fastidio ginocchio' } },
        ),
      ),
    ).rejects.toThrow('Output training non JSON');
    expect(await service.flush()).toBe(true);
    expect(db.aiOperationLog.create.mock.calls[0][0].data).toMatchObject({
      diagnosticsEnabled: true,
      contextId: 'lifecycle-95',
      invocationInput: expect.stringContaining('fastidio ginocchio'),
    });
    const request = db.aiHttpAttempt.create.mock.calls[0][0].data.request as {
      body: string;
      headers: Record<string, string>;
      url: string;
    };
    expect(request.body).toContain('Mario, 42 anni');
    expect(request.body).toContain('schema');
    const response = db.aiHttpAttempt.update.mock.calls[0][0].data.response as {
      body: string;
      headers: Record<string, string>;
    };
    expect(response.body).toContain('Mario, fastidio ginocchio');
    expect(response.body).toContain('[}'); // The invalid JSON string remains invalid and inspectable.
    expect(response.headers['x-request-id']).toBe('provider-request-42');
    expect(
      db.aiDiagnosticEvent.create.mock.calls.map(([arg]) => arg.data.phase),
    ).toEqual(['PARSE', 'VALIDATION', 'ERROR']);
    const final = db.aiOperationLog.update.mock.calls.at(-1)![0].data;
    expect(final).toMatchObject({
      status: 'ERROR',
      errorCode: 'INVALID_AI_OUTPUT',
    });
    expect(JSON.stringify(final.errorDetail)).toContain(
      'Output training non JSON',
    );
    const calls = JSON.stringify([
      db.aiOperationLog.create.mock.calls,
      db.aiOperationLog.update.mock.calls,
      db.aiHttpAttempt.create.mock.calls,
      db.aiHttpAttempt.update.mock.calls,
      db.aiDiagnosticEvent.create.mock.calls,
    ]);
    expect(calls).not.toMatch(/real-secret-api-key|secret-cookie/);
  });

  it('keeps every rejected attempt, full large responses and later success', async () => {
    const { db, service } = fixture();
    const large = 'risposta completa '.repeat(12000);
    global.fetch = jest
      .fn()
      .mockImplementation(() => Promise.resolve(new Response(large)));
    await service.run('initial_questions', async () => {
      await (
        await aiFetch(
          'https://ai.test',
          { body: 'first prompt' },
          { provider: 'gemini' },
        )
      ).text();
      recordAiValidationFailure(['Prima risposta non conforme']);
      await (
        await aiFetch(
          'https://ai.test',
          { body: 'second prompt' },
          { provider: 'gemini' },
        )
      ).text();
      return { provider: 'gemini', result: 'accepted' };
    });
    await service.flush();
    expect(db.aiHttpAttempt.update).toHaveBeenCalledTimes(2);
    for (const [arg] of db.aiHttpAttempt.update.mock.calls)
      expect((arg.data.response as { body: string }).body).toBe(large);
    expect(
      db.aiOperationLog.update.mock.calls.at(-1)![0].data.invocationOutput,
    ).toContain('accepted');
    expect(db.aiDiagnosticEvent.create.mock.calls[0][0].data).toMatchObject({
      attemptSequence: 1,
      phase: 'VALIDATION',
    });
  });

  it('does not capture bodies, inputs, outputs or errors when diagnostics are disabled', async () => {
    const { db, service } = fixture(false);
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('private response'));
    await service.run(
      'potential',
      async () => {
        await aiFetch(
          'https://ai.test',
          { body: 'private prompt' },
          { provider: 'openai' },
        );
        return { private: 'result' };
      },
      { private: 'input' },
    );
    await service.flush();
    expect(db.aiHttpAttempt.update).not.toHaveBeenCalled();
    expect(db.aiDiagnosticEvent.create).not.toHaveBeenCalled();
    const calls = JSON.stringify([
      db.aiOperationLog.create.mock.calls,
      db.aiOperationLog.update.mock.calls,
      db.aiHttpAttempt.create.mock.calls,
    ]);
    expect(calls).not.toMatch(
      /private prompt|private response|private.*result|private.*input/,
    );
  });

  it('records the exact schedule violation, session path, received value and constraints', async () => {
    const { db, service } = fixture();
    await expect(
      service.run('training_proposal', () =>
        Promise.resolve(
          validateTrainingSchedule(
            {
              sessionsPerWeek: 2,
              planItems: [
                {
                  type: 'TRAINING',
                  title: 'Test',
                  body: 'Test',
                  dayOffset: 0,
                  durationMinutes: 120,
                },
              ],
            },
            {
              operationalWindowDays: 14,
              currentFrequency: { min: 2, max: 3 },
              availability: { daysPerWeek: 3, sessionDurationMinutes: 60 },
              prescription: { minSessionsPerWeek: 2, maxSessionsPerWeek: 3 },
            },
            '2026-11-06',
          ),
        ),
      ),
    ).rejects.toThrow('durata oltre la disponibilità');
    await service.flush();
    const events = JSON.stringify(db.aiDiagnosticEvent.create.mock.calls);
    expect(events).toContain('$.planItems[0].durationMinutes');
    expect(events).toContain('120');
    expect(events).toContain('60');
  });

  it('attaches a downstream process error to the invocation after it returned', async () => {
    const { db, service } = fixture();
    await withAiBusinessContext('process-1', 'TRAINING', async () => {
      await service.run('training_proposal', () =>
        Promise.resolve({ result: 'generated' }),
      );
      recordAiError(new Error('Precise downstream failure'), 'BUSINESS', {
        stage: 'PUBLICATION',
      });
    });
    await service.flush();
    expect(JSON.stringify(db.aiDiagnosticEvent.create.mock.calls)).toContain(
      'Precise downstream failure',
    );
    expect(db.aiOperationLog.update.mock.calls.at(-1)![0].data).toMatchObject({
      status: 'ERROR',
      errorCode: 'BUSINESS_PROCESS_FAILED',
    });
  });

  it('does not wait for an unread diagnostics body or a stalled diagnostics database', async () => {
    const { db, service } = fixture();
    db.aiOperationLog.create.mockReturnValue(new Promise(() => {}));
    let stream: ReadableStreamDefaultController | undefined;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          stream = controller;
        },
      }),
    );
    global.fetch = jest.fn().mockResolvedValue(response);
    await expect(
      service.run('prompt_test', () =>
        aiFetch('https://ai.test', {}, { provider: 'openai' }),
      ),
    ).resolves.toBe(response);
    expect(await service.flush(1)).toBe(false);
    stream?.close();
  });
});

describe('credential-only redaction', () => {
  it('keeps application IDs, names, health, token usage and malformed formatting', () => {
    const text =
      '{\n "name": "Mario", "userId": "athlete-1", "health": "dolore", "total_tokens": 123, "password": "private", broken';
    expect(redactAiText(text)).toBe(
      '{\n "name": "Mario", "userId": "athlete-1", "health": "dolore", "total_tokens": 123, "password": "[CREDENTIAL REDACTED]", broken',
    );
    expect(
      redactAiValue({
        name: 'Mario',
        credentials: { password: 'private' },
        totalTokens: 100,
      }),
    ).toEqual({
      name: 'Mario',
      credentials: '[CREDENTIAL REDACTED]',
      totalTokens: 100,
    });
    expect(
      diagnosticHeaders({
        Authorization: 'Bearer private',
        'x-goog-api-key': 'private',
        'x-request-id': '42',
      }),
    ).toEqual({
      authorization: '[CREDENTIAL REDACTED]',
      'x-goog-api-key': '[CREDENTIAL REDACTED]',
      'x-request-id': '42',
    });
  });
});
