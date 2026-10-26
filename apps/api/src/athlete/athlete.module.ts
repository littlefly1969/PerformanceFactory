import { TrainingAvailabilityService } from './training-availability';
import { TrainingLifecycleModule } from '../training-lifecycle/training-lifecycle.module';
import { Module } from '@nestjs/common';
import { AthleteController } from './athlete.controller';
import { AthleteService } from './athlete.service';
import { ProfilePhotoService } from './profile-photo';
@Module({
  imports: [TrainingLifecycleModule],
  controllers: [AthleteController],
  providers: [AthleteService, TrainingAvailabilityService, ProfilePhotoService],
})
export class AthleteModule {}
