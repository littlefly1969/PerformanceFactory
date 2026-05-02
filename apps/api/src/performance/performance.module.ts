import { Module } from '@nestjs/common';
import { PerformanceController } from './performance.controller';
import { PerformanceService } from './performance.service';
import { AbacService } from '../common/policies/abac.service';

@Module({
  controllers: [PerformanceController],
  providers: [PerformanceService, AbacService],
})
export class PerformanceModule {}
