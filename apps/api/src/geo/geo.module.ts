import { Module } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';
import { PlacesService } from './places.service';

/**
 * Geocoding condiviso, usato dai circoli e dagli indirizzi scritti a mano, e
 * Google Places per l'indirizzo dell'atleta scelto fra i suggerimenti.
 */
@Module({
  providers: [GeocodingService, PlacesService],
  exports: [GeocodingService, PlacesService],
})
export class GeoModule {}
