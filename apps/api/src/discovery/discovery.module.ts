import { FeaturesModule } from '../features/features.module';
import { PaymentsModule } from '../payments/payments.module';
import { ScenariosService } from './scenarios/scenarios.service';
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
import { QuizDraftService } from './quiz-draft.service';
import { AthleteRegistrationService } from './athlete-registration.service';
import { CalibrationService } from './calibration/calibration.service';
import { CalibrationAdminController } from './calibration/calibration-admin.controller';
import { ConfidencePolicyAdminController } from './calibration/confidence-policy-admin.controller';
import { AssessmentAnomalyAdminController } from './calibration/assessment-anomaly-admin.controller';

import { FitRankingController } from './fit-ranking/fit-ranking.controller';
import { FitRankingService } from './fit-ranking/fit-ranking.service';

@Module({
  imports: [
    AiProposalModule,
    ConsentsModule,
    OnboardingModule,
    PartnersModule,
    AnalyticsModule,
    FeaturesModule,
    PaymentsModule,
  ],
  controllers: [
    DiscoveryController,
    AthleteJourneyController,
    CalibrationAdminController,
    ConfidencePolicyAdminController,
    AssessmentAnomalyAdminController,
    FitRankingController,
  ],
  providers: [
    DiscoveryService,
    QuizDraftService,
    AthleteRegistrationService,
    AthleteJourneyService,
    CalibrationService,
    ScenariosService,
    FitRankingService,
  ],
  exports: [
    AthleteRegistrationService,
    AthleteJourneyService,
    CalibrationService,
  ],
})
export class DiscoveryModule {}
