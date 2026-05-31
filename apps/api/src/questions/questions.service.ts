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
      throw new BadRequestException('Attore mancante');
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
        throw new ForbiddenException('Utente non collegato al professionista');
      }
      return userId;
    }

    throw new ForbiddenException('Non puoi accedere ad altri utenti');
  }

  async getCurrentQuestionSet(actor: Actor, userId?: string, areaId?: string) {
    const targetUserId = await this.resolveTargetUser(actor, userId);
    const isProfessional = actor.role === UserRole.PROFESSIONAL;
    if (!areaId) {
      throw new BadRequestException('ID area mancante');
    }

    if (actor.role === UserRole.PROFESSIONAL && targetUserId !== actor.id) {
      const allowed = await this.abac.canAccessUserArea(
        actor.id,
        targetUserId,
        areaId,
      );
      if (!allowed) {
        throw new ForbiddenException(
          'Operazione non consentita per questa area',
        );
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
      throw new NotFoundException('Questionario non trovato');
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
      throw new BadRequestException('ID area mancante');
    }

    if (actor.role === UserRole.PROFESSIONAL && targetUserId !== actor.id) {
      const allowed = await this.abac.canAccessUserArea(
        actor.id,
        targetUserId,
        areaId,
      );
      if (!allowed) {
        throw new ForbiddenException(
          'Operazione non consentita per questa area',
        );
      }
    }

    return this.prisma.questionSet.findMany({
      where: {
        userId: targetUserId,
        areaId,
        status:
          actor.role === UserRole.USER
            ? { in: ['PUBLISHED', 'CLOSED'] }
            : undefined,
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
      throw new BadRequestException('ID questionario mancante');
    }

    const questionSet = await this.prisma.questionSet.findUnique({
      where: { id: questionSetId },
      select: { id: true, userId: true, status: true },
    });

    if (!questionSet) {
      throw new NotFoundException('Questionario non trovato');
    }

    if (actor.role === UserRole.USER && questionSet.userId !== actor.id) {
      throw new ForbiddenException('Non puoi chiudere questo questionario');
    }

    if (actor.role === UserRole.PROFESSIONAL) {
      const allowed = await this.abac.canAccessUser(
        actor.id,
        questionSet.userId,
      );
      if (!allowed) {
        throw new ForbiddenException('Utente non collegato al professionista');
      }
    }

    if (questionSet.status !== 'PUBLISHED') {
      throw new BadRequestException('Questionario non pubblicato');
    }

    await this.orchestrator.createSnapshotFromQuestionSet(
      questionSetId,
      'Cycle closed',
    );

    return { id: questionSet.id, userId: questionSet.userId, status: 'CLOSED' };
  }

  async getPendingApprovalsForProfessional(actor: Actor) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException(
        'Solo i professionisti possono vedere le approvazioni',
      );
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

  async approveArea(actor: Actor, questionSetId: string, areaId: string) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException('Solo i professionisti possono approvare');
    }

    const allowed = await this.abac.canAccessArea(actor.id, areaId);
    if (!allowed) {
      throw new ForbiddenException('Operazione non consentita per questa area');
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
      throw new NotFoundException('Record approvazione non trovato');
    }

    if (approval.professionalId !== actor.id) {
      throw new ForbiddenException('Non assegnato a questo professionista');
    }

    if (approval.status !== 'PENDING') {
      throw new BadRequestException('Approvazione gia decisa');
    }

    if (approval.questionSet.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Il questionario non e in approvazione');
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
      await this.orchestrator.refreshCycleReadiness(
        questionSet.planReleaseId,
        actor.id,
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
      throw new ForbiddenException('Solo i professionisti possono rifiutare');
    }

    const allowed = await this.abac.canAccessArea(actor.id, areaId);
    if (!allowed) {
      throw new ForbiddenException('Operazione non consentita per questa area');
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
      throw new NotFoundException('Record approvazione non trovato');
    }

    if (approval.professionalId !== actor.id) {
      throw new ForbiddenException('Non assegnato a questo professionista');
    }

    if (approval.status !== 'PENDING') {
      throw new BadRequestException('Approvazione gia decisa');
    }

    if (approval.questionSet.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Il questionario non e in approvazione');
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
        notes ?? 'Questionario rifiutato',
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
      throw new ForbiddenException(
        'Solo i professionisti possono aggiornare le domande',
      );
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
      throw new NotFoundException('Domanda non trovata');
    }

    if (question.questionSet.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Il questionario non e modificabile');
    }

    const allowed = await this.abac.canAccessArea(actor.id, question.areaId);
    if (!allowed) {
      throw new ForbiddenException('Operazione non consentita per questa area');
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
      throw new ForbiddenException(
        'Solo i professionisti possono aggiornare le opzioni',
      );
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
      throw new NotFoundException('Domanda non trovata');
    }

    if (question.questionSet.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Il questionario non e modificabile');
    }

    const allowed = await this.abac.canAccessArea(actor.id, question.areaId);
    if (!allowed) {
      throw new ForbiddenException('Operazione non consentita per questa area');
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
