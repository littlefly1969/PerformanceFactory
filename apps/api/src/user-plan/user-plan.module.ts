import { Module } from '@nestjs/common';
import { UserPlanController } from './user-plan.controller';
import { UserPlanService } from './user-plan.service';

@Module({
  controllers: [UserPlanController],
  providers: [UserPlanService],
})
export class UserPlanModule {}
