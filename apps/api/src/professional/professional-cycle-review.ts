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

export async function approveQuestionSet(
  prisma: PrismaService,
  abac: AbacService,
  orchestrator: OrchestratorService,
  actor: Actor,
  questionSetId: string,
  approvalId?: string,
) {
  if (actor.role !== UserRole.PROFESSIONAL) {
    throw new ForbiddenException('Solo i professionisti possono approvare');
  }

  if (!questionSetId) {
    throw new BadRequestException('ID questionario mancante');
  }

  let approval: {
    id: string;
    areaId: string;
    status: string;
    questionSet: {
      userId: string;
      status: string;
      planReleaseId: string | null;
    };
  } | null = null;

  if (approvalId) {
    approval = await prisma.questionSetAreaApproval.findFirst({
      where: { id: approvalId, professionalId: actor.id },
      select: {
        id: true,
        areaId: true,
        status: true,
        questionSet: {
          select: { userId: true, status: true, planReleaseId: true },
        },
      },
    });
  } else {
    const pending = await prisma.questionSetAreaApproval.findMany({
      where: {
        questionSetId,
        professionalId: actor.id,
        status: 'PENDING',
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    if (pending.length > 1) {
      throw new BadRequestException(
        'Piu approvazioni in attesa: specifica approvalId',
      );
    }

    if (pending.length === 1) {
      approval = await prisma.questionSetAreaApproval.findUnique({
        where: { id: pending[0].id },
        select: {
          id: true,
          areaId: true,
          status: true,
          questionSet: {
            select: { userId: true, status: true, planReleaseId: true },
          },
        },
      });
    }
  }

  if (!approval) {
    throw new NotFoundException('Record approvazione non trovato');
  }

  if (approval.status !== 'PENDING') {
    throw new BadRequestException('Approvazione gia decisa');
  }

  if (approval.questionSet.status !== 'PENDING_APPROVAL') {
    throw new BadRequestException('Il questionario non e in approvazione');
  }

  const allowed = await abac.canAccessUserArea(
    actor.id,
    approval.questionSet.userId,
    approval.areaId,
  );
  if (!allowed) {
    throw new ForbiddenException('Operazione non consentita per questa area');
  }

  const updated = await Promise.resolve(
    prisma.questionSetAreaApproval.update({
      where: {
        id: approval.id,
        status: 'PENDING',
        questionSet: { status: 'PENDING_APPROVAL' },
      },
      data: {
        status: 'APPROVED',
        approvedByProfessionalId: actor.id,
        approvedAt: new Date(),
        rejectionReason: null,
        rejectedAt: null,
      },
      select: { id: true, status: true, areaId: true, questionSetId: true },
    }),
  ).catch(abilityReviewConflict);

  if (approval.questionSet.planReleaseId) {
    await orchestrator.refreshCycleReadiness(
      approval.questionSet.planReleaseId,
      actor.id,
    );
  }

  return updated;
}

export async function rejectQuestionSet(
  prisma: PrismaService,
  abac: AbacService,
  orchestrator: OrchestratorService,
  actor: Actor,
  questionSetId: string,
  rejectionReason: string,
  approvalId?: string,
) {
  if (actor.role !== UserRole.PROFESSIONAL) {
    throw new ForbiddenException('Solo i professionisti possono rifiutare');
  }
  if (!rejectionReason) {
    throw new BadRequestException('Motivo del rifiuto mancante');
  }

  if (!questionSetId) {
    throw new BadRequestException('ID questionario mancante');
  }

  let approval: {
    id: string;
    areaId: string;
    status: string;
    questionSet: {
      userId: string;
      status: string;
      planReleaseId: string | null;
    };
  } | null = null;

  if (approvalId) {
    approval = await prisma.questionSetAreaApproval.findFirst({
      where: { id: approvalId, professionalId: actor.id },
      select: {
        id: true,
        areaId: true,
        status: true,
        questionSet: {
          select: { userId: true, status: true, planReleaseId: true },
        },
      },
    });
  } else {
    const pending = await prisma.questionSetAreaApproval.findMany({
      where: {
        questionSetId,
        professionalId: actor.id,
        status: 'PENDING',
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    if (pending.length > 1) {
      throw new BadRequestException(
        'Piu approvazioni in attesa: specifica approvalId',
      );
    }

    if (pending.length === 1) {
      approval = await prisma.questionSetAreaApproval.findUnique({
        where: { id: pending[0].id },
        select: {
          id: true,
          areaId: true,
          status: true,
          questionSet: {
            select: { userId: true, status: true, planReleaseId: true },
          },
        },
      });
    }
  }

  if (!approval) {
    throw new NotFoundException('Record approvazione non trovato');
  }

  if (approval.status !== 'PENDING') {
    throw new BadRequestException('Approvazione gia decisa');
  }

  if (approval.questionSet.status !== 'PENDING_APPROVAL') {
    throw new BadRequestException('Il questionario non e in approvazione');
  }

  const allowed = await abac.canAccessUserArea(
    actor.id,
    approval.questionSet.userId,
    approval.areaId,
  );
  if (!allowed) {
    throw new ForbiddenException('Operazione non consentita per questa area');
  }

  const updated = await Promise.resolve(
    prisma.questionSetAreaApproval.update({
      where: {
        id: approval.id,
        status: 'PENDING',
        questionSet: { status: 'PENDING_APPROVAL' },
      },
      data: {
        status: 'REJECTED',
        approvedByProfessionalId: actor.id,
        rejectedAt: new Date(),
        rejectionReason,
      },
      select: { id: true, status: true, areaId: true, questionSetId: true },
    }),
  ).catch(abilityReviewConflict);

  if (approval.questionSet.planReleaseId) {
    await orchestrator.rejectCycleProposal(
      approval.questionSet.planReleaseId,
      actor.id,
      rejectionReason,
    );
  }

  return updated;
}

export async function approvePlanItem(
  prisma: PrismaService,
  abac: AbacService,
  orchestrator: OrchestratorService,
  actor: Actor,
  planItemId: string,
) {
  if (actor.role !== UserRole.PROFESSIONAL) {
    throw new ForbiddenException('Solo i professionisti possono approvare');
  }

  const planItem = await prisma.planItem.findUnique({
    where: { id: planItemId },
    select: {
      id: true,
      status: true,
      areaId: true,
      planReleaseId: true,
      planRelease: { select: { userId: true, status: true } },
    },
  });

  if (!planItem) {
    throw new NotFoundException('Attivita allenamento non trovata');
  }

  if (planItem.status !== 'PROPOSED') {
    throw new BadRequestException('Attivita allenamento gia decisa');
  }

  if (planItem.planRelease.status !== 'PENDING_APPROVAL') {
    throw new BadRequestException(
      'Il rilascio allenamento non e in approvazione',
    );
  }

  const allowed = await abac.canAccessUserArea(
    actor.id,
    planItem.planRelease.userId,
    planItem.areaId,
  );
  if (!allowed) {
    throw new ForbiddenException(
      'Operazione non consentita per questa attivita allenamento',
    );
  }

  const updated = await Promise.resolve(
    prisma.planItem.update({
      where: {
        id: planItemId,
        status: 'PROPOSED',
        planRelease: { status: 'PENDING_APPROVAL' },
      },
      data: {
        status: 'APPROVED',
        approvedByProfessionalId: actor.id,
        approvedAt: new Date(),
        rejectionReason: null,
        rejectedAt: null,
      },
      select: { id: true, status: true, areaId: true },
    }),
  ).catch(abilityReviewConflict);

  if (planItem.planReleaseId) {
    await orchestrator.refreshCycleReadiness(planItem.planReleaseId, actor.id);
  }

  return updated;
}

export async function rejectPlanItem(
  prisma: PrismaService,
  abac: AbacService,
  orchestrator: OrchestratorService,
  actor: Actor,
  planItemId: string,
  rejectionReason: string,
) {
  if (actor.role !== UserRole.PROFESSIONAL) {
    throw new ForbiddenException('Solo i professionisti possono rifiutare');
  }
  if (!rejectionReason) {
    throw new BadRequestException('Motivo del rifiuto mancante');
  }

  const planItem = await prisma.planItem.findUnique({
    where: { id: planItemId },
    select: {
      id: true,
      status: true,
      areaId: true,
      planReleaseId: true,
      planRelease: { select: { userId: true, status: true } },
    },
  });

  if (!planItem) {
    throw new NotFoundException('Attivita allenamento non trovata');
  }

  if (planItem.status !== 'PROPOSED') {
    throw new BadRequestException('Attivita allenamento gia decisa');
  }

  if (planItem.planRelease.status !== 'PENDING_APPROVAL') {
    throw new BadRequestException(
      'Il rilascio allenamento non e in approvazione',
    );
  }

  const allowed = await abac.canAccessUserArea(
    actor.id,
    planItem.planRelease.userId,
    planItem.areaId,
  );
  if (!allowed) {
    throw new ForbiddenException(
      'Operazione non consentita per questa attivita allenamento',
    );
  }

  const updated = await Promise.resolve(
    prisma.planItem.update({
      where: {
        id: planItemId,
        status: 'PROPOSED',
        planRelease: { status: 'PENDING_APPROVAL' },
      },
      data: {
        status: 'REJECTED',
        approvedByProfessionalId: actor.id,
        rejectedAt: new Date(),
        rejectionReason,
      },
      select: { id: true, status: true, areaId: true },
    }),
  ).catch(abilityReviewConflict);

  if (planItem.planReleaseId) {
    await orchestrator.rejectCycleProposal(
      planItem.planReleaseId,
      actor.id,
      rejectionReason,
    );
  }

  return updated;
}

function abilityReviewConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  )
    throw new BadRequestException('Approvazione già decisa');
  throw error;
}
