import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { publishTrainingPlan } from '../ai-orchestrator/training-publication';
@Injectable()
export class TrainingPublicationService {
  constructor(private readonly prisma: PrismaService) {}
  async publishIfReady(releaseId: string, actorId?: string) {
    const plan = await this.prisma.trainingPlanRelease.findUniqueOrThrow({
      where: { id: releaseId },
    });
    if (
      plan.cycleStatus !== 'READY_TO_PUBLISH' &&
      plan.cycleStatus !== 'PUBLISHED'
    )
      return plan;
    await publishTrainingPlan(this.prisma, releaseId, actorId);
    return this.prisma.trainingPlanRelease.findUniqueOrThrow({
      where: { id: releaseId },
    });
  }
}
