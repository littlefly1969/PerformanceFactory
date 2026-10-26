import { Module } from '@nestjs/common';
import { CoachingVideosController } from './coaching-videos.controller';
import { CoachingVideosService } from './coaching-videos';

@Module({
  controllers: [CoachingVideosController],
  providers: [CoachingVideosService],
})
export class CoachingVideosModule {}
