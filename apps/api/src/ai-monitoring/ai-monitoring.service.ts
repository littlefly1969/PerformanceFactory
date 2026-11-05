import {
  HttpException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
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

@Injectable()
export class AiMonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiMonitoringService.name);
  private timer?: ReturnType<typeof setInterval>;
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.prune();
    this.timer = setInterval(() => void this.prune(), 60 * 60 * 1000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async safe(action: () => Promise<unknown>) {
    try {
      await action();
    } catch {
      // Never print the database error: it could contain values from a query.
      this.logger.warn('AI_TELEMETRY_WRITE_FAILED: storico AI non aggiornato');
    }
  }
  private prune() {
    return this.safe(() =>
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
    let id: string | undefined;
    await this.safe(async () => {
      const row = await this.prisma.aiOperationLog.create({
        data: { operation, startedAt },
      });
      id = row.id;
    });
    const trace: AiTrace = {
      sequence: 0,
      validationFailures: 0,
      validationCodes: new Set<string>(),
      saveAttempt: (entry) =>
        this.safe(async () => {
          if (!id) return;
          await this.prisma.aiHttpAttempt.create({
            data: { ...entry, operationId: id },
          });
          await this.prisma.aiOperationLog.update({
            where: { id },
            data: { provider: entry.provider, model: entry.model },
          });
        }),
    };
    const finish = (status: string, result?: unknown) =>
      this.safe(async () => {
        if (!id) return;
        const data =
          result && typeof result === 'object'
            ? (result as Record<string, unknown>)
            : {};
        const provider = ['openai', 'gemini', 'stub'].includes(
          String(data.provider),
        )
          ? String(data.provider)
          : undefined;
        await this.prisma.aiOperationLog.update({
          where: { id },
          data: {
            status,
            finishedAt: new Date(),
            durationMs: Date.now() - startedAt.getTime(),
            validationFailures: trace.validationFailures,
            validationCodes: [...trace.validationCodes],
            provider: trace.lastAttempt?.provider ?? provider,
            model: trace.lastAttempt?.model ?? safeModel(data.model),
            errorCode: status === 'ERROR' ? errorCode(result, trace) : null,
          },
        });
      });
    return aiTrace.run(trace, async () => {
      try {
        const result = await action();
        await finish('SUCCESS', result);
        return result;
      } catch (error) {
        await finish('ERROR', error);
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
