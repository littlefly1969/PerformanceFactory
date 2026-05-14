import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AbacService } from '../common/policies/abac.service';
import { OrchestratorService } from '../ai-orchestrator/orchestrator.service';

type Actor = {
  id: string;
  role: UserRole;
};

@Injectable()
export class ProfessionalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abac: AbacService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  async getApprovalsInbox(actor: Actor) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException(
        'Solo i professionisti possono accedere alla coda',
      );
    }

    const [linkedUsers, areas, coachLinks] = await Promise.all([
      this.prisma.professionalUserLink.findMany({
        where: { professionalId: actor.id },
        select: { userId: true, areaId: true },
      }),
      this.prisma.professionalAreaCompetence.findMany({
        where: { professionalId: actor.id },
        select: { areaId: true },
      }),
      this.prisma.coachUserLink.findMany({
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
        this.prisma.questionSetAreaApproval.updateMany({
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
        this.prisma.trainingQuestionSetCoachApproval.updateMany({
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
      ? await this.prisma.planItem.findMany({
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

    const questionApprovals =
      await this.prisma.questionSetAreaApproval.findMany({
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
      ? await this.prisma.trainingPlanItem.findMany({
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
      await this.prisma.trainingQuestionSetCoachApproval.findMany({
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

  async approveQuestionSet(
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
      approval = await this.prisma.questionSetAreaApproval.findFirst({
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
      const pending = await this.prisma.questionSetAreaApproval.findMany({
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
        approval = await this.prisma.questionSetAreaApproval.findUnique({
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

    const allowed = await this.abac.canAccessUserArea(
      actor.id,
      approval.questionSet.userId,
      approval.areaId,
    );
    if (!allowed) {
      throw new ForbiddenException('Operazione non consentita per questa area');
    }

    const updated = await this.prisma.questionSetAreaApproval.update({
      where: { id: approval.id },
      data: {
        status: 'APPROVED',
        approvedByProfessionalId: actor.id,
        approvedAt: new Date(),
        rejectionReason: null,
        rejectedAt: null,
      },
      select: { id: true, status: true, areaId: true, questionSetId: true },
    });

    if (approval.questionSet.planReleaseId) {
      await this.orchestrator.refreshCycleReadiness(
        approval.questionSet.planReleaseId,
        actor.id,
      );
    }

    return updated;
  }

  async rejectQuestionSet(
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
      approval = await this.prisma.questionSetAreaApproval.findFirst({
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
      const pending = await this.prisma.questionSetAreaApproval.findMany({
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
        approval = await this.prisma.questionSetAreaApproval.findUnique({
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

    const allowed = await this.abac.canAccessUserArea(
      actor.id,
      approval.questionSet.userId,
      approval.areaId,
    );
    if (!allowed) {
      throw new ForbiddenException('Operazione non consentita per questa area');
    }

    const updated = await this.prisma.questionSetAreaApproval.update({
      where: { id: approval.id },
      data: {
        status: 'REJECTED',
        approvedByProfessionalId: actor.id,
        rejectedAt: new Date(),
        rejectionReason,
      },
      select: { id: true, status: true, areaId: true, questionSetId: true },
    });

    if (approval.questionSet.planReleaseId) {
      await this.orchestrator.rejectCycleProposal(
        approval.questionSet.planReleaseId,
        actor.id,
        rejectionReason,
      );
    }

    return updated;
  }

  async approvePlanItem(actor: Actor, planItemId: string) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException('Solo i professionisti possono approvare');
    }

    const planItem = await this.prisma.planItem.findUnique({
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

    const allowed = await this.abac.canAccessUserArea(
      actor.id,
      planItem.planRelease.userId,
      planItem.areaId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Operazione non consentita per questa attivita allenamento',
      );
    }

    const updated = await this.prisma.planItem.update({
      where: { id: planItemId },
      data: {
        status: 'APPROVED',
        approvedByProfessionalId: actor.id,
        approvedAt: new Date(),
        rejectionReason: null,
        rejectedAt: null,
      },
      select: { id: true, status: true, areaId: true },
    });

    if (planItem.planReleaseId) {
      await this.orchestrator.refreshCycleReadiness(
        planItem.planReleaseId,
        actor.id,
      );
    }

    return updated;
  }

  async rejectPlanItem(
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

    const planItem = await this.prisma.planItem.findUnique({
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

    const allowed = await this.abac.canAccessUserArea(
      actor.id,
      planItem.planRelease.userId,
      planItem.areaId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Operazione non consentita per questa attivita allenamento',
      );
    }

    const updated = await this.prisma.planItem.update({
      where: { id: planItemId },
      data: {
        status: 'REJECTED',
        approvedByProfessionalId: actor.id,
        rejectedAt: new Date(),
        rejectionReason,
      },
      select: { id: true, status: true, areaId: true },
    });

    if (planItem.planReleaseId) {
      await this.orchestrator.rejectCycleProposal(
        planItem.planReleaseId,
        actor.id,
        rejectionReason,
      );
    }

    return updated;
  }

  async approveTrainingQuestionSet(
    actor: Actor,
    questionSetId: string,
    approvalId?: string,
  ) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException('Solo gli allenatori possono approvare');
    }

    const approval = await this.findTrainingApproval(
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

    const allowed = await this.abac.canCoachAccessUserSpecialization(
      actor.id,
      approval.questionSet.userId,
      approval.questionSet.specializationId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Operazione non consentita per questo allenamento',
      );
    }

    const updated = await this.prisma.trainingQuestionSetCoachApproval.update({
      where: { id: approval.id },
      data: {
        status: 'APPROVED',
        approvedByCoachId: actor.id,
        approvedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
      },
      select: { id: true, status: true, trainingQuestionSetId: true },
    });

    await this.orchestrator.refreshTrainingReadiness(
      approval.questionSet.trainingPlanReleaseId,
      actor.id,
    );

    return updated;
  }

  async rejectTrainingQuestionSet(
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

    const approval = await this.findTrainingApproval(
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

    const allowed = await this.abac.canCoachAccessUserSpecialization(
      actor.id,
      approval.questionSet.userId,
      approval.questionSet.specializationId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Operazione non consentita per questo allenamento',
      );
    }

    const updated = await this.prisma.trainingQuestionSetCoachApproval.update({
      where: { id: approval.id },
      data: {
        status: 'REJECTED',
        approvedByCoachId: actor.id,
        rejectedAt: new Date(),
        rejectionReason,
      },
      select: { id: true, status: true, trainingQuestionSetId: true },
    });

    await this.orchestrator.rejectTrainingProposal(
      approval.questionSet.trainingPlanReleaseId,
      actor.id,
      rejectionReason,
    );

    return updated;
  }

  async approveTrainingPlanItem(actor: Actor, planItemId: string) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException('Solo gli allenatori possono approvare');
    }

    const planItem = await this.prisma.trainingPlanItem.findUnique({
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

    const allowed = await this.abac.canCoachAccessUserSpecialization(
      actor.id,
      planItem.trainingPlanRelease.userId,
      planItem.trainingPlanRelease.specializationId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Operazione non consentita per questo allenamento',
      );
    }

    const updated = await this.prisma.trainingPlanItem.update({
      where: { id: planItem.id },
      data: {
        status: 'APPROVED',
        approvedByCoachId: actor.id,
        approvedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
      },
      select: { id: true, status: true },
    });

    await this.orchestrator.refreshTrainingReadiness(
      planItem.trainingPlanReleaseId,
      actor.id,
    );

    return updated;
  }

  async rejectTrainingPlanItem(
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

    const planItem = await this.prisma.trainingPlanItem.findUnique({
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

    const allowed = await this.abac.canCoachAccessUserSpecialization(
      actor.id,
      planItem.trainingPlanRelease.userId,
      planItem.trainingPlanRelease.specializationId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Operazione non consentita per questo allenamento',
      );
    }

    const updated = await this.prisma.trainingPlanItem.update({
      where: { id: planItem.id },
      data: {
        status: 'REJECTED',
        approvedByCoachId: actor.id,
        rejectedAt: new Date(),
        rejectionReason,
      },
      select: { id: true, status: true },
    });

    await this.orchestrator.rejectTrainingProposal(
      planItem.trainingPlanReleaseId,
      actor.id,
      rejectionReason,
    );

    return updated;
  }

  private async findTrainingApproval(
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
      ? await this.prisma.trainingQuestionSetCoachApproval.findFirst({
          where: { id: approvalId, coachId },
          select,
        })
      : await this.prisma.trainingQuestionSetCoachApproval.findFirst({
          where: { trainingQuestionSetId: questionSetId, coachId },
          select,
          orderBy: { id: 'asc' },
        });

    if (!approval) {
      throw new NotFoundException('Record approvazione allenatore non trovato');
    }

    return approval;
  }

  async getCycleStatus(actor: Actor, cycleId: string) {
    if (!cycleId) {
      throw new BadRequestException('ID ciclo mancante');
    }

    const plan = await this.prisma.improvementPlanRelease.findUnique({
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
      const allowed = await this.abac.canAccessUser(actor.id, plan.userId);
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
}
