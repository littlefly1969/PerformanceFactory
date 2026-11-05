import { Module } from '@nestjs/common';
import { AiMonitoringService } from './ai-monitoring.service';
import { AiLogsController } from './ai-logs.controller';
import { AiLogsService } from './ai-logs.service';

@Module({
  providers: [AiMonitoringService, AiLogsService],
  controllers: [AiLogsController],
  exports: [AiMonitoringService],
})
export class AiMonitoringModule {}
