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
export class PlansService {
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

  async getCurrentPlan(actor: Actor, userId?: string, areaId?: string) {
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
        throw new ForbiddenException('Operazione non consentita per questa area');
      }
    }

    const plan = await this.prisma.improvementPlanRelease.findFirst({
      where: { userId: targetUserId, areaId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        areaId: true,
        version: true,
        status: true,
        generatedBy: true,
        createdAt: true,
        sourceSnapshotId: true,
        items: {
          select: {
            id: true,
            areaId: true,
            type: true,
            title: true,
            body: true,
            metadata: true,
            status: true,
            completedAt: true,
            completionNotes: true,
            completionRating: true,
            area: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Rilascio piano non trovato');
    }

    const filteredForUser =
      actor.role === UserRole.USER
        ? plan.items.filter((item) => item.status === 'ACTIVE')
        : plan.items;

    return { ...plan, items: filteredForUser };
  }

  async getPlanHistory(actor: Actor, userId?: string, areaId?: string) {
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
        throw new ForbiddenException('Operazione non consentita per questa area');
      }
    }

    const plans = await this.prisma.improvementPlanRelease.findMany({
      where: { userId: targetUserId, areaId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        areaId: true,
        version: true,
        status: true,
        generatedBy: true,
        createdAt: true,
        sourceSnapshotId: true,
        items: {
          select: {
            id: true,
            areaId: true,
            type: true,
            title: true,
            body: true,
            metadata: true,
            status: true,
            completedAt: true,
            completionNotes: true,
            completionRating: true,
            area: { select: { id: true, name: true } },
          },
        },
      },
    });

    return plans;
  }

  private async getAllowedAreaIds(professionalId: string) {
    const competences = await this.prisma.professionalAreaCompetence.findMany({
      where: { professionalId },
      select: { areaId: true },
    });

    return new Set(competences.map((item) => item.areaId));
  }

  async getPendingApprovalsForProfessional(actor: Actor) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException('Solo i professionisti possono vedere le approvazioni');
    }

    const [linkedUsers, areas] = await Promise.all([
      this.prisma.professionalUserLink.findMany({
        where: { professionalId: actor.id },
        select: { userId: true, areaId: true },
      }),
      this.prisma.professionalAreaCompetence.findMany({
        where: { professionalId: actor.id },
        select: { areaId: true },
      }),
    ]);

    const linkedAreaFilters = linkedUsers.map((link) => ({
      areaId: link.areaId,
      planRelease: { userId: link.userId },
    }));

    return linkedAreaFilters.length
      ? this.prisma.planItem.findMany({
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
            planRelease: { select: { id: true, userId: true, version: true } },
          },
          orderBy: { id: 'asc' },
        })
      : [];
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
      throw new NotFoundException('Attivita piano non trovata');
    }

    const allowed = await this.abac.canAccessUserArea(
      actor.id,
      planItem.planRelease.userId,
      planItem.areaId,
    );
    if (!allowed) {
      throw new ForbiddenException('Operazione non consentita per questa attivita piano');
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
      await this.orchestrator.refreshCycleReadiness(planItem.planReleaseId);
    }

    return updated;
  }

  async rejectPlanItem(actor: Actor, planItemId: string, reason?: string) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException('Solo i professionisti possono rifiutare');
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
      throw new NotFoundException('Attivita piano non trovata');
    }

    const allowed = await this.abac.canAccessUserArea(
      actor.id,
      planItem.planRelease.userId,
      planItem.areaId,
    );
    if (!allowed) {
      throw new ForbiddenException('Operazione non consentita per questa attivita piano');
    }

    const updated = await this.prisma.planItem.update({
      where: { id: planItemId },
      data: {
        status: 'REJECTED',
        approvedByProfessionalId: actor.id,
        rejectedAt: new Date(),
        rejectionReason: reason ?? null,
      },
      select: { id: true, status: true, areaId: true },
    });

    if (planItem.planReleaseId) {
      await this.orchestrator.rejectCycleProposal(
        planItem.planReleaseId,
        actor.id,
        reason ?? 'Attivita piano rifiutata',
      );
    }

    return updated;
  }
}
