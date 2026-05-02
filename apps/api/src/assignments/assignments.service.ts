import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyAssignments(userId: string) {
    if (!userId) {
      throw new BadRequestException('Missing user');
    }

    return this.prisma.userAssignment.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        content: {
          select: {
            id: true,
            title: true,
            body: true,
            area: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async completeAssignment(userId: string, assignmentId: string) {
    if (!userId || !assignmentId) {
      throw new BadRequestException('Missing assignment');
    }

    const assignment = await this.prisma.userAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, userId: true, status: true },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (assignment.userId !== userId) {
      throw new ForbiddenException('Not allowed to complete');
    }

    return this.prisma.userAssignment.update({
      where: { id: assignmentId },
      data: { status: 'COMPLETED' },
      select: { id: true, status: true },
    });
  }
}
