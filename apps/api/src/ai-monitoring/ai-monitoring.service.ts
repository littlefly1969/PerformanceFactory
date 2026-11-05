import {
  HttpException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { aiTrace, AiTrace, safeModel } from '../common/ai-telemetry';

export const AI_OPERATIONS = [
  'initial_questions',
  'calibration_questions',
  'micro_tests',
  'assessment_evaluation',
  'potential',
  'cycle_proposal',
  'training_proposal',
  'cycle_history',
  'goal_validation',
  'specialist_questions',
  'prompt_test',
] as const;
export const LOG_RETENTION_DAYS = 30;
export const AI_LOG_QUEUE_LIMIT = 500;

@Injectable()
export class AiMonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiMonitoringService.name);
  private timer?: ReturnType<typeof setInterval>;
  private readonly writes: Array<() => Promise<unknown>> = [];
  private worker?: Promise<void>;
  private stopping = false;
  private lastWarningAt = 0;
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.prune();
    this.timer = setInterval(() => this.prune(), 60 * 60 * 1000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.stopping = true;
    if (!(await this.flush())) this.warn();
  }

  private warn() {
    // Rate limit diagnostics and never print database errors or payloads.
    if (Date.now() - this.lastWarningAt < 60_000) return;
    this.lastWarningAt = Date.now();
    this.logger.warn(
      'AI_TELEMETRY_WRITE_FAILED: storico AI incompleto o in ritardo',
    );
  }

  /** Bounded FIFO: one database write in flight, never awaited by AI requests. */
  private enqueue(action: () => Promise<unknown>) {
    if (
      this.stopping ||
      this.writes.length + (this.worker ? 1 : 0) >= AI_LOG_QUEUE_LIMIT
    ) {
      this.warn();
      return false;
    }
    this.writes.push(action);
    this.startWorker();
    return true;
  }
  private startWorker() {
    if (this.worker) return;
    this.worker = this.drain().finally(() => {
      this.worker = undefined;
      if (this.writes.length) this.startWorker();
    });
  }
  private async drain() {
    // Defer even the first DB call until after the application action can start.
    await Promise.resolve();
    while (this.writes.length) {
      const action = this.writes.shift()!;
      try {
        await action();
      } catch {
        this.warn();
      }
    }
  }

  /** Only shutdown/tests wait for persistence; a stuck DB cannot hold shutdown indefinitely. */
  async flush(timeoutMs = 1000): Promise<boolean> {
    if (!this.worker) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.worker.then(() => true),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private prune() {
    this.enqueue(() =>
      this.prisma.aiOperationLog.deleteMany({
        where: {
          startedAt: {
            lt: new Date(Date.now() - LOG_RETENTION_DAYS * 86400000),
          },
        },
      }),
    );
  }

  async run<T>(
    operation: (typeof AI_OPERATIONS)[number],
    action: () => Promise<T>,
  ): Promise<T> {
    const startedAt = new Date();
    const id = randomUUID();
    let persisting = this.enqueue(() =>
      this.prisma.aiOperationLog.create({
        data: { id, operation, startedAt },
      }),
    );
    const trace: AiTrace = {
      sequence: 0,
      validationFailures: 0,
      validationCodes: new Set<string>(),
      saveAttempt: (entry) => {
        if (!persisting) return;
        persisting = this.enqueue(async () => {
          await this.prisma.aiHttpAttempt.create({
            data: { ...entry, operationId: id },
          });
          await this.prisma.aiOperationLog.update({
            where: { id },
            data: { provider: entry.provider, model: entry.model },
          });
        });
      },
    };
    const finish = (status: string, result?: unknown) => {
      if (!persisting) return;
      const data =
        result && typeof result === 'object'
          ? (result as Record<string, unknown>)
          : {};
      const provider = ['openai', 'gemini', 'stub'].includes(
        String(data.provider),
      )
        ? String(data.provider)
        : undefined;
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const validationFailures = trace.validationFailures;
      const validationCodes = [...trace.validationCodes];
      const providerName = trace.lastAttempt?.provider ?? provider;
      const model = trace.lastAttempt?.model ?? safeModel(data.model);
      const code = status === 'ERROR' ? errorCode(result, trace) : null;
      this.enqueue(() =>
        this.prisma.aiOperationLog.update({
          where: { id },
          data: {
            status,
            finishedAt,
            durationMs,
            validationFailures,
            validationCodes,
            provider: providerName,
            model,
            errorCode: code,
          },
        }),
      );
    };
    return aiTrace.run(trace, async () => {
      try {
        const result = await action();
        finish('SUCCESS', result);
        return result;
      } catch (error) {
        finish('ERROR', error);
        throw error;
      }
    });
  }
}

function errorCode(error: unknown, trace: AiTrace) {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const code =
      typeof response === 'object' && response
        ? (response as { code?: unknown }).code
        : undefined;
    if (
      typeof code === 'string' &&
      [
        'AI_QUOTA_EXHAUSTED',
        'INITIAL_QUESTIONS_UNAVAILABLE',
        'INVALID_ASSESSMENT_EVALUATION',
        'INVALID_CALIBRATION_QUESTIONS',
        'INVALID_MICRO_TESTS',
      ].includes(code)
    )
      return code;
  }
  if (trace.validationFailures) return 'INVALID_OUTPUT';
  if (trace.lastAttempt && trace.lastAttempt.status !== 'SUCCESS')
    return trace.lastAttempt.status;
  if (trace.lastAttempt?.status === 'SUCCESS') return 'OUTPUT_ERROR';
  return 'CONFIGURATION_OR_INTERNAL_ERROR';
}
