import { Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { AiProposalModule } from './ai-proposal.module';
import { TrainingLifecycleModule } from '../training-lifecycle/training-lifecycle.module';

@Module({
  imports: [AiProposalModule, TrainingLifecycleModule],
  providers: [OrchestratorService],
  exports: [OrchestratorService, AiProposalModule],
})
export class AiOrchestratorModule {}
