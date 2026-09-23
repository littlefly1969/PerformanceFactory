import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
export async function assignAbilityProfessional(
  prisma: PrismaService,
  userId: string,
  areaId: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ability-professional-assignment'}))`;
    const existing = await tx.professionalUserLink.findFirst({
      where: { userId, areaId },
      include: {
        professional: { include: { professionalAreaCompetences: true } },
      },
    });
    if (existing) {
      if (
        existing.professional.isActive &&
        existing.professional.role === 'PROFESSIONAL' &&
        existing.professional.professionalAreaCompetences.some(
          (c) => c.areaId === areaId,
        )
      )
        return existing;
      throw new ConflictException({
        code: 'PROFESSIONAL_ASSIGNMENT_INVALID',
        message: 'Assegnazione professionista da aggiornare',
      });
    }
    const candidates = await tx.user.findMany({
      where: {
        role: 'PROFESSIONAL',
        isActive: true,
        professionalAreaCompetences: { some: { areaId } },
      },
      select: {
        id: true,
        createdAt: true,
        professionalLinks: {
          where: { user: { isActive: true } },
          select: { userId: true },
        },
      },
    });
    candidates.sort(
      (a, b) =>
        new Set(a.professionalLinks.map((l) => l.userId)).size -
          new Set(b.professionalLinks.map((l) => l.userId)).size ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    if (!candidates[0])
      throw new ConflictException({
        code: 'PROFESSIONAL_UNAVAILABLE',
        message: 'Nessun professionista competente disponibile',
      });
    const link = await tx.professionalUserLink.create({
      data: { userId, areaId, professionalId: candidates[0].id },
    });
    await tx.cycleAuditLog.create({
      data: {
        userId,
        action: 'ABILITY_PROFESSIONAL_ASSIGNED',
        source: 'SYSTEM',
        metadata: { areaId, professionalId: link.professionalId },
      },
    });
    return link;
  });
}
