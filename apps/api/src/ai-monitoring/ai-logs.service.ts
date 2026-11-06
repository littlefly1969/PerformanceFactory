import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiLogsQueryDto } from './ai-logs-query.dto';
import { LOG_RETENTION_DAYS } from './ai-monitoring.service';

const INTERRUPTED_AFTER_MS = 60 * 60 * 1000;
export function logStatus(row: { status: string; startedAt: Date }, now: Date) {
  return row.status === 'RUNNING' &&
    now.getTime() - row.startedAt.getTime() > INTERRUPTED_AFTER_MS
    ? 'INTERRUPTED'
    : row.status;
}

@Injectable()
export class AiLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AiLogsQueryDto) {
    const now = new Date();
    const stale = new Date(now.getTime() - INTERRUPTED_AFTER_MS);
    const where: Prisma.AiOperationLogWhereInput = {
      startedAt: { gte: new Date(now.getTime() - query.days * 86400000) },
      ...(query.provider && { provider: query.provider }),
      ...(query.operation && { operation: query.operation }),
      ...(query.id && { OR: [{ id: query.id }, { contextId: query.id }] }),
      ...(query.diagnostics && {
        diagnosticsEnabled: query.diagnostics === 'true',
      }),
      ...(query.errorCode && { errorCode: query.errorCode }),
    };
    if (query.status === 'INTERRUPTED')
      where.AND = [{ status: 'RUNNING', startedAt: { lt: stale } }];
    else if (query.status === 'RUNNING')
      where.AND = [{ status: 'RUNNING', startedAt: { gte: stale } }];
    else if (query.status) where.status = query.status;
    return this.prisma.$transaction(
      async (tx) => {
        const groups = await tx.aiOperationLog.groupBy({
          by: ['status'],
          where,
          _count: true,
        });
        const interrupted = await tx.aiOperationLog.count({
          where: {
            AND: [where, { status: 'RUNNING', startedAt: { lt: stale } }],
          },
        });
        const counts = Object.fromEntries(
          groups.map((g) => [g.status, g._count]),
        );
        counts.RUNNING = (counts.RUNNING ?? 0) - interrupted;
        counts.INTERRUPTED = interrupted;
        const total = groups.reduce((n, g) => n + g._count, 0);
        const pages = Math.max(1, Math.ceil(total / query.pageSize));
        const page = Math.min(query.page, pages);
        const rows = await tx.aiOperationLog.findMany({
          where,
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * query.pageSize,
          take: query.pageSize,
          select: {
            id: true,
            operation: true,
            provider: true,
            model: true,
            status: true,
            errorCode: true,
            startedAt: true,
            finishedAt: true,
            durationMs: true,
            validationFailures: true,
            validationCodes: true,
            diagnosticsEnabled: true,
            contextId: true,
            _count: { select: { attempts: true, events: true } },
          },
        });
        return {
          rows: rows.map((r) => ({ ...r, status: logStatus(r, now) })),
          total,
          page,
          pageSize: query.pageSize,
          pages,
          counts,
          generatedAt: now.toISOString(),
          retentionDays: LOG_RETENTION_DAYS,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async detail(id: string) {
    const row = await this.prisma.aiOperationLog.findFirst({
      where: {
        id,
        startedAt: {
          gte: new Date(Date.now() - LOG_RETENTION_DAYS * 86400000),
        },
      },
      include: {
        attempts: { orderBy: { sequence: 'asc' } },
        events: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!row)
      throw new NotFoundException('Operazione non trovata o storico scaduto');
    return { ...row, status: logStatus(row, new Date()) };
  }
}
