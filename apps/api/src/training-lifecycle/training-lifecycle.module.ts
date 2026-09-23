import { TrainingConstraintsService } from '../ai-orchestrator/training-constraints';
import { Module } from '@nestjs/common';
import { AiProposalModule } from '../ai-orchestrator/ai-proposal.module';
import { ConsentsModule } from '../consents/consents.module';
import { TrainingLifecycleController } from './training-lifecycle.controller';
import { TrainingLifecycleOrchestrator } from './training-lifecycle.orchestrator';
import { TrainingLifecyclePolicy } from './training-lifecycle.policy';
import { LifecycleCommandsService } from './lifecycle-commands.service';
import { CoachAssignmentService } from '../coach-assignment/coach-assignment.service';
import { TrainingContextService } from '../training-context/training-context.service';
import { TrainingGenerationService } from '../training-generation/training-generation.service';
import { TrainingApprovalService } from '../training-approval/training-approval.service';
import { TrainingPublicationService } from '../training-publication/training-publication.service';
import { CycleCompletionService } from '../cycle-completion/cycle-completion.service';
@Module({
  imports: [AiProposalModule, ConsentsModule],
  controllers: [TrainingLifecycleController],
  providers: [
    TrainingLifecycleOrchestrator,
    TrainingLifecyclePolicy,
    LifecycleCommandsService,
    CoachAssignmentService,
    TrainingContextService,
    TrainingConstraintsService,
    TrainingGenerationService,
    TrainingApprovalService,
    TrainingPublicationService,
    CycleCompletionService,
  ],
  exports: [
    TrainingLifecycleOrchestrator,
    CycleCompletionService,
    TrainingContextService,
    TrainingConstraintsService,
    TrainingPublicationService,
  ],
})
export class TrainingLifecycleModule {}
