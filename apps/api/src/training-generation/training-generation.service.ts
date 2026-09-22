import { Injectable } from '@nestjs/common';
import { TrainingLifecycleOperation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AiProposalProviderService,
  CycleProposalInput,
} from '../ai-orchestrator/proposal-provider.service';
import { persistTrainingProposal } from '../ai-orchestrator/training-generation';
import { LifecycleError } from '../training-lifecycle/training-lifecycle.policy';

@Injectable()
export class TrainingGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProposalProviderService,
  ) {}
  async generateCycle(
    operation: TrainingLifecycleOperation,
    coach: { coachId: string; specializationId: string },
    context: CycleProposalInput,
    leaseToken: string,
  ) {
    const proposal = await this.provider.generateCycleProposal(context);
    if (!proposal.planItems?.length || !proposal.questions?.length)
      throw new LifecycleError('INVALID_AI_OUTPUT');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`training:${operation.userId}`}))`;
      const owned = await tx.trainingLifecycleOperation.findFirst({
        where: { id: operation.id, leaseToken, leaseUntil: { gt: new Date() } },
      });
      if (!owned) throw new LifecycleError('LEASE_LOST');
      if (owned.releaseId) return owned.releaseId;
      const result = await persistTrainingProposal(tx, proposal, {
        userId: operation.userId,
        releaseId: operation.id,
        previousReleaseId: operation.previousReleaseId ?? undefined,
        actorId:
          operation.requestedById &&
          operation.requestedById !== operation.userId
            ? operation.requestedById
            : undefined,
        approvalMode: operation.approvalMode,
        ...coach,
      });
      await tx.trainingLifecycleOperation.update({
        where: { id: operation.id },
        data: { releaseId: result.trainingPlanReleaseId },
      });
      await tx.cycleAuditLog.create({
        data: {
          userId: operation.userId,
          operationId: operation.id,
          trainingPlanReleaseId: result.trainingPlanReleaseId,
          coachId: coach.coachId,
          action: 'AI_GENERATION_COMPLETED',
          source: 'SYSTEM',
        },
      });
      return result.trainingPlanReleaseId;
    });
  }
}
