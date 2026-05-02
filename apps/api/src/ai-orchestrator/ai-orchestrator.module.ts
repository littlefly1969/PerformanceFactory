import { Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { AiProposalProviderService } from './proposal-provider.service';

@Module({
  providers: [OrchestratorService, AiProposalProviderService],
  exports: [OrchestratorService, AiProposalProviderService],
})
export class AiOrchestratorModule {}
