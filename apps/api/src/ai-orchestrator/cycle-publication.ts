import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export async function publishCycle(
  prisma: PrismaService,
  planReleaseId: string,
  actorId: string,
) {
  if (!planReleaseId) {
    throw new BadRequestException('ID rilascio allenamento mancante');
  }
  if (!actorId) {
    throw new BadRequestException('ID attore mancante');
  }

  return prisma.$transaction(async (tx) => {
    const plan = await tx.improvementPlanRelease.findUnique({
      where: { id: planReleaseId },
      select: {
        id: true,
        userId: true,
        areaId: true,
        status: true,
        cycleStatus: true,
        items: { select: { id: true, status: true } },
        questionSets: {
          select: {
            id: true,
            status: true,
            approvals: { select: { status: true } },
          },
        },
      },
    });

    if (!plan) {
      throw new BadRequestException('Rilascio allenamento non trovato');
    }

    if (plan.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        'Il rilascio allenamento non e in approvazione',
      );
    }

    const allItemsApproved = plan.items.every(
      (item) => item.status === 'APPROVED',
    );
    if (!allItemsApproved) {
      throw new BadRequestException(
        'Non tutte le attivita allenamento sono approvate',
      );
    }

    const questionSet = plan.questionSets[0];
    if (!questionSet) {
      throw new BadRequestException('Questionario mancante');
    }

    if (questionSet.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Il questionario non e in approvazione');
    }

    const allAreasApproved = questionSet.approvals.every(
      (approval) => approval.status === 'APPROVED',
    );
    if (!allAreasApproved) {
      throw new BadRequestException(
        'Non tutte le aree del questionario sono approvate',
      );
    }

    await tx.improvementPlanRelease.updateMany({
      where: { userId: plan.userId, areaId: plan.areaId, status: 'ACTIVE' },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });

    await tx.improvementPlanRelease.update({
      where: { id: plan.id },
      data: {
        status: 'ACTIVE',
        publishedAt: new Date(),
        publishedByAdminId: actorId,
        cycleStatus: 'PUBLISHED',
      },
    });

    await tx.planItem.updateMany({
      where: { planReleaseId: plan.id },
      data: { status: 'ACTIVE' },
    });

    await tx.questionSet.update({
      where: { id: questionSet.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });

    await tx.aiContextSummary.updateMany({
      where: { planReleaseId: plan.id },
      data: { cycleStatus: 'PUBLISHED' },
    });

    await tx.cycleAuditLog.create({
      data: {
        userId: plan.userId,
        planReleaseId: plan.id,
        action: 'PUBLISH',
        actorId,
      },
    });

    return { planReleaseId: plan.id, questionSetId: questionSet.id };
  });
}

export async function refreshCycleReadiness(
  prisma: PrismaService,
  planReleaseId: string,
  actorId?: string,
) {
  if (!planReleaseId) {
    throw new BadRequestException('ID rilascio allenamento mancante');
  }

  const readiness = await prisma.$transaction(async (tx) => {
    const plan = await tx.improvementPlanRelease.findUnique({
      where: { id: planReleaseId },
      select: {
        id: true,
        status: true,
        cycleStatus: true,
        items: { select: { status: true } },
        questionSets: {
          select: {
            approvals: { select: { status: true } },
          },
        },
      },
    });

    if (!plan || plan.status !== 'PENDING_APPROVAL') {
      return { planReleaseId, cycleStatus: plan?.cycleStatus ?? 'PROPOSED' };
    }

    const allItemsApproved = plan.items.every(
      (item) => item.status === 'APPROVED',
    );
    const approvals = plan.questionSets[0]?.approvals ?? [];
    const allAreasApproved = approvals.every(
      (approval) => approval.status === 'APPROVED',
    );

    const nextStatus =
      allItemsApproved && allAreasApproved
        ? 'READY_TO_PUBLISH'
        : 'WAITING_APPROVALS';

    if (plan.cycleStatus !== nextStatus) {
      await tx.improvementPlanRelease.update({
        where: { id: plan.id },
        data: { cycleStatus: nextStatus },
      });

      await tx.aiContextSummary.updateMany({
        where: { planReleaseId: plan.id },
        data: { cycleStatus: nextStatus },
      });
    }

    return { planReleaseId, cycleStatus: nextStatus };
  });

  if (readiness.cycleStatus === 'READY_TO_PUBLISH' && actorId) {
    const published = await publishCycle(prisma, planReleaseId, actorId);
    return { ...readiness, cycleStatus: 'PUBLISHED', published };
  }

  return readiness;
}

export async function rejectCycleProposal(
  prisma: PrismaService,
  planReleaseId: string,
  actorId: string,
  rejectionReason = 'Proposta ciclo rifiutata',
) {
  if (!planReleaseId) {
    throw new BadRequestException('ID rilascio allenamento mancante');
  }
  if (!actorId) {
    throw new BadRequestException('ID attore mancante');
  }

  return prisma.$transaction(async (tx) => {
    const plan = await tx.improvementPlanRelease.findUnique({
      where: { id: planReleaseId },
      select: {
        id: true,
        userId: true,
        status: true,
      },
    });

    if (!plan) {
      throw new BadRequestException('Rilascio allenamento non trovato');
    }

    if (plan.status === 'REJECTED') {
      return { planReleaseId, status: 'REJECTED', cycleStatus: 'CLOSED' };
    }

    if (plan.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        'Il rilascio allenamento non e in approvazione',
      );
    }

    const rejectedAt = new Date();

    await tx.improvementPlanRelease.update({
      where: { id: plan.id },
      data: {
        status: 'REJECTED',
        cycleStatus: 'CLOSED',
      },
    });

    await tx.planItem.updateMany({
      where: { planReleaseId: plan.id, status: 'PROPOSED' },
      data: {
        status: 'REJECTED',
        approvedByProfessionalId: actorId,
        rejectedAt,
        rejectionReason,
      },
    });

    await tx.questionSet.updateMany({
      where: { planReleaseId: plan.id, status: 'PENDING_APPROVAL' },
      data: { status: 'REJECTED' },
    });

    await tx.questionSetAreaApproval.updateMany({
      where: {
        status: 'PENDING',
        questionSet: { planReleaseId: plan.id },
      },
      data: {
        status: 'REJECTED',
        approvedByProfessionalId: actorId,
        rejectedAt,
        rejectionReason,
      },
    });

    await tx.aiContextSummary.updateMany({
      where: { planReleaseId: plan.id },
      data: { cycleStatus: 'CLOSED' },
    });

    await tx.cycleAuditLog.create({
      data: {
        userId: plan.userId,
        planReleaseId: plan.id,
        action: 'REJECT',
        actorId,
      },
    });

    return { planReleaseId, status: 'REJECTED', cycleStatus: 'CLOSED' };
  });
}
