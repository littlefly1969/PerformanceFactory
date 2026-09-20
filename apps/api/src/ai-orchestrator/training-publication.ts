import { createTrainingSessions } from '../athlete/training-sessions';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export async function refreshTrainingReadiness(
  prisma: PrismaService,
  trainingPlanReleaseId: string,
  actorId?: string,
) {
  if (!trainingPlanReleaseId) {
    throw new BadRequestException('ID allenamento mancante');
  }

  const readiness = await prisma.$transaction(async (tx) => {
    const plan = await tx.trainingPlanRelease.findUnique({
      where: { id: trainingPlanReleaseId },
      select: {
        id: true,
        userId: true,
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
      return {
        trainingPlanReleaseId,
        cycleStatus: plan?.cycleStatus ?? 'PROPOSED',
      };
    }

    const allItemsApproved =
      plan.items.length > 0 &&
      plan.items.every((item) => item.status === 'APPROVED');
    const approvals = plan.questionSets[0]?.approvals ?? [];
    const allCoachApprovals =
      approvals.length > 0 &&
      approvals.every((approval) => approval.status === 'APPROVED');

    const nextStatus =
      allItemsApproved && allCoachApprovals
        ? 'READY_TO_PUBLISH'
        : 'WAITING_APPROVALS';

    if (plan.cycleStatus !== nextStatus) {
      await tx.trainingPlanRelease.update({
        where: { id: plan.id },
        data: { cycleStatus: nextStatus },
      });

      await tx.aiContextSummary.updateMany({
        where: {
          userId: plan.userId,
          summaryJson: {
            path: ['trainingPlanReleaseId'],
            equals: plan.id,
          },
        },
        data: { cycleStatus: nextStatus },
      });
    }

    return { trainingPlanReleaseId, cycleStatus: nextStatus };
  });

  if (readiness.cycleStatus === 'READY_TO_PUBLISH' && actorId) {
    const published = await publishTrainingPlan(
      prisma,
      trainingPlanReleaseId,
      actorId,
    );
    return { ...readiness, cycleStatus: 'PUBLISHED', published };
  }

  return readiness;
}

export async function rejectTrainingProposal(
  prisma: PrismaService,
  trainingPlanReleaseId: string,
  actorId: string,
  rejectionReason = 'Allenamento rifiutato',
) {
  if (!trainingPlanReleaseId) {
    throw new BadRequestException('ID allenamento mancante');
  }
  if (!actorId) {
    throw new BadRequestException('ID attore mancante');
  }

  return prisma.$transaction(async (tx) => {
    const plan = await tx.trainingPlanRelease.findUnique({
      where: { id: trainingPlanReleaseId },
      select: { id: true, userId: true, status: true },
    });

    if (!plan) {
      throw new BadRequestException('Allenamento non trovato');
    }

    if (plan.status === 'REJECTED') {
      return {
        trainingPlanReleaseId,
        status: 'REJECTED',
        cycleStatus: 'CLOSED',
      };
    }

    if (plan.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('L allenamento non e in approvazione');
    }

    const rejectedAt = new Date();

    await tx.trainingPlanRelease.update({
      where: { id: plan.id },
      data: { status: 'REJECTED', cycleStatus: 'CLOSED' },
    });

    await tx.trainingPlanItem.updateMany({
      where: { trainingPlanReleaseId: plan.id, status: 'PROPOSED' },
      data: {
        status: 'REJECTED',
        approvedByCoachId: actorId,
        rejectedAt,
        rejectionReason,
      },
    });

    await tx.trainingQuestionSet.updateMany({
      where: { trainingPlanReleaseId: plan.id, status: 'PENDING_APPROVAL' },
      data: { status: 'REJECTED' },
    });

    await tx.trainingQuestionSetCoachApproval.updateMany({
      where: {
        status: 'PENDING',
        questionSet: { trainingPlanReleaseId: plan.id },
      },
      data: {
        status: 'REJECTED',
        approvedByCoachId: actorId,
        rejectedAt,
        rejectionReason,
      },
    });

    await tx.aiContextSummary.updateMany({
      where: {
        userId: plan.userId,
        summaryJson: {
          path: ['trainingPlanReleaseId'],
          equals: plan.id,
        },
      },
      data: { cycleStatus: 'CLOSED' },
    });

    return {
      trainingPlanReleaseId,
      status: 'REJECTED',
      cycleStatus: 'CLOSED',
    };
  });
}

export async function publishTrainingPlan(
  prisma: PrismaService,
  trainingPlanReleaseId: string,
  actorId: string,
) {
  if (!trainingPlanReleaseId) {
    throw new BadRequestException('ID allenamento mancante');
  }
  if (!actorId) {
    throw new BadRequestException('ID attore mancante');
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${trainingPlanReleaseId}))`;
    const plan = await tx.trainingPlanRelease.findUnique({
      where: { id: trainingPlanReleaseId },
      select: {
        id: true,
        userId: true,
        specializationId: true,
        publishedAt: true,
        status: true,
        items: { select: { status: true } },
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
      throw new BadRequestException('Allenamento non trovato');
    }

    if (plan.status === 'ACTIVE' && plan.publishedAt) {
      await createTrainingSessions(tx, plan.id, plan.publishedAt);
      return {
        trainingPlanReleaseId: plan.id,
        trainingQuestionSetId: plan.questionSets[0]?.id,
      };
    }
    if (plan.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('L allenamento non e in approvazione');
    }

    if (!plan.items.every((item) => item.status === 'APPROVED')) {
      throw new BadRequestException('Non tutti gli esercizi sono approvati');
    }

    const questionSet = plan.questionSets[0];
    if (!questionSet || questionSet.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Questionario allenamento mancante');
    }

    if (
      !questionSet.approvals.every((approval) => approval.status === 'APPROVED')
    ) {
      throw new BadRequestException(
        'Questionario non approvato dall allenatore',
      );
    }

    const publishedAt = new Date();
    await tx.trainingPlanRelease.updateMany({
      where: { userId: plan.userId, status: 'ACTIVE' },
      data: {
        status: 'CLOSED',
        cycleStatus: 'CLOSED',
        archivedAt: new Date(),
      },
    });

    await tx.trainingPlanRelease.update({
      where: { id: plan.id },
      data: {
        status: 'ACTIVE',
        cycleStatus: 'PUBLISHED',
        publishedAt,
      },
    });

    await tx.trainingPlanItem.updateMany({
      where: { trainingPlanReleaseId: plan.id },
      data: { status: 'ACTIVE' },
    });

    await createTrainingSessions(tx, plan.id, publishedAt);

    await tx.trainingQuestionSet.update({
      where: { id: questionSet.id },
      data: { status: 'PUBLISHED', publishedAt },
    });

    await tx.aiContextSummary.updateMany({
      where: {
        userId: plan.userId,
        summaryJson: {
          path: ['trainingPlanReleaseId'],
          equals: plan.id,
        },
      },
      data: { cycleStatus: 'PUBLISHED' },
    });

    return {
      trainingPlanReleaseId: plan.id,
      trainingQuestionSetId: questionSet.id,
    };
  });
}
