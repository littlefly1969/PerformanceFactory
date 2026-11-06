import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const AI_SETTINGS_READ_TIMEOUT_MS = 500;
export const AI_SETTINGS_REFRESH_MS = 5000;
export const AI_SETTINGS_MAX_AGE_MS = 10000;
const MAX_PENDING_READS = 2;

@Injectable()
export class AiDiagnosticsSettingsService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AiDiagnosticsSettingsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private refreshPending = false;
  private readonly pendingReads = new Set<Promise<unknown>>();
  private verifiedAt: number | null = null;
  private enabled = false;
  private version = 0;
  private lastWarningAt = 0;
  private current: {
    enabled: boolean;
    updatedAt: Date;
    updatedById: string | null;
  } | null = null;
  constructor(private readonly prisma: PrismaService) {}
  private apply(
    row: {
      enabled: boolean;
      updatedAt: Date;
      updatedById: string | null;
    } | null,
  ) {
    if (this.current && row && row.updatedAt < this.current.updatedAt) return;
    this.current = row;
    this.enabled = row?.enabled ?? false;
    this.verifiedAt = Date.now();
  }
  snapshot() {
    const age = this.verifiedAt === null ? -1 : Date.now() - this.verifiedAt;
    return this.enabled && age >= 0 && age < AI_SETTINGS_MAX_AGE_MS;
  }
  async onModuleInit() {
    // Only startup waits for this bounded read; AI snapshots remain synchronous.
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), AI_SETTINGS_REFRESH_MS);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.version++;
    this.enabled = false;
    this.verifiedAt = null;
  }
  private unavailable() {
    return new ServiceUnavailableException(
      'Impossibile verificare lo stato della diagnostica AI',
    );
  }
  private async boundedRead<T>(query: () => Promise<T>): Promise<T> {
    // A timeout does not cancel Prisma promises. Bound the actual outstanding
    // reads too, so a stalled backend cannot progressively exhaust the pool.
    if (this.pendingReads.size >= MAX_PENDING_READS) throw this.unavailable();
    const pending = Promise.resolve(query());
    this.pendingReads.add(pending);
    void pending.then(
      () => this.pendingReads.delete(pending),
      () => this.pendingReads.delete(pending),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(this.unavailable()),
            AI_SETTINGS_READ_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  private invalidate(version: number) {
    if (version !== this.version) return;
    this.enabled = false;
    this.verifiedAt = null;
  }
  private async refresh() {
    if (this.refreshPending) return;
    this.refreshPending = true;
    const version = this.version;
    try {
      const row = await this.boundedRead(() =>
        this.prisma.aiDiagnosticControl.findUnique({ where: { id: 'global' } }),
      );
      if (version === this.version) this.apply(row);
    } catch {
      this.invalidate(version);
      if (Date.now() - this.lastWarningAt >= 60000) {
        this.lastWarningAt = Date.now();
        this.logger.warn('AI_DIAGNOSTIC_SETTINGS_UNAVAILABLE');
      }
    } finally {
      this.refreshPending = false;
    }
  }
  async read() {
    const version = this.version;
    let row;
    let changes;
    try {
      row = await this.boundedRead(() =>
        this.prisma.aiDiagnosticControl.findUnique({ where: { id: 'global' } }),
      );
      if (version === this.version) {
        this.version++;
        this.apply(row);
      }
      changes = await this.boundedRead(() =>
        this.prisma.aiDiagnosticControlChange.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      );
    } catch (error) {
      this.invalidate(version);
      throw error;
    }
    return {
      enabled: this.enabled,
      updatedAt: this.current?.updatedAt ?? null,
      updatedById: this.current?.updatedById ?? null,
      changes,
      propagationSeconds: AI_SETTINGS_REFRESH_MS / 1000,
      verifiedAt: this.verifiedAt === null ? null : new Date(this.verifiedAt),
      captureEnabled: this.snapshot(),
      maxVerificationAgeSeconds: AI_SETTINGS_MAX_AGE_MS / 1000,
      retentionDays: 30,
    };
  }
  async update(enabled: boolean, actorId: string) {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ai-diagnostics-control'))`;
      const before = await tx.aiDiagnosticControl.findUnique({
        where: { id: 'global' },
      });
      const after = await tx.aiDiagnosticControl.upsert({
        where: { id: 'global' },
        create: { id: 'global', enabled, updatedById: actorId },
        update: { enabled, updatedById: actorId },
      });
      if (!before || before.enabled !== enabled)
        await tx.aiDiagnosticControlChange.create({
          data: { enabled, actorId },
        });
      return after;
    });
    this.version++;
    this.apply(row);
    return {
      enabled: row.enabled,
      updatedAt: row.updatedAt,
      updatedById: row.updatedById,
    };
  }
}
