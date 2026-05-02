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
    return !!link;
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
}
