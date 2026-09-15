import { Injectable } from '@nestjs/common';
import { OrchestratorService } from '../ai-orchestrator/orchestrator.service';
import { AbacService } from '../common/policies/abac.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  approvePlanItem,
  approveQuestionSet,
  rejectPlanItem,
  rejectQuestionSet,
} from './professional-cycle-review';
import { getApprovalsInbox, getCycleStatus } from './professional-inbox';
import { Actor } from './professional-model';
import {
  approveTrainingPlanItem,
  approveTrainingQuestionSet,
  rejectTrainingPlanItem,
  rejectTrainingQuestionSet,
} from './professional-training-review';
export * from './professional-model';

@Injectable()
export class ProfessionalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abac: AbacService,
    private readonly orchestrator: OrchestratorService,
  ) {}
  async getApprovalsInbox(actor: Actor) {
    return getApprovalsInbox(this.prisma, actor);
  }

  async approveQuestionSet(
    actor: Actor,
    questionSetId: string,
    approvalId?: string,
  ) {
    return approveQuestionSet(
      this.prisma,
      this.abac,
      this.orchestrator,
      actor,
      questionSetId,
      approvalId,
    );
  }

  async rejectQuestionSet(
    actor: Actor,
    questionSetId: string,
    rejectionReason: string,
    approvalId?: string,
  ) {
    return rejectQuestionSet(
      this.prisma,
      this.abac,
      this.orchestrator,
      actor,
      questionSetId,
      rejectionReason,
      approvalId,
    );
  }

  async approvePlanItem(actor: Actor, planItemId: string) {
    return approvePlanItem(
      this.prisma,
      this.abac,
      this.orchestrator,
      actor,
      planItemId,
    );
  }

  async rejectPlanItem(
    actor: Actor,
    planItemId: string,
    rejectionReason: string,
  ) {
    return rejectPlanItem(
      this.prisma,
      this.abac,
      this.orchestrator,
      actor,
      planItemId,
      rejectionReason,
    );
  }

  async approveTrainingQuestionSet(
    actor: Actor,
    questionSetId: string,
    approvalId?: string,
  ) {
    return approveTrainingQuestionSet(
      this.abac,
      this.prisma,
      this.orchestrator,
      actor,
      questionSetId,
      approvalId,
    );
  }

  async rejectTrainingQuestionSet(
    actor: Actor,
    questionSetId: string,
    rejectionReason: string,
    approvalId?: string,
  ) {
    return rejectTrainingQuestionSet(
      this.abac,
      this.prisma,
      this.orchestrator,
      actor,
      questionSetId,
      rejectionReason,
      approvalId,
    );
  }

  async approveTrainingPlanItem(actor: Actor, planItemId: string) {
    return approveTrainingPlanItem(
      this.prisma,
      this.abac,
      this.orchestrator,
      actor,
      planItemId,
    );
  }

  async rejectTrainingPlanItem(
    actor: Actor,
    planItemId: string,
    rejectionReason: string,
  ) {
    return rejectTrainingPlanItem(
      this.prisma,
      this.abac,
      this.orchestrator,
      actor,
      planItemId,
      rejectionReason,
    );
  }

  async getCycleStatus(actor: Actor, cycleId: string) {
    return getCycleStatus(this.prisma, this.abac, actor, cycleId);
  }
}
