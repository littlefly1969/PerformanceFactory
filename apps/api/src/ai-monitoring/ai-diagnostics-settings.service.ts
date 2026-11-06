import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiDiagnosticsSettingsService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AiDiagnosticsSettingsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private refreshPending = false;
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
  }
  snapshot() {
    return this.enabled;
  }
  async onModuleInit() {
    // Bound startup only; AI requests never wait on this read.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      this.refresh(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 500);
      }),
    ]);
    if (timeout) clearTimeout(timeout);
    this.timer = setInterval(() => void this.refresh(), 5000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async refresh() {
    if (this.refreshPending) return;
    this.refreshPending = true;
    const version = this.version;
    try {
      const row = await this.prisma.aiDiagnosticControl.findUnique({
        where: { id: 'global' },
      });
      if (version === this.version) this.apply(row);
    } catch {
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
    const [row, changes] = await Promise.all([
      this.prisma.aiDiagnosticControl.findUnique({ where: { id: 'global' } }),
      this.prisma.aiDiagnosticControlChange.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    if (version === this.version) {
      this.version++;
      this.apply(row);
    }
    return {
      enabled: this.enabled,
      updatedAt: this.current?.updatedAt ?? null,
      updatedById: this.current?.updatedById ?? null,
      changes,
      propagationSeconds: 5,
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
