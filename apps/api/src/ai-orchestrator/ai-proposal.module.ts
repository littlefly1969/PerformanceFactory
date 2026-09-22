import { Module } from '@nestjs/common';
import { AiProposalProviderService } from './proposal-provider.service';
@Module({
  providers: [AiProposalProviderService],
  exports: [AiProposalProviderService],
})
export class AiProposalModule {}
