import { Prisma } from '@prisma/client';
import {
  buildTrainingPlanItems,
  buildTrainingQuestions,
} from './cycle-guidance';
import { CycleProposal } from './proposal-provider.service';

/** Existing persistence shared by initial and subsequent lifecycle commands. */
export async function persistTrainingProposal(
  tx: Prisma.TransactionClient,
  proposal: CycleProposal,
  input: {
    userId: string;
    releaseId: string;
    previousReleaseId?: string;
    coachId: string;
    specializationId: string;
    actorId?: string;
    approvalMode: string;
  },
) {
  const { userId } = input;
  const trainingContext = input;
  const previousSnapshot = await tx.performanceProfileSnapshot.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  const lastPlan = await tx.trainingPlanRelease.findFirst({
    where: { userId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const nextVersion = (lastPlan?.version ?? 0) + 1;

  const trainingPlan = await tx.trainingPlanRelease.create({
    data: {
      userId,
      specializationId: trainingContext.specializationId,
      version: nextVersion,
      status: 'PENDING_APPROVAL',
      cycleStatus: 'PROPOSED',
      generatedBy: 'AI',
      summaryText: proposal.summaryText,
      outputJson: proposal.audit.outputJson as Prisma.InputJsonObject,
      provider: proposal.provider,
      model: proposal.model,
      promptVersion: proposal.promptVersion,
      promptHash: proposal.promptHash,
      sourceSnapshotId: previousSnapshot?.id ?? null,
      proposedByAdminId: input.actorId,
      id: input.releaseId,
      lifecycleManaged: true,
      previousReleaseId: input.previousReleaseId,
      approvalMode: input.approvalMode,
      items: { create: buildTrainingPlanItems(proposal) },
    },
    select: { id: true, version: true },
  });

  const questionSet = await tx.trainingQuestionSet.create({
    data: {
      userId,
      trainingPlanReleaseId: trainingPlan.id,
      specializationId: trainingContext.specializationId,
      type: 'AI_TRAINING',
      status: 'PENDING_APPROVAL',
      questions: { create: buildTrainingQuestions(proposal) },
      approvals: {
        create: {
          coachId: trainingContext.coachId,
          status: 'PENDING',
        },
      },
    },
    select: { id: true },
  });

  await tx.aiContextSummary.create({
    data: {
      userId,
      summaryText: proposal.summaryText,
      summaryJson: {
        trainingPlanReleaseId: trainingPlan.id,
        trainingQuestionSetId: questionSet.id,
        specializationId: trainingContext.specializationId,
        coachId: trainingContext.coachId,
        provider: proposal.provider,
        model: proposal.model,
        promptVersion: proposal.promptVersion,
        planVersion: trainingPlan.version,
        humanReviewRequired: input.approvalMode === 'MANUAL',
      },
      cycleStatus: 'PROPOSED',
    },
  });

  await tx.aiProposalAudit.create({
    data: {
      userId,
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

  return {
    trainingPlanReleaseId: trainingPlan.id,
    trainingQuestionSetId: questionSet.id,
  };
}
