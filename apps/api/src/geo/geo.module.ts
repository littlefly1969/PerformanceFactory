import { Module } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';

/** Geocoding condiviso: lo usano il profilo dell'atleta e i circoli. */
@Module({
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeoModule {}
