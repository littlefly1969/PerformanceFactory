import { Injectable } from '@nestjs/common';
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
  previewTrainingProposalInput,
  runTrainingPlanBatch,
} from './training-generation';
import {
  publishTrainingPlan,
  refreshTrainingReadiness,
  rejectTrainingProposal,
} from './training-publication';
export * from './orchestrator-model';

@Injectable()
export class OrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProposalProvider: AiProposalProviderService,
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
    return runTrainingPlanBatch(
      this.aiProposalProvider,
      this.prisma,
      userIds,
      actorId,
    );
  }

  async previewTrainingProposalInput(userId: string) {
    return previewTrainingProposalInput(
      this.aiProposalProvider,
      this.prisma,
      userId,
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
    return publishTrainingPlan(this.prisma, trainingPlanReleaseId, actorId);
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
