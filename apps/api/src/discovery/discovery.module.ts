import { OnboardingModule } from '../onboarding/onboarding.module';
import { AthleteJourneyService } from './athlete-journey.service';
import { AthleteJourneyController } from './athlete-journey.controller';
import { Module } from '@nestjs/common';
import { AiProposalModule } from '../ai-orchestrator/ai-proposal.module';
import { ConsentsModule } from '../consents/consents.module';
import { PartnersModule } from '../partners/partners.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { AthleteRegistrationService } from './athlete-registration.service';
import { CalibrationService } from './calibration/calibration.service';
import { CalibrationAdminController } from './calibration/calibration-admin.controller';

@Module({
  imports: [
    AiProposalModule,
    ConsentsModule,
    OnboardingModule,
    PartnersModule,
    AnalyticsModule,
  ],
  controllers: [
    DiscoveryController,
    AthleteJourneyController,
    CalibrationAdminController,
  ],
  providers: [
    DiscoveryService,
    AthleteRegistrationService,
    AthleteJourneyService,
    CalibrationService,
  ],
  exports: [
    AthleteRegistrationService,
    AthleteJourneyService,
    CalibrationService,
  ],
})
export class DiscoveryModule {}
