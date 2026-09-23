import { Module } from '@nestjs/common';
import { AiProposalModule } from '../ai-orchestrator/ai-proposal.module';
import { ConsentsModule } from '../consents/consents.module';
import { AbilityPlansService } from './ability-plans.service';
import { AbilityPlansWorker } from './ability-plans.worker';
import { AbilityPlansController } from './ability-plans.controller';
@Module({
  imports: [AiProposalModule, ConsentsModule],
  controllers: [AbilityPlansController],
  providers: [AbilityPlansService, AbilityPlansWorker],
  exports: [AbilityPlansService],
})
export class AbilityPlansModule {}
