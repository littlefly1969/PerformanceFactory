import { OnboardingModule } from '../onboarding/onboarding.module';
import { AthleteJourneyService } from './athlete-journey.service';
import { AthleteJourneyController } from './athlete-journey.controller';
import { Module } from '@nestjs/common';
import { AiProposalModule } from '../ai-orchestrator/ai-proposal.module';
import { ConsentsModule } from '../consents/consents.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { AthleteRegistrationService } from './athlete-registration.service';

@Module({
  imports: [AiProposalModule, ConsentsModule, OnboardingModule],
  controllers: [DiscoveryController, AthleteJourneyController],
  providers: [
    DiscoveryService,
    AthleteRegistrationService,
    AthleteJourneyService,
  ],
  exports: [AthleteRegistrationService, AthleteJourneyService],
})
export class DiscoveryModule {}
