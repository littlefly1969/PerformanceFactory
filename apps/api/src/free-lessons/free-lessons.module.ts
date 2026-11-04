import { Module } from '@nestjs/common';
import { AiProposalModule } from '../ai-orchestrator/ai-proposal.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { FeaturesModule } from '../features/features.module';
import { GeoModule } from '../geo/geo.module';
import { ClubAreaService } from './club-area';
import { CoachLessonService } from './coach-lesson.service';
import { FreeLessonAdminService } from './free-lesson-admin.service';
import { FreeLessonService } from './free-lesson.service';
import {
  CoachLessonController,
  FreeLessonAdminController,
  FreeLessonController,
} from './free-lessons.controller';

@Module({
  imports: [
    AiProposalModule,
    AnalyticsModule,
    DiscoveryModule,
    FeaturesModule,
    GeoModule,
  ],
  controllers: [
    FreeLessonController,
    FreeLessonAdminController,
    CoachLessonController,
  ],
  providers: [
    FreeLessonService,
    FreeLessonAdminService,
    CoachLessonService,
    ClubAreaService,
  ],
})
export class FreeLessonsModule {}
