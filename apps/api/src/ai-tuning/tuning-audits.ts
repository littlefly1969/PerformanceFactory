import { NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AUDITS_PAGE_SIZE } from './ai-tuning-model';

export function pseudonymizeUserId(userId: string): string {
  const hash = createHash('sha256').update(userId).digest('hex');
  return `Atleta #${hash.substring(0, 8)}`;
}

export async function listAudits(
  prisma: PrismaService,
  params: {
    areaId?: string;
    page?: number;
    provider?: string;
  },
) {
  const page = Math.max(1, params.page ?? 1);
  const skip = (page - 1) * AUDITS_PAGE_SIZE;
  const where: Prisma.AiProposalAuditWhereInput = {
    status: 'SUCCESS',
    user: { role: UserRole.USER },
  };
  if (params.areaId) {
    where.planRelease = { areaId: params.areaId };
  }
  if (params.provider) {
    where.provider = params.provider;
  }
  const [rows, total] = await prisma.$transaction([
    prisma.aiProposalAudit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: AUDITS_PAGE_SIZE,
      skip,
      select: {
        id: true,
        userId: true,
        createdAt: true,
        provider: true,
        model: true,
        promptVersion: true,
        latencyMs: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        planRelease: {
          select: {
            area: { select: { id: true, name: true } },
            version: true,
          },
        },
      },
    }),
    prisma.aiProposalAudit.count({ where }),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      athleteLabel: pseudonymizeUserId(row.userId),
      createdAt: row.createdAt,
      provider: row.provider,
      model: row.model,
      promptVersion: row.promptVersion,
      latencyMs: row.latencyMs,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.totalTokens,
      area: row.planRelease?.area ?? null,
      cycleVersion: row.planRelease?.version ?? null,
    })),
    total,
    page,
    pageSize: AUDITS_PAGE_SIZE,
  };
}

export async function getAuditDetail(prisma: PrismaService, auditId: string) {
  const row = await prisma.aiProposalAudit.findUnique({
    where: { id: auditId },
    include: {
      planRelease: {
        select: {
          id: true,
          areaId: true,
          version: true,
          area: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!row) {
    throw new NotFoundException(`Audit ${auditId} non trovato`);
  }
  const areaConfig = row.planRelease?.areaId
    ? await prisma.aiAreaGenerationConfig.findUnique({
        where: { areaId: row.planRelease.areaId },
      })
    : null;
  return {
    id: row.id,
    athleteLabel: pseudonymizeUserId(row.userId),
    createdAt: row.createdAt,
    provider: row.provider,
    model: row.model,
    promptVersion: row.promptVersion,
    promptHash: row.promptHash,
    latencyMs: row.latencyMs,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    area: row.planRelease?.area ?? null,
    cycleVersion: row.planRelease?.version ?? null,
    inputJson: row.inputJson,
    outputJson: row.outputJson,
    currentAreaConfig: areaConfig
      ? {
          id: areaConfig.id,
          initialContext: areaConfig.initialContext,
          responseFormatPrompt: areaConfig.responseFormatPrompt,
        }
      : null,
  };
}

export async function getCostSummary(
  prisma: PrismaService,
  params: { from?: Date; to?: Date },
) {
  const where: Prisma.AiProposalAuditWhereInput = {
    status: 'SUCCESS',
    totalTokens: { not: null },
  };
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = params.from;
    if (params.to) where.createdAt.lte = params.to;
  }
  const grouped = await prisma.aiProposalAudit.groupBy({
    by: ['provider', 'model'],
    where,
    _sum: {
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      latencyMs: true,
    },
    _count: { _all: true },
  });

  const recent = await prisma.aiProposalAudit.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      createdAt: true,
      provider: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      latencyMs: true,
      planRelease: { select: { area: { select: { name: true } } } },
    },
  });

  const replayAgg = await prisma.aiPromptReplay.groupBy({
    by: ['provider', 'model'],
    where: { status: 'SUCCESS', totalTokens: { not: null } },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      durationMs: true,
    },
    _count: { _all: true },
  });

  return {
    byProvider: grouped.map((row) => ({
      provider: row.provider,
      model: row.model,
      count: row._count._all,
      inputTokens: row._sum.inputTokens ?? 0,
      outputTokens: row._sum.outputTokens ?? 0,
      totalTokens: row._sum.totalTokens ?? 0,
      latencyMsSum: row._sum.latencyMs ?? 0,
    })),
    replays: replayAgg.map((row) => ({
      provider: row.provider,
      model: row.model,
      count: row._count._all,
      inputTokens: row._sum.inputTokens ?? 0,
      outputTokens: row._sum.outputTokens ?? 0,
      totalTokens: row._sum.totalTokens ?? 0,
      durationMsSum: row._sum.durationMs ?? 0,
    })),
    recent: recent.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      provider: row.provider,
      model: row.model,
      area: row.planRelease?.area?.name ?? null,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.totalTokens,
      latencyMs: row.latencyMs,
    })),
  };
}
