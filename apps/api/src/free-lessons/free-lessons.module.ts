import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { FeaturesModule } from '../features/features.module';
import { CoachLessonService } from './coach-lesson.service';
import { FreeLessonAdminService } from './free-lesson-admin.service';
import { FreeLessonService } from './free-lesson.service';
import {
  CoachLessonController,
  FreeLessonAdminController,
  FreeLessonController,
} from './free-lessons.controller';

@Module({
  imports: [AnalyticsModule, DiscoveryModule, FeaturesModule],
  controllers: [
    FreeLessonController,
    FreeLessonAdminController,
    CoachLessonController,
  ],
  providers: [FreeLessonService, FreeLessonAdminService, CoachLessonService],
})
export class FreeLessonsModule {}
