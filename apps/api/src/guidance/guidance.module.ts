import { Module } from '@nestjs/common';
import { GuidanceController } from './guidance.controller';
import { GuidanceService } from './guidance.service';
import { AbacService } from '../common/policies/abac.service';

@Module({
  controllers: [GuidanceController],
  providers: [GuidanceService, AbacService],
})
export class GuidanceModule {}
