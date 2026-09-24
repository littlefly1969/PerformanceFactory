import { BadRequestException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AreaRecord } from './orchestrator-model';
import { CycleProposal } from './proposal-provider-model';
import {
  assertPreviousCycleCompleted,
  buildApprovals,
  buildPlanItems,
  buildQuestions,
} from './cycle-guidance';
export async function persistAreaProposal(
  prisma: PrismaService,
  userId: string,
  area: AreaRecord,
  actorId: string | null,
  proposal: CycleProposal,
  managed?: { id: string; leaseToken: string; approvalMode: string },
  window?: {
    startsOn: string;
    endsOn: string;
    windowDays: number;
    trainingReleaseId: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ability:${userId}:${area.id}`}))`;
    if (managed) {
      const operation = await tx.abilityPlanOperation.findFirst({
        where: {
          id: managed.id,
          leaseToken: managed.leaseToken,
          leaseUntil: { gt: new Date() },
        },
      });
      if (!operation)
        throw new BadRequestException({
          code: 'LEASE_LOST',
          message: 'Lease scaduta',
        });
      if (operation.releaseId)
        return { planReleaseId: operation.releaseId, questionSetId: '' };
    }
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user || user.role !== UserRole.USER || !user.isActive) {
      throw new BadRequestException('Utente non valido');
    }

    const existingPending = await tx.improvementPlanRelease.findFirst({
      where: { userId, areaId: area.id, status: 'PENDING_APPROVAL' },
      select: { id: true },
    });
    if (existingPending) {
      throw new BadRequestException(
        'Esiste gia un ciclo in attesa per questa area',
      );
    }

    await assertPreviousCycleCompleted(tx, userId, area.id);

    const previousSnapshot = await tx.performanceProfileSnapshot.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const lastPlan = await tx.improvementPlanRelease.findFirst({
      where: { userId, areaId: area.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (lastPlan?.version ?? 0) + 1;

    const plan = await tx.improvementPlanRelease.create({
      data: {
        userId,
        areaId: area.id,
        version: nextVersion,
        status: 'PENDING_APPROVAL',
        generatedBy: 'AI',
        sourceSnapshotId: previousSnapshot?.id ?? null,
        cycleStatus: 'WAITING_APPROVALS',
        proposedByAdminId: actorId && actorId !== userId ? actorId : null,
        ...(window
          ? {
              startsOn: new Date(`${window.startsOn}T00:00:00Z`),
              endsOn: new Date(`${window.endsOn}T00:00:00Z`),
              windowDays: window.windowDays,
              trainingReleaseId: window.trainingReleaseId,
            }
          : {}),
        items: { create: buildPlanItems(area, proposal) },
      },
      select: { id: true, version: true },
    });

    const questionSet = await tx.questionSet.create({
      data: {
        userId,
        planReleaseId: plan.id,
        areaId: area.id,
        type: 'AI_CYCLE',
        status: 'PENDING_APPROVAL',
        questions: { create: buildQuestions(area, proposal) },
        approvals: {
          create: await buildApprovals(tx, userId, area),
        },
      },
      select: { id: true },
    });

    await tx.aiContextSummary.create({
      data: {
        userId,
        summaryText: proposal.summaryText,
        summaryJson: {
          planReleaseId: plan.id,
          questionSetId: questionSet.id,
          areaId: area.id,
          provider: proposal.provider,
          model: proposal.model,
          promptVersion: proposal.promptVersion,
          planVersion: plan.version,
          humanReviewRequired: !managed || managed.approvalMode === 'MANUAL',
        },
        cycleStatus: 'WAITING_APPROVALS',
        planReleaseId: plan.id,
      },
    });

    await tx.aiProposalAudit.create({
      data: {
        userId,
        planReleaseId: plan.id,
        questionSetId: questionSet.id,
        provider: proposal.provider,
        model: proposal.model,
        promptVersion: proposal.promptVersion,
        promptHash: proposal.promptHash,
        status: proposal.audit.status,
        inputJson: proposal.audit.inputJson as Prisma.InputJsonObject,
        outputJson: proposal.audit.outputJson as Prisma.InputJsonObject,
        latencyMs: proposal.audit.latencyMs,
        correlationId: proposal.audit.correlationId,
        inputTokens: proposal.audit.inputTokens ?? null,
        outputTokens: proposal.audit.outputTokens ?? null,
        totalTokens: proposal.audit.totalTokens ?? null,
      },
    });

    await tx.cycleAuditLog.create({
      data: {
        userId,
        planReleaseId: plan.id,
        action: 'PROPOSAL_RUN',
        actorId: actorId ?? null,
        source: managed ? 'SYSTEM' : 'USER',
      },
    });

    if (managed)
      await tx.abilityPlanOperation.update({
        where: { id: managed.id },
        data: { releaseId: plan.id },
      });
    return {
      planReleaseId: plan.id,
      questionSetId: questionSet.id,
    };
  });
}
