import { BadGatewayException, Logger } from '@nestjs/common';
import { AiMonitoringService } from './ai-monitoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { aiFetch } from '../common/ai-fetch';
import { recordAiValidationFailure } from '../common/ai-telemetry';
import { AiProposalProviderService } from '../ai-orchestrator/proposal-provider.service';
import { InitialQuestionsInput } from '../ai-orchestrator/initial-questions';

function fixture() {
  let sequence = 0;
  const db = {
    aiOperationLog: {
      create: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ id: `op-${++sequence}` })),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    aiHttpAttempt: { create: jest.fn().mockResolvedValue({}) },
  };
  return {
    db,
    service: new AiMonitoringService(db as unknown as PrismaService),
  };
}

describe('persistent AI telemetry', () => {
  const originalFetch = global.fetch;
  const previousEnv = { ...process.env };
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...previousEnv };
    jest.restoreAllMocks();
  });

  it('records each HTTP retry and a successful final operation, without copying secrets', async () => {
    const { db, service } = fixture();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response('SECRET prompt email@test.it', {
          status: 429,
          headers: { 'retry-after': '0' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}'));
    await service.run('initial_questions', () =>
      aiFetch(
        'https://ai.test?key=SECRET',
        {
          headers: { Authorization: 'Bearer SECRET' },
          body: 'private answers',
        },
        { provider: 'openai', model: 'gpt-test', retries: 1 },
      ),
    );
    expect(db.aiHttpAttempt.create.mock.calls.map(([arg]) => arg.data)).toEqual(
      [
        expect.objectContaining({
          operationId: 'op-1',
          sequence: 1,
          httpStatus: 429,
          status: 'HTTP_ERROR',
        }),
        expect.objectContaining({
          operationId: 'op-1',
          sequence: 2,
          httpStatus: 200,
          status: 'SUCCESS',
        }),
      ],
    );
    expect(db.aiOperationLog.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCESS' }),
      }),
    );
    const persisted = JSON.stringify([
      db.aiOperationLog.create.mock.calls,
      db.aiOperationLog.update.mock.calls,
      db.aiHttpAttempt.create.mock.calls,
    ]);
    expect(persisted).not.toMatch(/SECRET|email@test|private answers|https:/);
  });

  it('captures invalid questions after HTTP 200 including automatic regeneration', async () => {
    const { db, service } = fixture();
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'SECRET';
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ output_text: '{}' })));
    // Fresh Response for each request: body must not have been consumed by the prior retry.
    jest
      .mocked(global.fetch)
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ output_text: '{}' }))),
      );
    const input: InitialQuestionsInput = {
      basePrompt: 'private prompt',
      promptVersionId: null,
      scale: { minScore: 0, maxScore: 100 },
      athleteContext: [],
      availability: [],
      questionsPerArea: 1,
      drivers: [{ areaId: 'technical', name: 'Tecnica' }],
      fitRanking: {
        source: 'SELF_DECLARED',
        declaredAt: '2026-11-05T00:00:00Z',
        padel: { current: '', best: '' },
        tennis: { current: '', best: '' },
      },
    };
    await expect(
      new AiProposalProviderService(service).generateInitialQuestions(input),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(db.aiHttpAttempt.create).toHaveBeenCalledTimes(2);
    expect(db.aiOperationLog.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ERROR',
          validationFailures: 2,
          errorCode: 'INITIAL_QUESTIONS_UNAVAILABLE',
        }),
      }),
    );
  });

  it('records aborts as timeout and preserves the thrown business error', async () => {
    const { db, service } = fixture();
    global.fetch = jest.fn().mockImplementation(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () =>
            reject(Object.assign(new Error('secret'), { name: 'AbortError' })),
          );
        }),
    );
    await expect(
      service.run('assessment_evaluation', () =>
        aiFetch(
          'https://ai.test',
          {},
          { provider: 'gemini', retries: 0, timeoutMs: 1 },
        ),
      ),
    ).rejects.toThrow('timeout');
    expect(db.aiHttpAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'TIMEOUT', httpStatus: null }),
      }),
    );
    expect(db.aiOperationLog.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ERROR',
          errorCode: 'TIMEOUT',
        }),
      }),
    );
  });

  it('isolates concurrent operations and keeps validation failures on the matching operation', async () => {
    const { db, service } = fixture();
    global.fetch = jest
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('{}')));
    await Promise.all([
      service.run('initial_questions', async () => {
        await aiFetch('a', {}, { provider: 'openai' });
        recordAiValidationFailure();
      }),
      service.run('assessment_evaluation', async () => {
        await aiFetch('b', {}, { provider: 'gemini' });
      }),
    ]);
    expect(db.aiHttpAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operationId: 'op-1',
          provider: 'openai',
          sequence: 1,
        }),
      }),
    );
    expect(db.aiHttpAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operationId: 'op-2',
          provider: 'gemini',
          sequence: 1,
        }),
      }),
    );
    expect(db.aiOperationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'op-1' },
        data: expect.objectContaining({ validationFailures: 1 }),
      }),
    );
  });

  it('does not turn a telemetry database failure into an athlete error', async () => {
    const { db, service } = fixture();
    db.aiOperationLog.create.mockRejectedValue(new Error('database down'));
    await expect(
      service.run('potential', () =>
        Promise.resolve({ provider: 'stub', result: 42 }),
      ),
    ).resolves.toMatchObject({ result: 42 });
    const error = new BadGatewayException('private output');
    await expect(
      service.run('potential', () => Promise.reject(error)),
    ).rejects.toBe(error);
  });
});
