import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AbacService } from '../common/policies/abac.service';
import { PrismaService } from '../prisma/prisma.service';
import { Actor } from './professional-model';

export async function getApprovalsInbox(prisma: PrismaService, actor: Actor) {
  if (actor.role !== UserRole.PROFESSIONAL) {
    throw new ForbiddenException(
      'Solo i professionisti possono accedere alla coda',
    );
  }

  const [linkedUsers, areas, coachLinks] = await Promise.all([
    prisma.professionalUserLink.findMany({
      where: { professionalId: actor.id },
      select: { userId: true, areaId: true },
    }),
    prisma.professionalAreaCompetence.findMany({
      where: { professionalId: actor.id },
      select: { areaId: true },
    }),
    prisma.coachUserLink.findMany({
      where: { coachId: actor.id },
      select: { userId: true, specializationId: true },
    }),
  ]);

  const userIds = linkedUsers.map((link) => link.userId);
  const areaIds = areas.map((area) => area.areaId);
  const coachUserIds = coachLinks.map((link) => link.userId);
  const linkedAreaFilters = linkedUsers.map((link) => ({
    areaId: link.areaId,
    planRelease: { userId: link.userId },
  }));
  const linkedTrainingFilters = coachLinks.map((link) => ({
    specializationId: link.specializationId,
    userId: link.userId,
  }));

  await Promise.all([
    ...linkedUsers.map((link) =>
      prisma.questionSetAreaApproval.updateMany({
        where: {
          areaId: link.areaId,
          status: 'PENDING',
          professionalId: { not: actor.id },
          questionSet: {
            userId: link.userId,
            status: 'PENDING_APPROVAL',
          },
        },
        data: {
          professionalId: actor.id,
          approvedByProfessionalId: null,
          approvedAt: null,
          rejectedAt: null,
          rejectionReason: null,
        },
      }),
    ),
    ...coachLinks.map((link) =>
      prisma.trainingQuestionSetCoachApproval.updateMany({
        where: {
          status: 'PENDING',
          coachId: { not: actor.id },
          questionSet: {
            userId: link.userId,
            specializationId: link.specializationId,
            status: 'PENDING_APPROVAL',
          },
        },
        data: {
          coachId: actor.id,
          approvedByCoachId: null,
          approvedAt: null,
          rejectedAt: null,
          rejectionReason: null,
        },
      }),
    ),
  ]);

  const planItems = linkedAreaFilters.length
    ? await prisma.planItem.findMany({
        where: {
          status: 'PROPOSED',
          OR: linkedAreaFilters,
          planRelease: {
            status: 'PENDING_APPROVAL',
          },
        },
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          metadata: true,
          status: true,
          area: { select: { id: true, name: true } },
          planRelease: {
            select: {
              id: true,
              version: true,
              user: { select: { id: true, email: true } },
              aiContextSummaries: {
                select: { id: true, summaryText: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      })
    : [];

  const questionApprovals = await prisma.questionSetAreaApproval.findMany({
    where: {
      professionalId: actor.id,
      status: 'PENDING',
      areaId: { in: areaIds },
      questionSet: {
        userId: { in: userIds },
        status: 'PENDING_APPROVAL',
      },
    },
    select: {
      id: true,
      status: true,
      areaId: true,
      questionSetId: true,
      professionalId: true,
      area: { select: { id: true, name: true } },
      professional: { select: { id: true, email: true } },
      questionSet: {
        select: {
          id: true,
          user: { select: { id: true, email: true } },
          planRelease: {
            select: {
              id: true,
              version: true,
              aiContextSummaries: {
                select: { id: true, summaryText: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
          questions: {
            where: { areaId: { in: areaIds } },
            select: {
              id: true,
              areaId: true,
              text: true,
              objectiveRef: true,
              orderIndex: true,
              options: { select: { id: true, label: true, score: true } },
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  const filteredQuestionApprovals = questionApprovals.map((approval) => ({
    ...approval,
    questionSet: {
      ...approval.questionSet,
      questions: approval.questionSet.questions.filter(
        (question) => question.areaId === approval.areaId,
      ),
    },
  }));

  const trainingPlanItems = linkedTrainingFilters.length
    ? await prisma.trainingPlanItem.findMany({
        where: {
          status: 'PROPOSED',
          trainingPlanRelease: {
            status: 'PENDING_APPROVAL',
            OR: linkedTrainingFilters,
          },
        },
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          metadata: true,
          status: true,
          trainingPlanRelease: {
            select: {
              id: true,
              version: true,
              user: { select: { id: true, email: true } },
              specialization: {
                select: {
                  id: true,
                  label: true,
                  sport: { select: { label: true } },
                },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      })
    : [];

  const trainingQuestionApprovals =
    await prisma.trainingQuestionSetCoachApproval.findMany({
      where: {
        coachId: actor.id,
        status: 'PENDING',
        questionSet: linkedTrainingFilters.length
          ? {
              OR: linkedTrainingFilters,
              status: 'PENDING_APPROVAL',
            }
          : {
              userId: { in: coachUserIds },
              status: 'PENDING_APPROVAL',
            },
      },
      select: {
        id: true,
        status: true,
        coachId: true,
        trainingQuestionSetId: true,
        questionSet: {
          select: {
            id: true,
            user: { select: { id: true, email: true } },
            specialization: {
              select: {
                id: true,
                label: true,
                sport: { select: { label: true } },
              },
            },
            trainingPlanRelease: {
              select: {
                id: true,
                version: true,
                summaryText: true,
              },
            },
            questions: {
              select: {
                id: true,
                text: true,
                objectiveRef: true,
                orderIndex: true,
                options: { select: { id: true, label: true, score: true } },
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    });

  return {
    planItems,
    questionApprovals: filteredQuestionApprovals,
    trainingPlanItems,
    trainingQuestionApprovals,
  };
}

export async function getCycleStatus(
  prisma: PrismaService,
  abac: AbacService,
  actor: Actor,
  cycleId: string,
) {
  if (!cycleId) {
    throw new BadRequestException('ID ciclo mancante');
  }

  const plan = await prisma.improvementPlanRelease.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      userId: true,
      cycleStatus: true,
      status: true,
      questionSets: {
        select: {
          approvals: {
            select: {
              areaId: true,
              status: true,
              area: { select: { id: true, name: true } },
            },
          },
        },
      },
      items: {
        select: {
          areaId: true,
          status: true,
          area: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!plan) {
    throw new NotFoundException('Ciclo non trovato');
  }

  if (actor.role === UserRole.PROFESSIONAL) {
    const allowed = await abac.canAccessUser(actor.id, plan.userId);
    if (!allowed) {
      throw new ForbiddenException(
        'Operazione non consentita per questo utente',
      );
    }
  }

  const approvals = plan.questionSets[0]?.approvals ?? [];
  const items = plan.items ?? [];

  const areaStatuses = approvals.map((approval) => {
    const planItem = items.find((item) => item.areaId === approval.areaId);
    return {
      areaId: approval.areaId,
      areaName: approval.area.name,
      questionApprovalStatus: approval.status,
      planItemStatus: planItem?.status ?? 'UNKNOWN',
    };
  });

  const allAreasApproved = approvals.every(
    (approval) => approval.status === 'APPROVED',
  );
  const allItemsApproved = items.every((item) => item.status === 'APPROVED');
  const globalStatus =
    allAreasApproved && allItemsApproved
      ? 'READY_TO_PUBLISH'
      : 'WAITING_APPROVALS';

  return {
    cycleId: plan.id,
    userId: plan.userId,
    cycleStatus: plan.cycleStatus,
    derivedStatus: globalStatus,
    areas: areaStatuses,
  };
}
