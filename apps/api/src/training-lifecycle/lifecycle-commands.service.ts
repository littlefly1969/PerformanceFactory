import { Injectable, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  TrainingLifecyclePolicy,
  LifecycleError,
} from './training-lifecycle.policy';
import { ConsentsService } from '../consents/consents.service';

@Injectable()
export class LifecycleCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TrainingLifecyclePolicy,
    private readonly consents: ConsentsService,
  ) {}
  async assertEligible(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { onboardingAssessment: true, performanceGoal: true },
    });
    if (!user?.isActive || user.role !== 'USER')
      throw new LifecycleError('ATHLETE_UNAVAILABLE');
    if (
      user.onboardingAssessment?.status !== 'COMPLETED' ||
      !user.performanceGoal?.goalText
    )
      throw new LifecycleError('ONBOARDING_REQUIRED');
    if ((await this.consents.status(userId)).required)
      throw new LifecycleError('REQUIRED_CONSENTS_MISSING');
  }
  async enqueue(
    tx: Prisma.TransactionClient,
    userId: string,
    previousReleaseId?: string,
    actorId?: string,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`training:${userId}`}))`;
    const open = await tx.trainingPlanRelease.findFirst({
      where: {
        userId,
        cycleStatus: { not: 'CLOSED' },
        status: { in: ['ACTIVE', 'PENDING_APPROVAL'] },
      },
      orderBy: { version: 'desc' },
    });
    if (open) {
      const existing = await tx.trainingLifecycleOperation.findUnique({
        where: { releaseId: open.id },
      });
      if (existing) return existing;
      // Adopt an existing release without regenerating its content.
      await tx.trainingPlanRelease.update({
        where: { id: open.id },
        data: { lifecycleManaged: true },
      });
      return tx.trainingLifecycleOperation.create({
        data: {
          userId,
          generationKey: `${userId}:ADOPT:${open.id}`,
          releaseId: open.id,
          approvalMode: this.policy.approvalMode,
          requestedById: actorId,
          ...(open.status === 'ACTIVE' ? { completedAt: new Date() } : {}),
        },
      });
    }
    if (previousReleaseId) {
      const previous = await tx.trainingPlanRelease.findFirst({
        where: {
          id: previousReleaseId,
          userId,
          status: 'CLOSED',
          cycleStatus: 'CLOSED',
        },
      });
      if (!previous)
        throw new ConflictException('Il ciclo precedente non è chiuso');
    }
    const generationKey = `${userId}:${previousReleaseId ?? 'INITIAL'}`;
    const operation = await tx.trainingLifecycleOperation.findUnique({
      where: { generationKey },
    });
    if (operation) return operation;
    const created = await tx.trainingLifecycleOperation.create({
      data: {
        userId,
        generationKey,
        previousReleaseId,
        requestedById: actorId,
        approvalMode: this.policy.approvalMode,
      },
    });
    await tx.cycleAuditLog.create({
      data: {
        userId,
        operationId: created.id,
        action: previousReleaseId ? 'NEXT_CYCLE_STARTED' : 'PLAN_REQUESTED',
        source: actorId ? 'USER' : 'SYSTEM',
        actorId,
        metadata: { previousReleaseId: previousReleaseId ?? null },
      },
    });
    return created;
  }
}
