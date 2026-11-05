import { BadGatewayException, Logger } from '@nestjs/common';
import {
  AiMonitoringService,
  AI_LOG_QUEUE_LIMIT,
} from './ai-monitoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { aiFetch } from '../common/ai-fetch';

function fixture() {
  const create = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
  const attempt = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
  const update = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
  const service = new AiMonitoringService({
    aiOperationLog: { create, update },
    aiHttpAttempt: { create: attempt },
  } as unknown as PrismaService);
  return { service, create, attempt, update };
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('AI telemetry outside the request critical path', () => {
  const originalFetch = global.fetch;
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    global.fetch = jest
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('{}')));
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it.each(['create', 'attempt', 'update'] as const)(
    'returns the AI response while %s persistence is still pending and writes in order once released',
    async (blocked) => {
      const f = fixture();
      const gate = deferred();
      f[blocked].mockReturnValueOnce(gate.promise);
      const response = await f.service.run('initial_questions', () =>
        aiFetch('https://ai.test', {}, { provider: 'openai' }),
      );
      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(await f.service.flush(1)).toBe(false);
      // A stalled first query does not start additional database queries.
      if (blocked === 'create') {
        expect(f.attempt).not.toHaveBeenCalled();
        expect(f.update).not.toHaveBeenCalled();
      }
      if (blocked === 'attempt') expect(f.update).not.toHaveBeenCalled();
      gate.resolve({});
      expect(await f.service.flush()).toBe(true);
      expect(f.create).toHaveBeenCalledTimes(1);
      expect(f.attempt).toHaveBeenCalledTimes(1);
      expect(f.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUCCESS' }),
        }),
      );
      expect(f.create.mock.invocationCallOrder[0]).toBeLessThan(
        f.attempt.mock.invocationCallOrder[0],
      );
      expect(f.attempt.mock.invocationCallOrder[0]).toBeLessThan(
        f.update.mock.invocationCallOrder[0],
      );
    },
  );

  it('returns a successful result when the final update never settles', async () => {
    const f = fixture();
    f.update.mockReturnValue(new Promise(() => {}));
    await expect(
      f.service.run('potential', () =>
        Promise.resolve({ provider: 'stub', result: 42 }),
      ),
    ).resolves.toEqual({ provider: 'stub', result: 42 });
    expect(await f.service.flush(1)).toBe(false);
    expect(f.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCESS' }),
      }),
    );
  });

  it('preserves an application error when the final update never settles', async () => {
    const f = fixture();
    f.update.mockReturnValue(new Promise(() => {}));
    const error = new BadGatewayException('business failure');
    await expect(
      f.service.run('potential', () => Promise.reject(error)),
    ).rejects.toBe(error);
    expect(await f.service.flush(1)).toBe(false);
    expect(f.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ERROR' }),
      }),
    );
  });

  it('keeps retries independent of stalled persistence', async () => {
    const f = fixture();
    const gate = deferred();
    f.create.mockReturnValueOnce(gate.promise);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'retry-after': '0' } }),
      )
      .mockResolvedValueOnce(new Response('{}'));
    await expect(
      f.service.run('initial_questions', () =>
        aiFetch('https://ai.test', {}, { provider: 'gemini', retries: 1 }),
      ),
    ).resolves.toMatchObject({ status: 200 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    gate.resolve({});
    await f.service.flush();
    expect(f.attempt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ sequence: 1, httpStatus: 429 }),
      }),
    );
    expect(f.attempt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ sequence: 2, httpStatus: 200 }),
      }),
    );
  });

  it('bounds the backlog without blocking requests or starting unlimited stuck DB queries', async () => {
    const f = fixture();
    const gate = deferred();
    f.create.mockReturnValueOnce(gate.promise);
    await f.service.run('potential', () => Promise.resolve(0));
    const results = await Promise.all(
      Array.from({ length: AI_LOG_QUEUE_LIMIT * 2 }, (_, i) =>
        f.service.run('potential', () => Promise.resolve(i)),
      ),
    );
    expect(results).toHaveLength(AI_LOG_QUEUE_LIMIT * 2);
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    gate.resolve({});
    await f.service.flush();
    expect(f.create.mock.calls.length).toBeLessThanOrEqual(AI_LOG_QUEUE_LIMIT);
    expect(f.create.mock.calls.length).toBeLessThan(results.length);
  });
});
