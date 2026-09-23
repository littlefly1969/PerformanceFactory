import { TrainingAvailabilityService } from './training-availability';
import { TrainingLifecycleModule } from '../training-lifecycle/training-lifecycle.module';
import { Module } from '@nestjs/common';
import { AthleteController } from './athlete.controller';
import { AthleteService } from './athlete.service';
@Module({
  imports: [TrainingLifecycleModule],
  controllers: [AthleteController],
  providers: [AthleteService, TrainingAvailabilityService],
})
export class AthleteModule {}
