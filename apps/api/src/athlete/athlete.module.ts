import { TrainingAvailabilityService } from './training-availability';
import { AthleteAddressService } from './athlete-address';
import { GeoModule } from '../geo/geo.module';
import { TrainingLifecycleModule } from '../training-lifecycle/training-lifecycle.module';
import { Module } from '@nestjs/common';
import { AthleteController } from './athlete.controller';
import { AthleteService } from './athlete.service';
import { ProfilePhotoService } from './profile-photo';
@Module({
  imports: [TrainingLifecycleModule, GeoModule],
  controllers: [AthleteController],
  providers: [
    AthleteService,
    TrainingAvailabilityService,
    AthleteAddressService,
    ProfilePhotoService,
  ],
})
export class AthleteModule {}
