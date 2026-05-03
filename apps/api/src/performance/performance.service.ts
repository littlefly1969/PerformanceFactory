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
    const allowedAreaIds =
      actor.role === UserRole.PROFESSIONAL && targetUserId !== actor.id
        ? await this.getAllowedAreaIds(actor.id)
        : null;

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

    if (!allowedAreaIds) {
      return snapshot;
    }

    return {
      ...snapshot,
      areas: snapshot.areas.filter((area) =>
        allowedAreaIds.has(area.areaId),
      ),
    };
  }

  async getProfileHistory(actor: Actor, userId?: string) {
    const targetUserId = await this.resolveTargetUser(actor, userId);
    await this.auditAccess(actor, targetUserId, 'performance.profile.history');
    const allowedAreaIds =
      actor.role === UserRole.PROFESSIONAL && targetUserId !== actor.id
        ? await this.getAllowedAreaIds(actor.id)
        : null;

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

    if (!allowedAreaIds) {
      return snapshots;
    }

    return snapshots.map((snapshot) => ({
      ...snapshot,
      areas: snapshot.areas.filter((area) =>
        allowedAreaIds.has(area.areaId),
      ),
    }));
  }

  private async getAllowedAreaIds(professionalId: string) {
    const competences =
      await this.prisma.professionalAreaCompetence.findMany({
        where: { professionalId },
        select: { areaId: true },
      });

    return new Set(competences.map((item) => item.areaId));
  }

  private async auditAccess(actor: Actor, targetUserId: string, resource: string) {
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
