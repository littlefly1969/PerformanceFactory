import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AbacService } from '../common/policies/abac.service';

type Actor = {
  id: string;
  role: UserRole;
};

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abac: AbacService,
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

  async getCurrentProfile(actor: Actor, userId?: string) {
    const targetUserId = await this.resolveTargetUser(actor, userId);
    await this.auditAccess(actor, targetUserId, 'performance.profile.current');
    const { allowedAreaIds, enabledDriverAreaIds } =
      await this.getProfileAreaFilters(actor, targetUserId);

    const snapshot = await this.prisma.performanceProfileSnapshot.findFirst({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        rankingGlobal: true,
        reason: true,
        createdAt: true,
        areas: {
          select: {
            areaId: true,
            realR: true,
            potentialP: true,
            area: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!snapshot) {
      throw new NotFoundException('Profilo performance non trovato');
    }

    return this.filterSnapshotAreas(
      snapshot,
      allowedAreaIds,
      enabledDriverAreaIds,
    );
  }

  async getProfileHistory(actor: Actor, userId?: string) {
    const targetUserId = await this.resolveTargetUser(actor, userId);
    await this.auditAccess(actor, targetUserId, 'performance.profile.history');
    const { allowedAreaIds, enabledDriverAreaIds } =
      await this.getProfileAreaFilters(actor, targetUserId);

    const snapshots = await this.prisma.performanceProfileSnapshot.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        rankingGlobal: true,
        reason: true,
        createdAt: true,
        areas: {
          select: {
            areaId: true,
            realR: true,
            potentialP: true,
            area: { select: { id: true, name: true } },
          },
        },
      },
    });

    return snapshots.map((snapshot) =>
      this.filterSnapshotAreas(snapshot, allowedAreaIds, enabledDriverAreaIds),
    );
  }

  private async getAllowedAreaIds(professionalId: string) {
    const competences = await this.prisma.professionalAreaCompetence.findMany({
      where: { professionalId },
      select: { areaId: true },
    });

    return new Set(competences.map((item) => item.areaId));
  }

  private async getProfileAreaFilters(actor: Actor, targetUserId: string) {
    if (actor.role === UserRole.PROFESSIONAL && targetUserId !== actor.id) {
      const canCoachAccessUser = await this.abac.canCoachAccessUser(
        actor.id,
        targetUserId,
      );
      if (canCoachAccessUser) {
        return { allowedAreaIds: null, enabledDriverAreaIds: null };
      }

      return {
        allowedAreaIds: await this.getAllowedAreaIds(actor.id),
        enabledDriverAreaIds: await this.getEnabledDriverAreaIds(targetUserId),
      };
    }

    return {
      allowedAreaIds: null,
      enabledDriverAreaIds: await this.getEnabledDriverAreaIds(targetUserId),
    };
  }

  private async getEnabledDriverAreaIds(userId: string) {
    const selection = await this.prisma.userSportSelection.findUnique({
      where: { userId },
      select: { specializationId: true },
    });
    if (!selection) {
      return null;
    }
    const prompts = await this.prisma.sportSpecializationAreaPrompt.findMany({
      where: {
        specializationId: selection.specializationId,
        isActive: true,
        isEnabledDriver: true,
      },
      select: { areaId: true },
    });
    return prompts.length
      ? new Set(prompts.map((prompt) => prompt.areaId))
      : null;
  }

  private filterSnapshotAreas<
    T extends {
      rankingGlobal: number;
      areas: Array<{ areaId: string; realR: number }>;
    },
  >(
    snapshot: T,
    allowedAreaIds: Set<string> | null,
    enabledDriverAreaIds: Set<string> | null,
  ) {
    const areas = snapshot.areas.filter((area) => {
      if (allowedAreaIds && !allowedAreaIds.has(area.areaId)) {
        return false;
      }
      if (enabledDriverAreaIds && !enabledDriverAreaIds.has(area.areaId)) {
        return false;
      }
      return true;
    });
    return {
      ...snapshot,
      rankingGlobal: areas.length
        ? Math.round(
            areas.reduce((sum, area) => sum + area.realR, 0) / areas.length,
          )
        : snapshot.rankingGlobal,
      areas,
    };
  }

  private async auditAccess(
    actor: Actor,
    targetUserId: string,
    resource: string,
  ) {
    await this.prisma.dataAccessAudit.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        targetUserId,
        resource,
        action: 'READ',
      },
    });
  }
}
