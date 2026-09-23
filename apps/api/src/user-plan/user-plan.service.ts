import { CycleCompletionService } from '../cycle-completion/cycle-completion.service';
import { finishTrainingSession } from '../athlete/training-sessions';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly completion: CycleCompletionService,
  ) {}

  async getCurrentPlan(userId: string, areaId?: string) {
    if (!userId) {
      throw new BadRequestException('Utente mancante');
    }
    if (!areaId) {
      throw new BadRequestException('ID area mancante');
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
      throw new NotFoundException('Allenamento attivo non trovato');
    }

    return plan;
  }

  async getPlanHistory(userId: string, areaId?: string) {
    if (!userId) {
      throw new BadRequestException('Utente mancante');
    }
    if (!areaId) {
      throw new BadRequestException('ID area mancante');
    }

    return this.prisma.improvementPlanRelease.findMany({
      where: { userId, areaId, status: { in: ['ACTIVE', 'CLOSED'] } },
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
  }

  async getCurrentTraining(userId: string) {
    if (!userId) {
      throw new BadRequestException('Utente mancante');
    }
    const training = await this.prisma.trainingPlanRelease.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        version: true,
        status: true,
        generatedBy: true,
        summaryText: true,
        outputJson: true,
        provider: true,
        model: true,
        createdAt: true,
        publishedAt: true,
        sourceSnapshotId: true,
        specialization: {
          select: {
            id: true,
            label: true,
            sport: { select: { id: true, label: true } },
          },
        },
        items: {
          where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
          select: {
            id: true,
            type: true,
            title: true,
            body: true,
            metadata: true,
            status: true,
            completedAt: true,
            completionNotes: true,
            completionRating: true,
          },
          orderBy: { id: 'asc' },
        },
        questionSets: {
          where: { status: 'PUBLISHED' },
          select: {
            id: true,
            type: true,
            status: true,
            publishedAt: true,
            questions: {
              select: {
                id: true,
                text: true,
                objectiveRef: true,
                orderIndex: true,
                options: {
                  select: { id: true, label: true, score: true },
                },
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!training) {
      throw new NotFoundException('Allenamento specifico non trovato');
    }
    return training;
  }

  async getTrainingHistory(userId: string) {
    if (!userId) {
      throw new BadRequestException('Utente mancante');
    }
    return this.prisma.trainingPlanRelease.findMany({
      where: { userId, status: { in: ['ACTIVE', 'CLOSED'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        version: true,
        status: true,
        generatedBy: true,
        summaryText: true,
        outputJson: true,
        provider: true,
        model: true,
        createdAt: true,
        publishedAt: true,
        archivedAt: true,
        sourceSnapshotId: true,
      },
    });
  }

  async completePlanItem(
    userId: string,
    planItemId: string,
    input: CompletePlanItemDto = {},
  ) {
    if (!userId || !planItemId) {
      throw new BadRequestException('Attivita allenamento mancante');
    }

    if (
      input.completionRating !== undefined &&
      (!Number.isFinite(input.completionRating) ||
        !Number.isInteger(input.completionRating))
    ) {
      throw new BadRequestException('Valutazione completamento non valida');
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
      throw new NotFoundException('Attivita allenamento non trovata');
    }

    if (planItem.planRelease.userId !== userId) {
      throw new ForbiddenException('Non puoi completare questa attivita');
    }

    if (planItem.planRelease.status !== 'ACTIVE') {
      throw new BadRequestException('Allenamento non attivo');
    }

    if (planItem.status === 'COMPLETED') {
      throw new ConflictException('Attivita allenamento gia completata');
    }

    if (planItem.status !== 'ACTIVE') {
      throw new BadRequestException('Attivita allenamento non attiva');
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

  async completeTrainingPlanItem(
    userId: string,
    planItemId: string,
    input: CompletePlanItemDto = {},
  ) {
    if (!userId || !planItemId) {
      throw new BadRequestException('Esercizio allenamento mancante');
    }

    if (
      input.completionRating !== undefined &&
      (!Number.isFinite(input.completionRating) ||
        !Number.isInteger(input.completionRating))
    ) {
      throw new BadRequestException('Valutazione completamento non valida');
    }

    const planItem = await this.prisma.trainingPlanItem.findUnique({
      where: { id: planItemId },
      select: {
        id: true,
        status: true,
        trainingPlanRelease: { select: { userId: true, status: true } },
      },
    });

    if (!planItem) {
      throw new NotFoundException('Esercizio allenamento non trovato');
    }

    if (planItem.trainingPlanRelease.userId !== userId) {
      throw new ForbiddenException('Non puoi completare questo esercizio');
    }

    if (planItem.trainingPlanRelease.status !== 'ACTIVE') {
      throw new BadRequestException('Allenamento non attivo');
    }

    if (planItem.status === 'COMPLETED') {
      throw new ConflictException('Esercizio allenamento gia completato');
    }

    if (planItem.status !== 'ACTIVE') {
      throw new BadRequestException('Esercizio allenamento non attivo');
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

    const session = await this.prisma.trainingSession.findFirst({
      where: { trainingPlanItemId: planItemId, userId },
      select: { id: true, trainingPlanReleaseId: true },
    });
    if (session) {
      await finishTrainingSession(
        this.prisma,
        userId,
        session.id,
        'COMPLETED',
        input,
      );
      await this.completion.reconcileTrainingLifecycle(userId);
      return this.prisma.trainingPlanItem.findUnique({
        where: { id: planItemId },
        select: {
          id: true,
          status: true,
          completedAt: true,
          completionNotes: true,
          completionRating: true,
        },
      });
    }
    return this.prisma.trainingPlanItem.update({
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
