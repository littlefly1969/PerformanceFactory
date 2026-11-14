import { Module } from '@nestjs/common';
import { ConsentsModule } from '../consents/consents.module';
import { FeaturesModule } from '../features/features.module';
import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';

@Module({
  imports: [ConsentsModule, FeaturesModule],
  controllers: [RankingController],
  providers: [RankingService],
})
export class RankingModule {}
