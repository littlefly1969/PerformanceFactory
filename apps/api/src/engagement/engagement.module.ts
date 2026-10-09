import { Module } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { EngagementWorker } from './engagement.worker';

@Module({
  providers: [EngagementService, EngagementWorker],
  exports: [EngagementService],
})
export class EngagementModule {}
