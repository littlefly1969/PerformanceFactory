import { APP_INTERCEPTOR } from '@nestjs/core';
import { AiDiagnosticsContextInterceptor } from './ai-diagnostics-context.interceptor';
import { AiDiagnosticsSettingsService } from './ai-diagnostics-settings.service';
import { Module } from '@nestjs/common';
import { AiMonitoringService } from './ai-monitoring.service';
import { AiLogsController } from './ai-logs.controller';
import { AiLogsService } from './ai-logs.service';

@Module({
  providers: [
    { provide: APP_INTERCEPTOR, useClass: AiDiagnosticsContextInterceptor },
    AiMonitoringService,
    AiLogsService,
    AiDiagnosticsSettingsService,
  ],
  controllers: [AiLogsController],
  exports: [AiMonitoringService],
})
export class AiMonitoringModule {}
