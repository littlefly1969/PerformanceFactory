import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrainingApprovalService {
  constructor(private readonly prisma: PrismaService) {}
  process(releaseId: string, mode: string) {
    return this.approve(releaseId, mode);
  }
  approveManual(releaseId: string, actor: { id: string; role: string }) {
    return this.approve(releaseId, 'MANUAL', actor);
  }
  private async approve(
    releaseId: string,
    mode: string,
    actor?: { id: string; role: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${releaseId}))`;
      const plan = await tx.trainingPlanRelease.findUnique({
        where: { id: releaseId },
        include: {
          items: true,
          questionSets: { include: { approvals: true } },
        },
      });
      if (!plan) throw new NotFoundException('Piano non trovato');
      if (actor && actor.role !== 'ADMIN') {
        const link = await tx.coachUserLink.findFirst({
          where: {
            userId: plan.userId,
            specializationId: plan.specializationId,
            coachId: actor.id,
            coach: {
              isActive: true,
              role: 'PROFESSIONAL',
              coachSpecializationCompetences: {
                some: { specializationId: plan.specializationId },
              },
            },
          },
        });
        if (!link)
          throw new ForbiddenException('Piano non assegnato a questo coach');
      }
      if (
        plan.cycleStatus === 'PUBLISHED' ||
        plan.cycleStatus === 'READY_TO_PUBLISH'
      )
        return plan;
      if (plan.status !== 'PENDING_APPROVAL')
        throw new ConflictException('Il piano non è in approvazione');
      if (mode === 'MANUAL' && !actor) {
        return tx.trainingPlanRelease.update({
          where: { id: releaseId },
          data: { cycleStatus: 'WAITING_APPROVALS', approvalMode: mode },
        });
      }
      if (
        !plan.items.length ||
        !plan.questionSets.length ||
        plan.items.some((i) => i.status === 'REJECTED') ||
        plan.questionSets.some(
          (q) =>
            !q.approvals.length ||
            q.approvals.some((a) => a.status === 'REJECTED'),
        )
      )
        throw new ConflictException('Proposta incompleta o rifiutata');
      const approvedAt = new Date();
      const source = actor
        ? actor.role === 'ADMIN'
          ? 'ADMIN'
          : 'PROFESSIONAL'
        : 'SYSTEM';
      const approval = {
        status: 'APPROVED',
        approvedAt,
        approvalSource: source,
        approvedByCoachId: actor?.id ?? null,
      };
      await tx.trainingPlanItem.updateMany({
        where: { trainingPlanReleaseId: releaseId, status: 'PROPOSED' },
        data: approval,
      });
      await tx.trainingQuestionSetCoachApproval.updateMany({
        where: {
          questionSet: { trainingPlanReleaseId: releaseId },
          status: 'PENDING',
        },
        data: approval,
      });
      await tx.aiContextSummary.updateMany({
        where: {
          userId: plan.userId,
          summaryJson: { path: ['trainingPlanReleaseId'], equals: releaseId },
        },
        data: { cycleStatus: 'READY_TO_PUBLISH' },
      });
      await tx.cycleAuditLog.create({
        data: {
          userId: plan.userId,
          trainingPlanReleaseId: releaseId,
          coachId: plan.questionSets[0]?.approvals[0]?.coachId,
          actorId: actor?.id,
          source,
          action: actor ? 'MANUAL_APPROVED' : 'AUTO_APPROVED',
        },
      });
      return tx.trainingPlanRelease.update({
        where: { id: releaseId },
        data: {
          cycleStatus: 'READY_TO_PUBLISH',
          approvalMode: mode,
          approvalSource: source,
          approvedAt,
        },
      });
    });
  }
}
