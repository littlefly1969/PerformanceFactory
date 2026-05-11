import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  async listAreas(actor?: { id: string; role: UserRole }) {
    if (actor?.role === UserRole.USER && actor.id) {
      const enabledAreas = await this.listEnabledUserAreas(actor.id);
      if (enabledAreas.length) {
        return enabledAreas;
      }
    }
    return this.prisma.area.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  private async listEnabledUserAreas(userId: string) {
    const selection = await this.prisma.userSportSelection.findUnique({
      where: { userId },
      select: { specializationId: true },
    });
    if (!selection) {
      return [];
    }
    const prompts = await this.prisma.sportSpecializationAreaPrompt.findMany({
      where: {
        specializationId: selection.specializationId,
        isActive: true,
        isEnabledDriver: true,
      },
      select: { area: { select: { id: true, name: true } } },
      orderBy: { area: { name: 'asc' } },
    });
    return prompts.map((prompt) => prompt.area);
  }
}
