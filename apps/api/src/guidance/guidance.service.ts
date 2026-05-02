import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AbacService } from '../common/policies/abac.service';
import { CreateGuidanceDto } from './dto/create-guidance.dto';
import { AssignGuidanceDto } from './dto/assign-guidance.dto';

type Actor = {
  id: string;
  role: UserRole;
};

@Injectable()
export class GuidanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abac: AbacService,
  ) {}

  async createGuidance(input: CreateGuidanceDto) {
    if (!input.areaId || !input.title || !input.body) {
      throw new BadRequestException('Missing guidance fields');
    }

    const area = await this.prisma.area.findUnique({
      where: { id: input.areaId },
      select: { id: true },
    });

    if (!area) {
      throw new BadRequestException('Invalid area');
    }

    return this.prisma.guidanceContent.create({
      data: {
        areaId: input.areaId,
        title: input.title,
        body: input.body,
      },
      select: {
        id: true,
        areaId: true,
        title: true,
        body: true,
        version: true,
        createdAt: true,
      },
    });
  }

  async listGuidance(areaId?: string) {
    return this.prisma.guidanceContent.findMany({
      where: areaId ? { areaId } : undefined,
      select: {
        id: true,
        areaId: true,
        title: true,
        body: true,
        version: true,
        createdAt: true,
        area: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assignGuidance(actor: Actor, input: AssignGuidanceDto) {
    if (!actor?.id) {
      throw new BadRequestException('Missing actor');
    }

    if (!input.userId || !input.contentId) {
      throw new BadRequestException('Missing assignment fields');
    }

    const [user, content] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, role: true },
      }),
      this.prisma.guidanceContent.findUnique({
        where: { id: input.contentId },
        select: { id: true },
      }),
    ]);

    if (!user || user.role !== UserRole.USER) {
      throw new BadRequestException('Invalid user');
    }

    if (!content) {
      throw new BadRequestException('Invalid guidance content');
    }

    if (actor.role === UserRole.PROFESSIONAL) {
      const allowed = await this.abac.canAccessUser(actor.id, user.id);
      if (!allowed) {
        throw new ForbiddenException('User not linked to professional');
      }
    }

    return this.prisma.userAssignment.upsert({
      where: {
        userId_contentId: { userId: user.id, contentId: input.contentId },
      },
      update: {},
      create: { userId: user.id, contentId: input.contentId },
      select: {
        id: true,
        status: true,
        userId: true,
        contentId: true,
        createdAt: true,
      },
    });
  }
}
