import { TrainingLifecycleModule } from '../training-lifecycle/training-lifecycle.module';
import { Module } from '@nestjs/common';
import { UserPlanController } from './user-plan.controller';
import { UserPlanService } from './user-plan.service';

@Module({
  imports: [TrainingLifecycleModule],
  controllers: [UserPlanController],
  providers: [UserPlanService],
})
export class UserPlanModule {}
