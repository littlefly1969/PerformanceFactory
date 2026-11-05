import { RegistrationReportService } from './registration-report.service';
import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, RegistrationReportService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
