import { TrainingLifecycleOrchestrator } from '../training-lifecycle/training-lifecycle.orchestrator';
import { TrainingContextService } from '../training-context/training-context.service';
import { TrainingPublicationService } from '../training-publication/training-publication.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  previewCycleProposalInput,
  runCycleForArea,
  runProposalBatch,
} from './cycle-generation';
import {
  publishCycle,
  refreshCycleReadiness,
  rejectCycleProposal,
} from './cycle-publication';
import { AreaRecord } from './orchestrator-model';
import {
  createSnapshotFromQuestionSet,
  createSnapshotFromQuestionSetInTransaction,
} from './performance-snapshots';
import { AiProposalProviderService } from './proposal-provider.service';
import {
  refreshTrainingReadiness,
  rejectTrainingProposal,
} from './training-publication';
export * from './orchestrator-model';

@Injectable()
export class OrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProposalProvider: AiProposalProviderService,
    private readonly lifecycle: TrainingLifecycleOrchestrator,
    private readonly trainingContext: TrainingContextService,
    private readonly trainingPublication: TrainingPublicationService,
  ) {}
  async runProposalBatch(
    userIds: string[],
    actorId: string,
    areaId?: string,
    runAllAreas = true,
  ) {
    return runProposalBatch(
      this.prisma,
      this.aiProposalProvider,
      userIds,
      actorId,
      areaId,
      runAllAreas,
    );
  }

  async runCycleForArea(
    userId: string,
    area: AreaRecord,
    actorId: string,
    reason = 'Ciclo AI generato',
  ) {
    return runCycleForArea(
      this.aiProposalProvider,
      this.prisma,
      userId,
      area,
      actorId,
      reason,
    );
  }

  async previewCycleProposalInput(
    userId: string,
    areaId: string,
    reason = 'Ciclo AI generato',
  ) {
    return previewCycleProposalInput(
      this.aiProposalProvider,
      this.prisma,
      userId,
      areaId,
      reason,
    );
  }

  async runTrainingPlanBatch(userIds: string[], actorId: string) {
    if (!actorId || !userIds?.length)
      throw new BadRequestException('ID attore e utenti richiesti');
    const results = [];
    for (const userId of userIds) {
      const state = await this.lifecycle.requestPlan(userId, actorId);
      results.push({
        userId,
        trainingPlanReleaseId: state.cycleId,
        status: state.status,
      });
    }
    return results;
  }

  async previewTrainingProposalInput(userId: string) {
    return this.aiProposalProvider.buildCycleProposalPreview(
      await this.trainingContext.build(userId),
    );
  }

  async publishCycle(planReleaseId: string, actorId: string) {
    return publishCycle(this.prisma, planReleaseId, actorId);
  }

  async createSnapshotFromQuestionSet(questionSetId: string, reason: string) {
    return createSnapshotFromQuestionSet(this.prisma, questionSetId, reason);
  }

  async createSnapshotFromQuestionSetInTransaction(
    tx: Prisma.TransactionClient,
    questionSetId: string,
    reason: string,
  ) {
    return createSnapshotFromQuestionSetInTransaction(
      tx,
      questionSetId,
      reason,
    );
  }

  async refreshCycleReadiness(planReleaseId: string, actorId?: string) {
    return refreshCycleReadiness(this.prisma, planReleaseId, actorId);
  }

  async refreshTrainingReadiness(
    trainingPlanReleaseId: string,
    actorId?: string,
  ) {
    return refreshTrainingReadiness(
      this.prisma,
      trainingPlanReleaseId,
      actorId,
    );
  }

  async rejectTrainingProposal(
    trainingPlanReleaseId: string,
    actorId: string,
    rejectionReason = 'Allenamento rifiutato',
  ) {
    return rejectTrainingProposal(
      this.prisma,
      trainingPlanReleaseId,
      actorId,
      rejectionReason,
    );
  }

  async publishTrainingPlan(trainingPlanReleaseId: string, actorId: string) {
    return this.trainingPublication.publishIfReady(
      trainingPlanReleaseId,
      actorId,
    );
  }

  async rejectCycleProposal(
    planReleaseId: string,
    actorId: string,
    rejectionReason = 'Proposta ciclo rifiutata',
  ) {
    return rejectCycleProposal(
      this.prisma,
      planReleaseId,
      actorId,
      rejectionReason,
    );
  }
}
