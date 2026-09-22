import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { OrchestratorService } from '../ai-orchestrator/orchestrator.service';
import { AbacService } from '../common/policies/abac.service';
import { PrismaService } from '../prisma/prisma.service';
import { Actor } from './professional-model';

export async function approveTrainingQuestionSet(
  abac: AbacService,
  prisma: PrismaService,
  orchestrator: OrchestratorService,
  actor: Actor,
  questionSetId: string,
  approvalId?: string,
) {
  if (actor.role !== UserRole.PROFESSIONAL) {
    throw new ForbiddenException('Solo gli allenatori possono approvare');
  }

  const approval = await findTrainingApproval(
    prisma,
    actor.id,
    questionSetId,
    approvalId,
  );

  if (approval.status !== 'PENDING') {
    throw new BadRequestException('Approvazione gia decisa');
  }
  if (approval.questionSet.status !== 'PENDING_APPROVAL') {
    throw new BadRequestException('Il questionario non e in approvazione');
  }

  const allowed = await abac.canCoachAccessUserSpecialization(
    actor.id,
    approval.questionSet.userId,
    approval.questionSet.specializationId,
  );
  if (!allowed) {
    throw new ForbiddenException(
      'Operazione non consentita per questo allenamento',
    );
  }

  const updated = await prisma.trainingQuestionSetCoachApproval
    .update({
      where: {
        id: approval.id,
        status: 'PENDING',
        questionSet: { status: 'PENDING_APPROVAL' },
      },
      data: {
        status: 'APPROVED',
        approvalSource: 'PROFESSIONAL',
        approvedByCoachId: actor.id,
        approvedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
      },
      select: { id: true, status: true, trainingQuestionSetId: true },
    })
    .catch(trainingReviewConflict);

  await orchestrator.refreshTrainingReadiness(
    approval.questionSet.trainingPlanReleaseId,
    actor.id,
  );

  return updated;
}

export async function rejectTrainingQuestionSet(
  abac: AbacService,
  prisma: PrismaService,
  orchestrator: OrchestratorService,
  actor: Actor,
  questionSetId: string,
  rejectionReason: string,
  approvalId?: string,
) {
  if (actor.role !== UserRole.PROFESSIONAL) {
    throw new ForbiddenException('Solo gli allenatori possono rifiutare');
  }
  if (!rejectionReason) {
    throw new BadRequestException('Motivo del rifiuto mancante');
  }

  const approval = await findTrainingApproval(
    prisma,
    actor.id,
    questionSetId,
    approvalId,
  );

  if (approval.status !== 'PENDING') {
    throw new BadRequestException('Approvazione gia decisa');
  }
  if (approval.questionSet.status !== 'PENDING_APPROVAL') {
    throw new BadRequestException('Il questionario non e in approvazione');
  }

  const allowed = await abac.canCoachAccessUserSpecialization(
    actor.id,
    approval.questionSet.userId,
    approval.questionSet.specializationId,
  );
  if (!allowed) {
    throw new ForbiddenException(
      'Operazione non consentita per questo allenamento',
    );
  }

  const updated = await prisma.trainingQuestionSetCoachApproval
    .update({
      where: {
        id: approval.id,
        status: 'PENDING',
        questionSet: { status: 'PENDING_APPROVAL' },
      },
      data: {
        status: 'REJECTED',
        approvedByCoachId: actor.id,
        rejectedAt: new Date(),
        rejectionReason,
      },
      select: { id: true, status: true, trainingQuestionSetId: true },
    })
    .catch(trainingReviewConflict);

  await orchestrator.rejectTrainingProposal(
    approval.questionSet.trainingPlanReleaseId,
    actor.id,
    rejectionReason,
  );

  return updated;
}

