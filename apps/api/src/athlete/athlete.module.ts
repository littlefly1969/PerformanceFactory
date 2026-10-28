import { TrainingAvailabilityService } from './training-availability';
import { AthleteAddressService } from './athlete-address';
import { GeoModule } from '../geo/geo.module';
import { PartnersModule } from '../partners/partners.module';
import { TrainingLifecycleModule } from '../training-lifecycle/training-lifecycle.module';
import { Module } from '@nestjs/common';
import { AthleteController } from './athlete.controller';
import { AthleteService } from './athlete.service';
import { ProfilePhotoService } from './profile-photo';
import { AddressLocationWorker } from './address-location.worker';
@Module({
  imports: [TrainingLifecycleModule, GeoModule, PartnersModule],
  controllers: [AthleteController],
  providers: [
    AthleteService,
    TrainingAvailabilityService,
    AthleteAddressService,
    ProfilePhotoService,
    AddressLocationWorker,
  ],
})
export class AthleteModule {}
