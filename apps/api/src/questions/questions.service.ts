import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AbacService } from '../common/policies/abac.service';
import { OrchestratorService } from '../ai-orchestrator/orchestrator.service';

type Actor = {
  id: string;
  role: UserRole;
};

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abac: AbacService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  private async resolveTargetUser(actor: Actor, userId?: string) {
    if (!actor?.id) {
      throw new BadRequestException('Missing actor');
    }

    if (!userId || userId === actor.id) {
      return actor.id;
    }

    if (actor.role === UserRole.ADMIN) {
      return userId;
    }

    if (actor.role === UserRole.PROFESSIONAL) {
      const allowed = await this.abac.canAccessUser(actor.id, userId);
      if (!allowed) {
        throw new ForbiddenException('User not linked to professional');
      }
      return userId;
    }

    throw new ForbiddenException('Not allowed to access other users');
  }

  async getCurrentQuestionSet(actor: Actor, userId?: string, areaId?: string) {
    const targetUserId = await this.resolveTargetUser(actor, userId);
    const isProfessional = actor.role === UserRole.PROFESSIONAL;
    if (!areaId) {
      throw new BadRequestException('Missing area id');
    }

    if (actor.role === UserRole.PROFESSIONAL && targetUserId !== actor.id) {
      const allowed = await this.abac.canAccessUserArea(
        actor.id,
        targetUserId,
        areaId,
      );
      if (!allowed) {
        throw new ForbiddenException('Not allowed for this area');
      }
    }

    const questionSet = await this.prisma.questionSet.findFirst({
      where: {
        userId: targetUserId,
        areaId,
        status: isProfessional ? undefined : 'PUBLISHED',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        areaId: true,
        planReleaseId: true,
        type: true,
        status: true,
        createdAt: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            areaId: true,
            text: true,
            objectiveRef: true,
            orderIndex: true,
            area: { select: { id: true, name: true } },
            options: { select: { id: true, label: true } },
          },
        },
      },
    });

    if (!questionSet) {
      throw new NotFoundException('Question set not found');
    }

    return {
      ...questionSet,
      questions: questionSet.questions.filter(
        (question) => question.areaId === areaId,
      ),
    };
  }

  async getQuestionSetHistory(actor: Actor, userId?: string, areaId?: string) {
    const targetUserId = await this.resolveTargetUser(actor, userId);
    if (!areaId) {
      throw new BadRequestException('Missing area id');
    }

    if (actor.role === UserRole.PROFESSIONAL && targetUserId !== actor.id) {
      const allowed = await this.abac.canAccessUserArea(
        actor.id,
        targetUserId,
        areaId,
      );
      if (!allowed) {
        throw new ForbiddenException('Not allowed for this area');
      }
    }

    return this.prisma.questionSet.findMany({
      where: {
        userId: targetUserId,
        areaId,
        status:
          actor.role === UserRole.USER ? { in: ['PUBLISHED', 'CLOSED'] } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        areaId: true,
        planReleaseId: true,
        type: true,
        status: true,
        createdAt: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            areaId: true,
            text: true,
            objectiveRef: true,
            orderIndex: true,
            area: { select: { id: true, name: true } },
            options: { select: { id: true, label: true, score: true } },
            answers: {
              where: { userId: targetUserId },
              select: {
                id: true,
                answerOptionId: true,
                scoreAwarded: true,
                answeredAt: true,
              },
            },
          },
        },
      },
    });
  }

  async closeQuestionSet(actor: Actor, questionSetId: string) {
    if (!questionSetId) {
      throw new BadRequestException('Missing question set id');
    }

    const questionSet = await this.prisma.questionSet.findUnique({
      where: { id: questionSetId },
      select: { id: true, userId: true, status: true },
    });

    if (!questionSet) {
      throw new NotFoundException('Question set not found');
    }

    if (actor.role === UserRole.USER && questionSet.userId !== actor.id) {
      throw new ForbiddenException('Not allowed to close');
    }

    if (actor.role === UserRole.PROFESSIONAL) {
      const allowed = await this.abac.canAccessUser(
        actor.id,
        questionSet.userId,
      );
      if (!allowed) {
        throw new ForbiddenException('User not linked to professional');
      }
    }

    if (questionSet.status !== 'PUBLISHED') {
      throw new BadRequestException('Question set not published');
    }

    await this.orchestrator.createSnapshotFromQuestionSet(
      questionSetId,
      'Cycle closed',
    );

    return { id: questionSet.id, userId: questionSet.userId, status: 'CLOSED' };
  }

  async getPendingApprovalsForProfessional(actor: Actor) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException('Only professionals can view approvals');
    }

    const areaIds = Array.from(await this.getAllowedAreaIds(actor.id));

    return this.prisma.questionSetAreaApproval.findMany({
      where: {
        professionalId: actor.id,
        status: 'PENDING',
        areaId: { in: areaIds },
      },
      select: {
        id: true,
        status: true,
        areaId: true,
        questionSet: {
          select: {
            id: true,
            userId: true,
            status: true,
            createdAt: true,
            questions: {
              where: { areaId: { in: areaIds } },
              select: {
                id: true,
                text: true,
                objectiveRef: true,
                orderIndex: true,
                area: { select: { id: true, name: true } },
                options: { select: { id: true, label: true, score: true } },
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  async approveArea(
    actor: Actor,
    questionSetId: string,
    areaId: string,
    notes?: string,
  ) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException('Only professionals can approve');
    }

    const allowed = await this.abac.canAccessArea(actor.id, areaId);
    if (!allowed) {
      throw new ForbiddenException('Not allowed for this area');
    }

    const approval = await this.prisma.questionSetAreaApproval.findUnique({
      where: { questionSetId_areaId: { questionSetId, areaId } },
      select: {
        id: true,
        professionalId: true,
        status: true,
        questionSet: { select: { status: true } },
      },
    });

    if (!approval) {
      throw new NotFoundException('Approval record not found');
    }

    if (approval.professionalId !== actor.id) {
      throw new ForbiddenException('Not assigned to this professional');
    }

    if (approval.status !== 'PENDING') {
      throw new BadRequestException('Approval already decided');
    }

    if (approval.questionSet.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Question set not in approval');
    }

    const updated = await this.prisma.questionSetAreaApproval.update({
      where: { questionSetId_areaId: { questionSetId, areaId } },
      data: {
        status: 'APPROVED',
        approvedByProfessionalId: actor.id,
        approvedAt: new Date(),
        rejectionReason: null,
        rejectedAt: null,
      },
      select: { id: true, status: true, areaId: true, questionSetId: true },
    });

    const questionSet = await this.prisma.questionSet.findUnique({
      where: { id: questionSetId },
      select: { planReleaseId: true },
    });
    if (questionSet?.planReleaseId) {
      await this.orchestrator.rejectCycleProposal(
        questionSet.planReleaseId,
        actor.id,
        notes ?? 'Questionnaire rejected',
      );
    }

    return updated;
  }

  async rejectArea(
    actor: Actor,
    questionSetId: string,
    areaId: string,
    notes?: string,
  ) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException('Only professionals can reject');
    }

    const allowed = await this.abac.canAccessArea(actor.id, areaId);
    if (!allowed) {
      throw new ForbiddenException('Not allowed for this area');
    }

    const approval = await this.prisma.questionSetAreaApproval.findUnique({
      where: { questionSetId_areaId: { questionSetId, areaId } },
      select: {
        id: true,
        professionalId: true,
        status: true,
        questionSet: { select: { status: true } },
      },
    });

    if (!approval) {
      throw new NotFoundException('Approval record not found');
    }

    if (approval.professionalId !== actor.id) {
      throw new ForbiddenException('Not assigned to this professional');
    }

    if (approval.status !== 'PENDING') {
      throw new BadRequestException('Approval already decided');
    }

    if (approval.questionSet.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Question set not in approval');
    }

    const updated = await this.prisma.questionSetAreaApproval.update({
      where: { questionSetId_areaId: { questionSetId, areaId } },
      data: {
        status: 'REJECTED',
        approvedByProfessionalId: actor.id,
        rejectedAt: new Date(),
        rejectionReason: notes ?? null,
      },
      select: { id: true, status: true, areaId: true, questionSetId: true },
    });

    const questionSet = await this.prisma.questionSet.findUnique({
      where: { id: questionSetId },
      select: { planReleaseId: true },
    });
    if (questionSet?.planReleaseId) {
      await this.orchestrator.rejectCycleProposal(
        questionSet.planReleaseId,
        actor.id,
        notes ?? 'Questionnaire rejected',
      );
    }

    return updated;
  }

  async updateQuestion(
    actor: Actor,
    questionSetId: string,
    questionId: string,
    payload: { text?: string; objectiveRef?: string; orderIndex?: number },
  ) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException('Only professionals can update questions');
    }

    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        areaId: true,
        questionSetId: true,
        questionSet: { select: { status: true } },
      },
    });

    if (!question || question.questionSetId !== questionSetId) {
      throw new NotFoundException('Question not found');
    }

    if (question.questionSet.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Question set is not editable');
    }

    const allowed = await this.abac.canAccessArea(actor.id, question.areaId);
    if (!allowed) {
      throw new ForbiddenException('Not allowed for this area');
    }

    return this.prisma.question.update({
      where: { id: questionId },
      data: {
        text: payload.text,
        objectiveRef: payload.objectiveRef,
        orderIndex: payload.orderIndex,
      },
      select: { id: true, text: true, objectiveRef: true, orderIndex: true },
    });
  }

  async updateAnswerOption(
    actor: Actor,
    questionId: string,
    optionId: string,
    payload: { label?: string; score?: number },
  ) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException('Only professionals can update options');
    }

    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        areaId: true,
        questionSet: { select: { status: true } },
      },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (question.questionSet.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Question set is not editable');
    }

    const allowed = await this.abac.canAccessArea(actor.id, question.areaId);
    if (!allowed) {
      throw new ForbiddenException('Not allowed for this area');
    }

    return this.prisma.answerOption.update({
      where: { id: optionId },
      data: { label: payload.label, score: payload.score },
      select: { id: true, label: true, score: true },
    });
  }

  private async getAllowedAreaIds(professionalId: string) {
    const competences = await this.prisma.professionalAreaCompetence.findMany({
      where: { professionalId },
      select: { areaId: true },
    });

    return new Set(competences.map((item) => item.areaId));
  }
}