export async function approveTrainingPlanItem(
  prisma: PrismaService,
  abac: AbacService,
  orchestrator: OrchestratorService,
  actor: Actor,
  planItemId: string,
) {
  if (actor.role !== UserRole.PROFESSIONAL) {
    throw new ForbiddenException('Solo gli allenatori possono approvare');
  }

  const planItem = await prisma.trainingPlanItem.findUnique({
    where: { id: planItemId },
    select: {
      id: true,
      status: true,
      trainingPlanReleaseId: true,
      trainingPlanRelease: {
        select: {
          userId: true,
          status: true,
          specializationId: true,
        },
      },
    },
  });

  if (!planItem) {
    throw new NotFoundException('Esercizio allenamento non trovato');
  }
  if (planItem.status !== 'PROPOSED') {
    throw new BadRequestException('Esercizio allenamento gia deciso');
  }
  if (planItem.trainingPlanRelease.status !== 'PENDING_APPROVAL') {
    throw new BadRequestException('L allenamento non e in approvazione');
  }

  const allowed = await abac.canCoachAccessUserSpecialization(
    actor.id,
    planItem.trainingPlanRelease.userId,
    planItem.trainingPlanRelease.specializationId,
  );
  if (!allowed) {
    throw new ForbiddenException(
      'Operazione non consentita per questo allenamento',
    );
  }

  const updated = await prisma.trainingPlanItem
    .update({
      where: {
        id: planItem.id,
        status: 'PROPOSED',
        trainingPlanRelease: { status: 'PENDING_APPROVAL' },
      },
      data: {
        status: 'APPROVED',
        approvalSource: 'PROFESSIONAL',
        approvedByCoachId: actor.id,
        approvedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
      },
      select: { id: true, status: true },
    })
    .catch(trainingReviewConflict);

  await orchestrator.refreshTrainingReadiness(
    planItem.trainingPlanReleaseId,
    actor.id,
  );

  return updated;
}

export async function rejectTrainingPlanItem(
  prisma: PrismaService,
  abac: AbacService,
  orchestrator: OrchestratorService,
  actor: Actor,
  planItemId: string,
  rejectionReason: string,
) {
  if (actor.role !== UserRole.PROFESSIONAL) {
    throw new ForbiddenException('Solo gli allenatori possono rifiutare');
  }
  if (!rejectionReason) {
    throw new BadRequestException('Motivo del rifiuto mancante');
  }

  const planItem = await prisma.trainingPlanItem.findUnique({
    where: { id: planItemId },
    select: {
      id: true,
      status: true,
      trainingPlanReleaseId: true,
      trainingPlanRelease: {
        select: {
          userId: true,
          status: true,
          specializationId: true,
        },
      },
    },
  });

  if (!planItem) {
    throw new NotFoundException('Esercizio allenamento non trovato');
  }
  if (planItem.status !== 'PROPOSED') {
    throw new BadRequestException('Esercizio allenamento gia deciso');
  }
  if (planItem.trainingPlanRelease.status !== 'PENDING_APPROVAL') {
    throw new BadRequestException('L allenamento non e in approvazione');
  }

  const allowed = await abac.canCoachAccessUserSpecialization(
    actor.id,
    planItem.trainingPlanRelease.userId,
    planItem.trainingPlanRelease.specializationId,
  );
  if (!allowed) {
    throw new ForbiddenException(
      'Operazione non consentita per questo allenamento',
    );
  }

  const updated = await prisma.trainingPlanItem
    .update({
      where: {
        id: planItem.id,
        status: 'PROPOSED',
        trainingPlanRelease: { status: 'PENDING_APPROVAL' },
      },
      data: {
        status: 'REJECTED',
        approvedByCoachId: actor.id,
        rejectedAt: new Date(),
        rejectionReason,
      },
      select: { id: true, status: true },
    })
    .catch(trainingReviewConflict);

  await orchestrator.rejectTrainingProposal(
    planItem.trainingPlanReleaseId,
    actor.id,
    rejectionReason,
  );

  return updated;
}

export async function findTrainingApproval(
  prisma: PrismaService,
  coachId: string,
  questionSetId: string,
  approvalId?: string,
) {
  if (!questionSetId) {
    throw new BadRequestException('ID questionario mancante');
  }

  const select = {
    id: true,
    status: true,
    questionSet: {
      select: {
        userId: true,
        status: true,
        specializationId: true,
        trainingPlanReleaseId: true,
      },
    },
  } satisfies Prisma.TrainingQuestionSetCoachApprovalSelect;

  const approval = approvalId
    ? await prisma.trainingQuestionSetCoachApproval.findFirst({
        where: { id: approvalId, coachId },
        select,
      })
    : await prisma.trainingQuestionSetCoachApproval.findFirst({
        where: { trainingQuestionSetId: questionSetId, coachId },
        select,
        orderBy: { id: 'asc' },
      });

  if (!approval) {
    throw new NotFoundException('Record approvazione allenatore non trovato');
  }

  return approval;
}

function trainingReviewConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  )
    throw new BadRequestException('Approvazione già decisa');
  throw error;
}
