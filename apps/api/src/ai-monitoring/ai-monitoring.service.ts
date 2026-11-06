import {
  HttpException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AiDiagnosticsSettingsService } from './ai-diagnostics-settings.service';
import { aiBusinessContext } from '../common/ai-diagnostic-context';
import {
  diagnosticJson,
  diagnosticError,
} from '../common/ai-diagnostic-redaction';
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
  'area_schedule',
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
  private closing = false;
  private readonly captures = new Set<Promise<void>>();
  private lastFailureAt: Date | null = null;
  private lastWarningAt = 0;
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly controls?: AiDiagnosticsSettingsService,
  ) {}
  health() {
    return {
      pendingWrites: this.writes.length,
      pendingCaptures: this.captures.size,
      lastFailureAt: this.lastFailureAt,
    };
  }

  onModuleInit() {
    this.prune();
    this.timer = setInterval(() => this.prune(), 60 * 60 * 1000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.closing = true;
    if (!(await this.flush())) this.warn();
    this.stopping = true;
  }

  private warn() {
    this.lastFailureAt = new Date();
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
    if (!this.worker && !this.captures.size) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          while (this.captures.size || this.worker) {
            await Promise.allSettled([...this.captures]);
            if (this.worker) await this.worker;
          }
          return true;
        })(),
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
    this.enqueue(() =>
      this.prisma.aiDiagnosticControlChange.deleteMany({
        where: {
          createdAt: {
            lt: new Date(Date.now() - LOG_RETENTION_DAYS * 86400000),
          },
        },
      }),
    );
  }

  async run<T>(
    operation: (typeof AI_OPERATIONS)[number],
    action: () => Promise<T>,
    input?: unknown,
  ): Promise<T> {
    const startedAt = new Date();
    const id = randomUUID();
    const context = aiBusinessContext.getStore();
    const diagnosticsEnabled = this.controls?.snapshot() ?? false;
    const invocationInput = diagnosticsEnabled
      ? diagnosticJson(input ?? null)
      : undefined;
    let persisting =
      !this.closing &&
      this.enqueue(() =>
        this.prisma.aiOperationLog.create({
          data: {
            id,
            operation,
            startedAt,
            diagnosticsEnabled,
            contextId: context?.contextId,
            invocationInput,
          },
        }),
      );
    let returned = false;
    let failed = false;
    const trace: AiTrace = {
      diagnosticsEnabled,
      diagnosticSequence: 0,
      sequence: 0,
      validationFailures: 0,
      validationCodes: new Set<string>(),
      trackCapture: (capture) => {
        this.captures.add(capture);
        void capture
          .finally(() => this.captures.delete(capture))
          .catch(() => this.warn());
      },
      saveResponse: (sequence, response, state) => {
        if (!persisting) return;
        const data = JSON.parse(
          diagnosticJson(response),
        ) as Prisma.InputJsonValue;
        persisting = this.enqueue(() =>
          this.prisma.aiHttpAttempt.update({
            where: { operationId_sequence: { operationId: id, sequence } },
            data: { response: data, captureState: state },
          }),
        );
      },
      saveEvent: (event) => {
        if (!persisting) return;
        const detail = JSON.parse(
          diagnosticJson(event.detail),
        ) as Prisma.InputJsonValue;
        const rejectedAfterReturn = event.phase === 'VALIDATION' && returned;
        const downstreamFailure = event.phase === 'BUSINESS';
        const resultError = failed;
        const failures = trace.validationFailures;
        const codes = [...trace.validationCodes];
        persisting = this.enqueue(async () => {
          await this.prisma.aiDiagnosticEvent.create({
            data: { ...event, operationId: id, detail },
          });
          if (downstreamFailure || rejectedAfterReturn)
            await this.prisma.aiOperationLog.update({
              where: { id },
              data: {
                errorDetail: detail,
                ...(!resultError && {
                  status: 'ERROR',
                  errorCode: downstreamFailure
                    ? 'BUSINESS_PROCESS_FAILED'
                    : 'INVALID_AI_OUTPUT',
                  finishedAt: event.createdAt,
                  durationMs: event.createdAt.getTime() - startedAt.getTime(),
                  validationFailures: failures,
                  validationCodes: codes,
                }),
              },
            });
        });
      },
      saveAttempt: (entry) => {
        if (!persisting) return;
        persisting = this.enqueue(async () => {
          const { request, ...metadata } = entry;
          await this.prisma.aiHttpAttempt.create({
            data: {
              ...metadata,
              operationId: id,
              ...(request !== undefined && {
                request: JSON.parse(
                  diagnosticJson(request),
                ) as Prisma.InputJsonValue,
              }),
            },
          });
          await this.prisma.aiOperationLog.update({
            where: { id },
            data: { provider: entry.provider, model: entry.model },
          });
        });
      },
    };
    if (context) context.lastTrace = trace;
    const finish = (status: string, result?: unknown) => {
      returned = true;
      failed = status === 'ERROR';
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
      const invocationOutput =
        diagnosticsEnabled && status === 'SUCCESS'
          ? diagnosticJson(result)
          : undefined;
      const errorDetail =
        diagnosticsEnabled && status === 'ERROR'
          ? (JSON.parse(
              diagnosticJson(diagnosticError(result)),
            ) as Prisma.InputJsonValue)
          : undefined;
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
            invocationOutput,
            errorDetail,
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
        if (diagnosticsEnabled)
          trace.saveEvent?.({
            sequence: (trace.diagnosticSequence =
              (trace.diagnosticSequence ?? 0) + 1),
            attemptSequence: trace.lastAttempt?.sequence ?? null,
            phase: 'ERROR',
            detail: diagnosticError(error),
            createdAt: new Date(),
          });
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
        'INVALID_AI_OUTPUT',
        'INVALID_POTENTIAL',
        'UNSAFE_TRAINING_CONTENT',
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
