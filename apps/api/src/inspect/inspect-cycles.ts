import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export async function listCycles(prisma: PrismaService) {
  return prisma.improvementPlanRelease.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      userId: true,
      areaId: true,
      version: true,
      status: true,
      cycleStatus: true,
      createdAt: true,
      publishedAt: true,
      archivedAt: true,
      user: { select: { id: true, email: true, role: true } },
      area: { select: { id: true, name: true } },
    },
  });
}

export async function getCycle(prisma: PrismaService, cycleId: string) {
  const planRelease = await prisma.improvementPlanRelease.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      userId: true,
      areaId: true,
      version: true,
      status: true,
      cycleStatus: true,
      generatedBy: true,
      createdAt: true,
      publishedAt: true,
      archivedAt: true,
      sourceSnapshotId: true,
      proposedByAdminId: true,
      publishedByAdminId: true,
      user: { select: { id: true, email: true, role: true } },
      area: { select: { id: true, name: true } },
      items: {
        select: {
          id: true,
          areaId: true,
          type: true,
          title: true,
          body: true,
          metadata: true,
          status: true,
          approvedByProfessionalId: true,
          approvedAt: true,
          rejectedAt: true,
          rejectionReason: true,
          completedAt: true,
          completionNotes: true,
          completionRating: true,
          area: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, email: true } },
        },
        orderBy: { id: 'asc' },
      },
      questionSets: {
        select: {
          id: true,
          type: true,
          status: true,
          createdAt: true,
          publishedAt: true,
          closedAt: true,
          areaId: true,
          area: { select: { id: true, name: true } },
          approvals: {
            select: {
              id: true,
              areaId: true,
              status: true,
              professionalId: true,
              approvedByProfessionalId: true,
              approvedAt: true,
              rejectedAt: true,
              rejectionReason: true,
              area: { select: { id: true, name: true } },
              professional: { select: { id: true, email: true } },
              approvedBy: { select: { id: true, email: true } },
            },
            orderBy: { id: 'asc' },
          },
          questions: {
            select: {
              id: true,
              areaId: true,
              text: true,
              objectiveRef: true,
              orderIndex: true,
              options: { select: { id: true, label: true, score: true } },
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      aiContextSummaries: {
        select: {
          id: true,
          summaryText: true,
          summaryJson: true,
          createdAt: true,
          cycleStatus: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      aiProposalAudits: {
        select: {
          id: true,
          provider: true,
          model: true,
          promptVersion: true,
          promptHash: true,
          status: true,
          inputJson: true,
          outputJson: true,
          errorMessage: true,
          latencyMs: true,
          createdAt: true,
          questionSetId: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      auditLogs: {
        select: {
          id: true,
          action: true,
          actorId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!planRelease) {
    throw new NotFoundException('Ciclo non trovato');
  }

  const latestSnapshot = await prisma.performanceProfileSnapshot.findFirst({
    where: { userId: planRelease.userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      userId: true,
      rankingGlobal: true,
      reason: true,
      createdAt: true,
      areas: {
        select: {
          areaId: true,
          realR: true,
          potentialP: true,
          area: { select: { id: true, name: true } },
        },
      },
    },
  });

  return { planRelease, latestSnapshot };
}
