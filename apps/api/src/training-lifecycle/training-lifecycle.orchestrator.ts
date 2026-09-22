import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CoachAssignmentService } from '../coach-assignment/coach-assignment.service';
import { TrainingContextService } from '../training-context/training-context.service';
import { TrainingGenerationService } from '../training-generation/training-generation.service';
import { TrainingApprovalService } from '../training-approval/training-approval.service';
import { TrainingPublicationService } from '../training-publication/training-publication.service';
import { CycleCompletionService } from '../cycle-completion/cycle-completion.service';
import { LifecycleCommandsService } from './lifecycle-commands.service';
import {
  TrainingLifecyclePolicy,
  LifecycleError,
} from './training-lifecycle.policy';

@Injectable()
export class TrainingLifecycleOrchestrator
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TrainingLifecycleOrchestrator.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TrainingLifecyclePolicy,
    private readonly commands: LifecycleCommandsService,
    private readonly coach: CoachAssignmentService,
    private readonly context: TrainingContextService,
    private readonly generation: TrainingGenerationService,
    private readonly approval: TrainingApprovalService,
    private readonly publication: TrainingPublicationService,
    private readonly completion: CycleCompletionService,
  ) {}
  onApplicationBootstrap() {
    void this.policy.approvalMode; // Fail fast for unsupported policy, rather than silently approving.
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.TRAINING_LIFECYCLE_WORKER === 'false'
    )
      return;
    this.timer = setInterval(() => {
      void this.drain().catch((e) =>
        this.logger.error(
          e instanceof Error ? e.message : 'Lifecycle worker failed',
        ),
      );
    }, 15000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async requestPlan(userId: string, actorId = userId) {
    if (!this.policy.enabled)
      throw new ServiceUnavailableException(
        'Preparazione automatica temporaneamente non disponibile',
      );
    await this.commands.assertEligible(userId);
    await this.prisma.$transaction(async (tx) => {
      const latest = await tx.trainingPlanRelease.findFirst({
        where: { userId },
        orderBy: { version: 'desc' },
      });
      const operation = await this.commands.enqueue(
        tx,
        userId,
        latest?.status === 'CLOSED' ? latest.id : undefined,
        actorId,
      );
      if (!operation.completedAt)
        await tx.trainingLifecycleOperation.update({
          where: { id: operation.id },
          data: { nextAttemptAt: new Date() },
        });
    });
    return this.current(userId);
  }
  async continueAfterCycle(userId: string, closedCycleId: string) {
    if (!this.policy.enabled || !this.policy.autoContinue)
      return this.current(userId);
    await this.prisma.$transaction((tx) =>
      this.commands.enqueue(tx, userId, closedCycleId),
    );
    return this.current(userId);
  }
  async resumeLifecycle(operationId: string) {
    if (!this.policy.enabled) return;
    const leaseToken = randomUUID();
    const claimed = await this.prisma.trainingLifecycleOperation.updateMany({
      where: {
        id: operationId,
        completedAt: null,
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: {
        leaseToken,
        leaseUntil: new Date(Date.now() + 90000),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) return;
    const heartbeat = setInterval(() => {
      void this.prisma.trainingLifecycleOperation
        .updateMany({
          where: { id: operationId, leaseToken },
          data: { leaseUntil: new Date(Date.now() + 90000) },
        })
        .catch(() => {});
    }, 10000);
    heartbeat.unref();
    try {
      await this.generateAndPublishCycle(operationId, leaseToken);
    } finally {
      clearInterval(heartbeat);
    }
  }
  private async generateAndPublishCycle(
    operationId: string,
    leaseToken: string,
  ) {
    const operation =
      await this.prisma.trainingLifecycleOperation.findUniqueOrThrow({
        where: { id: operationId },
      });
    let stage = 'AI_GENERATION_FAILED';
    try {
      await this.commands.assertEligible(operation.userId);
      const coach = await this.coach.ensureAssigned(
        operation.userId,
        operation.id,
      );
      let releaseId = operation.releaseId;
      if (!releaseId) {
        await this.prisma.cycleAuditLog.create({
          data: {
            userId: operation.userId,
            operationId,
            coachId: coach.coachId,
            action: 'AI_GENERATION_STARTED',
            source: 'SYSTEM',
            metadata: { attempt: operation.attempts },
          },
        });
        const context = await this.context.build(
          operation.userId,
          operation.previousReleaseId ?? undefined,
        );
        releaseId = await this.generation.generateCycle(
          operation,
          coach,
          context,
          leaseToken,
        );
      }
      stage = 'APPROVAL_FAILED';
      const release = await this.prisma.trainingPlanRelease.findUniqueOrThrow({
        where: { id: releaseId },
      });
      if (release.cycleStatus === 'CLOSED' && release.status !== 'REJECTED') {
        await this.prisma.trainingLifecycleOperation.updateMany({
          where: { id: operationId, leaseToken },
          data: {
            completedAt: new Date(),
            lastErrorCode: null,
            leaseUntil: null,
            leaseToken: null,
          },
        });
        return;
      }
      if (release.status === 'REJECTED') {
        await this.prisma.trainingLifecycleOperation.updateMany({
          where: { id: operationId, leaseToken },
          data: {
            completedAt: new Date(),
            lastErrorCode: 'REVIEW_REJECTED',
            leaseUntil: null,
            leaseToken: null,
          },
        });
        return;
      }
      await this.approval.process(releaseId, operation.approvalMode);
      stage = 'PUBLICATION_FAILED';
      const published = await this.publication.publishIfReady(releaseId);
      await this.prisma.trainingLifecycleOperation.updateMany({
        where: { id: operationId, leaseToken },
        data: {
          completedAt:
            published.cycleStatus === 'PUBLISHED' ? new Date() : null,
          nextAttemptAt: new Date(Date.now() + 60000),
          lastErrorCode: null,
          leaseToken: null,
          leaseUntil: null,
        },
      });
    } catch (error) {
      if (error instanceof LifecycleError && error.code === 'LEASE_LOST')
        return;
      const response =
        error instanceof HttpException ? error.getResponse() : null;
      const code =
        error instanceof LifecycleError
          ? error.code
          : response && typeof response === 'object' && 'code' in response
            ? String(response.code)
            : stage === 'AI_GENERATION_FAILED' &&
                error instanceof HttpException &&
                error.getStatus() === 400 &&
                /validazione|output|schema/i.test(error.message)
              ? 'INVALID_AI_OUTPUT'
              : stage;
      await this.prisma.trainingLifecycleOperation.updateMany({
        where: { id: operationId, leaseToken },
        data: {
          lastErrorCode: code,
          leaseToken: null,
          leaseUntil: null,
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(
                300000,
                15000 * 2 ** Math.min(operation.attempts - 1, 5),
              ),
          ),
        },
      });
      this.logger.warn(
        `Training operation ${operationId}: ${code}; retry scheduled`,
      );
    }
  }
  async approveManual(releaseId: string, actor: { id: string; role: string }) {
    await this.approval.approveManual(releaseId, actor);
    return this.publication.publishIfReady(releaseId, actor.id);
  }
  async coachPlans(actor: { id: string; role: string }) {
    const links = await this.prisma.coachUserLink.findMany({
      where: { coachId: actor.id },
      select: { userId: true, specializationId: true },
    });
    return this.prisma.trainingPlanRelease.findMany({
      where: actor.role === 'ADMIN' ? {} : { OR: links },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        version: true,
        status: true,
        cycleStatus: true,
        approvalMode: true,
        approvalSource: true,
        summaryText: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        items: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            title: true,
            body: true,
            status: true,
            completionNotes: true,
            completionRating: true,
          },
        },
      },
    });
  }
  async current(userId: string) {
    const [operation, release] = await Promise.all([
      this.prisma.trainingLifecycleOperation.findFirst({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.trainingPlanRelease.findFirst({
        where: { userId },
        orderBy: { version: 'desc' },
        include: { sessions: { select: { status: true } } },
      }),
    ]);
    const preparing =
      operation &&
      !operation.completedAt &&
      operation.releaseId !== release?.id;
    const error = operation?.lastErrorCode;
    const status = error
      ? 'ERROR'
      : preparing
        ? 'PREPARING'
        : !release
          ? operation
            ? 'PREPARING'
            : 'EMPTY'
          : release.status === 'REJECTED'
            ? 'ERROR'
            : release.cycleStatus === 'CLOSED'
              ? 'COMPLETED'
              : release.cycleStatus !== 'PUBLISHED'
                ? 'PREPARING'
                : release.sessions.some((s) => s.status !== 'SCHEDULED')
                  ? 'IN_PROGRESS'
                  : 'READY';
    return {
      cycleId: preparing || !release ? (operation?.id ?? null) : release.id,
      status,
      phase:
        status === 'PREPARING' ? 'GENERATING' : (release?.cycleStatus ?? null),
      preparingNext: Boolean(
        operation?.previousReleaseId && !operation.completedAt,
      ),
      errorCode: error ?? null,
      retryScheduled: Boolean(error && !operation?.completedAt),
      nextRetryAt:
        error && !operation?.completedAt ? operation?.nextAttemptAt : null,
      requestAllowed:
        this.policy.enabled &&
        (status === 'EMPTY' ||
          status === 'COMPLETED' ||
          (status === 'ERROR' && error !== 'REVIEW_REJECTED')),
    };
  }
  /** Durable retries and closure recovery also work after API process restarts. */
  async drain() {
    if (this.draining || !this.policy.enabled) return;
    this.draining = true;
    try {
      const active = await this.prisma.trainingPlanRelease.findMany({
        where: {
          lifecycleManaged: true,
          status: 'ACTIVE',
          cycleStatus: 'PUBLISHED',
          sessions: { some: {}, none: { status: 'SCHEDULED' } },
          questionSets: { none: { status: { not: 'CLOSED' } } },
        },
        select: { id: true },
        take: 25,
      });
      for (const cycle of active) await this.completion.evaluate(cycle.id);
      const pending = await this.prisma.trainingLifecycleOperation.findMany({
        where: {
          completedAt: null,
          nextAttemptAt: { lte: new Date() },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: 10,
      });
      for (const operation of pending) await this.resumeLifecycle(operation.id);
    } finally {
      this.draining = false;
    }
  }
}
