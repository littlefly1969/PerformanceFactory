import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  LifecycleError,
  TrainingLifecyclePolicy,
} from '../training-lifecycle/training-lifecycle.policy';

@Injectable()
export class CoachAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TrainingLifecyclePolicy,
  ) {}
  async ensureAssigned(userId: string, operationId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const selection = await tx.userSportSelection.findUnique({
        where: { userId },
        include: { specialization: true, sport: true },
      });
      if (
        !selection ||
        !selection.sport.isActive ||
        !selection.specialization.isActive
      )
        throw new LifecycleError('SPORT_SELECTION_UNAVAILABLE');
      const specializationId = selection.specializationId;
      // Serialize the shared coach load calculation, including assignments in other sports.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'training:coach-assignment'}))`;
      const existing = await tx.coachUserLink.findUnique({
        where: { userId_specializationId: { userId, specializationId } },
        include: {
          coach: { include: { coachSpecializationCompetences: true } },
        },
      });
      if (
        existing?.coach.isActive &&
        existing.coach.role === 'PROFESSIONAL' &&
        existing.coach.coachSpecializationCompetences.some(
          (c) => c.specializationId === specializationId,
        )
      )
        return existing;
      // An invalid prior assignment needs explicit reassignment; never silently rotate coaches.
      if (existing) throw new LifecycleError('COACH_ASSIGNMENT_INVALID');
      if (!this.policy.autoAssign)
        throw new LifecycleError('COACH_ASSIGNMENT_UNAVAILABLE');
      const coaches = await tx.user.findMany({
        where: {
          role: 'PROFESSIONAL',
          isActive: true,
          coachSpecializationCompetences: { some: { specializationId } },
        },
        select: {
          id: true,
          createdAt: true,
          coachUserLinks: {
            where: { user: { isActive: true } },
            select: { userId: true },
          },
        },
      });
      coaches.sort(
        (a, b) =>
          new Set(a.coachUserLinks.map((link) => link.userId)).size -
            new Set(b.coachUserLinks.map((link) => link.userId)).size ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
      if (!coaches[0]) throw new LifecycleError('COACH_ASSIGNMENT_UNAVAILABLE');
      const link = await tx.coachUserLink.create({
        data: { userId, specializationId, coachId: coaches[0].id },
      });
      await tx.cycleAuditLog.create({
        data: {
          userId,
          coachId: link.coachId,
          action: 'COACH_ASSIGNED',
          operationId,
          source: 'SYSTEM',
          metadata: { specializationId },
        },
      });
      return link;
    });
  }
}
