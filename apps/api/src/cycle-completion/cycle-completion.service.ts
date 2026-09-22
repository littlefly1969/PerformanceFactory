import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LifecycleCommandsService } from '../training-lifecycle/lifecycle-commands.service';
import { TrainingLifecyclePolicy } from '../training-lifecycle/training-lifecycle.policy';
@Injectable()
export class CycleCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: LifecycleCommandsService,
    private readonly policy: TrainingLifecyclePolicy,
  ) {}
  async evaluate(cycleId: string) {
    if (!this.policy.enabled) return;
    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.trainingPlanRelease.findUnique({
        where: { id: cycleId },
        select: { userId: true },
      });
      if (!owner) return;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`training:${owner.userId}`}))`;
      const plan = await tx.trainingPlanRelease.findUniqueOrThrow({
        where: { id: cycleId },
        include: { sessions: true, items: true, questionSets: true },
      });
      if (
        !plan.lifecycleManaged ||
        plan.status !== 'ACTIVE' ||
        plan.cycleStatus !== 'PUBLISHED'
      )
        return;
      if (
        !plan.sessions.length ||
        plan.sessions.length !== plan.items.length ||
        plan.sessions.some((s) => s.status === 'SCHEDULED') ||
        plan.items.some((i) => !['COMPLETED', 'SKIPPED'].includes(i.status)) ||
        plan.questionSets.some((q) => q.status !== 'CLOSED')
      )
        return;
      await tx.trainingPlanRelease.update({
        where: { id: cycleId },
        data: {
          status: 'CLOSED',
          cycleStatus: 'CLOSED',
          archivedAt: new Date(),
        },
      });
      await tx.aiContextSummary.updateMany({
        where: {
          userId: plan.userId,
          summaryJson: { path: ['trainingPlanReleaseId'], equals: cycleId },
        },
        data: { cycleStatus: 'CLOSED' },
      });
      await tx.cycleAuditLog.create({
        data: {
          userId: plan.userId,
          trainingPlanReleaseId: cycleId,
          action: 'CYCLE_CLOSED',
          source: 'SYSTEM',
          metadata: {
            completed: plan.sessions.filter((s) => s.status === 'COMPLETED')
              .length,
            skipped: plan.sessions.filter((s) => s.status === 'SKIPPED').length,
          },
        },
      });
      // Durable outbox command is committed with closure; no AI call inside this transaction.
      if (this.policy.autoContinue)
        return this.commands.enqueue(tx, plan.userId, cycleId);
    });
  }
}
