import { Module } from '@nestjs/common';
import { ConsentsModule } from '../consents/consents.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { AthleteRegistrationService } from './athlete-registration.service';

@Module({
  imports: [ConsentsModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService, AthleteRegistrationService],
  exports: [AthleteRegistrationService],
})
export class DiscoveryModule {}
