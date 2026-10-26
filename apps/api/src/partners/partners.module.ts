import { Module } from '@nestjs/common';
import { FeaturesModule } from '../features/features.module';
import { GeoModule } from '../geo/geo.module';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

@Module({
  imports: [FeaturesModule, GeoModule],
  controllers: [PartnersController],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule {}
