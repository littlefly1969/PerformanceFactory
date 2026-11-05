import { Module } from '@nestjs/common';
import { AiProposalProviderService } from './proposal-provider.service';
import { AiMonitoringModule } from '../ai-monitoring/ai-monitoring.module';
@Module({
  imports: [AiMonitoringModule],
  providers: [AiProposalProviderService],
  exports: [AiProposalProviderService],
})
export class AiProposalModule {}
