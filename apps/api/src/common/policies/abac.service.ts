import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AbacService {
  constructor(private readonly prisma: PrismaService) {}

  async canAccessUser(
    professionalId: string,
    userId: string,
  ): Promise<boolean> {
    if (!professionalId || !userId) {
      return false;
    }

    const link = await this.prisma.professionalUserLink.findFirst({
      where: { professionalId, userId },
    });
    if (link) {
      return true;
    }

    const coachLink = await this.prisma.coachUserLink.findFirst({
      where: { coachId: professionalId, userId },
    });
    return !!coachLink;
  }

  async canAccessArea(
    professionalId: string,
    areaId: string,
  ): Promise<boolean> {
    if (!professionalId || !areaId) {
      return false;
    }

    const competence = await this.prisma.professionalAreaCompetence.findUnique({
      where: {
        professionalId_areaId: { professionalId, areaId },
      },
    });

    return !!competence;
  }

  async canAccessUserArea(
    professionalId: string,
    userId: string,
    areaId: string,
  ): Promise<boolean> {
    const link = await this.prisma.professionalUserLink.findFirst({
      where: { professionalId, userId, areaId },
    });
    return !!link;
  }

  async canCoachAccessUserSpecialization(
    coachId: string,
    userId: string,
    specializationId: string,
  ): Promise<boolean> {
    if (!coachId || !userId || !specializationId) {
      return false;
    }

    const link = await this.prisma.coachUserLink.findUnique({
      where: {
        userId_specializationId: { userId, specializationId },
      },
      select: { coachId: true },
    });

    return link?.coachId === coachId;
  }
}
