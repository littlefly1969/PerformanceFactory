import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompletePlanItemDto } from './dto/complete-plan-item.dto';

@Injectable()
export class UserPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentPlan(userId: string, areaId?: string) {
    if (!userId) {
      throw new BadRequestException('Missing user');
    }
    if (!areaId) {
      throw new BadRequestException('Missing area id');
    }

    const plan = await this.prisma.improvementPlanRelease.findFirst({
      where: { userId, areaId, status: 'ACTIVE' },
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
          where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
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
      throw new NotFoundException('Active plan not found');
    }

    return plan;
  }

  async completePlanItem(
    userId: string,
    planItemId: string,
    input: CompletePlanItemDto = {},
  ) {
    if (!userId || !planItemId) {
      throw new BadRequestException('Missing plan item');
    }

    if (
      input.completionRating !== undefined &&
      (!Number.isFinite(input.completionRating) ||
        !Number.isInteger(input.completionRating))
    ) {
      throw new BadRequestException('Invalid completion rating');
    }

    const planItem = await this.prisma.planItem.findUnique({
      where: { id: planItemId },
      select: {
        id: true,
        status: true,
        planRelease: { select: { userId: true, status: true } },
      },
    });

    if (!planItem) {
      throw new NotFoundException('Plan item not found');
    }

    if (planItem.planRelease.userId !== userId) {
      throw new ForbiddenException('Not allowed to complete');
    }

    if (planItem.planRelease.status !== 'ACTIVE') {
      throw new BadRequestException('Plan is not active');
    }

    if (planItem.status === 'COMPLETED') {
      throw new ConflictException('Plan item already completed');
    }

    if (planItem.status !== 'ACTIVE') {
      throw new BadRequestException('Plan item not active');
    }

    const data: {
      status: string;
      completedAt: Date;
      completionNotes?: string;
      completionRating?: number;
    } = {
      status: 'COMPLETED',
      completedAt: new Date(),
    };

    if (input.completionNotes !== undefined) {
      data.completionNotes = input.completionNotes;
    }

    if (input.completionRating !== undefined) {
      data.completionRating = input.completionRating;
    }

    return this.prisma.planItem.update({
      where: { id: planItemId },
      data,
      select: {
        id: true,
        status: true,
        completedAt: true,
        completionNotes: true,
        completionRating: true,
      },
    });
  }
}
